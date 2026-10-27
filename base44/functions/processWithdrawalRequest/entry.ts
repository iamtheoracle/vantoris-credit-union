import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'A JSON object is required' }, { status: 400 });
    }

    const requestId = typeof body.withdrawal_request_id === 'string' ? body.withdrawal_request_id.trim() : '';
    const decision = body.decision;
    const notes = typeof body.admin_notes === 'string' ? body.admin_notes.trim().slice(0, 2000) : '';
    if (!requestId || requestId.length > 200 || !['approve', 'decline'].includes(decision)) {
      return Response.json({ error: 'withdrawal_request_id and decision (approve or decline) are required' }, { status: 400 });
    }

    const requests = base44.asServiceRole.entities.WithdrawalRequest;
    const request = await requests.get(requestId).catch(() => null);
    if (!request) return Response.json({ error: 'Withdrawal request not found' }, { status: 404 });
    if (request.status !== 'pending') {
      return Response.json({ error: 'Withdrawal request is not pending and cannot be processed again', status: request.status }, { status: 409 });
    }

    if (decision === 'decline') {
      const claim = await requests.updateMany(
        { id: request.id, status: 'pending' },
        { $set: { status: 'rejected', admin_notes: notes } }
      );
      if (claim.updated !== 1) return Response.json({ error: 'Withdrawal request changed concurrently; refresh before retrying' }, { status: 409 });

      await base44.asServiceRole.entities.Notification.create({
        user_id: request.user_id,
        title: 'Withdrawal Rejected',
        message: 'Your withdrawal request was not approved. Please review the request for details.',
        type: 'warning',
      }).catch(() => {});
      await base44.asServiceRole.entities.AuditLog.create({
        action_type: 'withdrawal_rejected',
        description: `Withdrawal request ${request.id} rejected by ${user.full_name || user.email || user.id}`,
        details: notes || 'No reason provided',
        account_id: request.account_id,
        target_user_id: request.user_id,
        user_id: user.id,
        admin_name: user.full_name || user.email || 'Admin',
      }).catch(() => {});
      return Response.json({ success: true, decision, withdrawal_request_id: request.id, status: 'rejected' });
    }

    const amount = Number(request.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Withdrawal amount must be a finite positive number' }, { status: 422 });
    }

    const claim = await requests.updateMany(
      { id: request.id, status: 'pending' },
      { $set: { status: 'processing', admin_notes: notes } }
    );
    if (claim.updated !== 1) return Response.json({ error: 'Withdrawal request changed concurrently; refresh before retrying' }, { status: 409 });

    const account = await base44.asServiceRole.entities.Account.get(request.account_id).catch(() => null);
    if (!account || account.user_id !== request.user_id) {
      await requests.update(request.id, { status: 'reconciliation_required' }).catch(() => {});
      return Response.json({ error: 'Withdrawal account is missing or does not belong to the requesting member; manual reconciliation required', withdrawal_request_id: request.id }, { status: 409 });
    }
    if (account.status !== 'active') {
      await requests.update(request.id, { status: 'reconciliation_required' }).catch(() => {});
      return Response.json({ error: 'Withdrawal account is not explicitly active; manual reconciliation required', withdrawal_request_id: request.id }, { status: 409 });
    }

    const currentBalance = Number(account.balance ?? 0);
    if (!Number.isFinite(currentBalance) || currentBalance < amount) {
      await requests.update(request.id, { status: 'pending' }).catch(() => {});
      return Response.json({ error: 'Insufficient available balance or invalid account balance; request was not posted' }, { status: 409 });
    }
    const nextBalance = Math.round((currentBalance - amount) * 100) / 100;

    let transaction;
    try {
      transaction = await base44.asServiceRole.entities.Transaction.create({
        account_id: account.id,
        user_id: request.user_id,
        type: 'withdrawal',
        amount: -amount,
        description: `Withdrawal - ${request.method}`,
        reference: `WD-${request.id.slice(-6)}`,
        balance_after: nextBalance,
        created_by_admin: true,
        status: 'processing',
        source: 'admin_entry',
        transaction_date: new Date().toISOString().slice(0, 10),
        posting_date: new Date().toISOString().slice(0, 10),
      });

      const balanceWrite = await base44.asServiceRole.entities.Account.updateMany(
        { id: account.id, balance: currentBalance, status: 'active' },
        { $set: { balance: nextBalance } }
      );
      if (balanceWrite.updated !== 1) {
        await requests.update(request.id, { status: 'reconciliation_required' }).catch(() => {});
        return Response.json({
          error: 'Account balance or status changed concurrently. Withdrawal is held for reconciliation; do not retry automatically.',
          withdrawal_request_id: request.id,
          transaction_id: transaction.id,
        }, { status: 409 });
      }

      await base44.asServiceRole.entities.Transaction.update(transaction.id, { status: 'completed', balance_after: nextBalance });
      const finalRequest = await requests.updateMany(
        { id: request.id, status: 'processing' },
        { $set: { status: 'paid', admin_notes: notes } }
      );
      if (finalRequest.updated !== 1) {
        await requests.update(request.id, { status: 'reconciliation_required' }).catch(() => {});
        return Response.json({
          error: 'Balance was posted but request completion could not be confirmed; manual reconciliation required.',
          withdrawal_request_id: request.id,
          transaction_id: transaction.id,
        }, { status: 500 });
      }
    } catch (_error) {
      await requests.update(request.id, { status: 'reconciliation_required' }).catch(() => {});
      return Response.json({
        error: 'Withdrawal posting did not complete cleanly. Request is held for manual reconciliation; do not retry automatically.',
        withdrawal_request_id: request.id,
        transaction_id: transaction?.id || null,
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.Notification.create({
      user_id: request.user_id,
      title: 'Withdrawal Processed',
      message: `Your withdrawal of ${amount.toFixed(2)} via ${request.method} has been processed.`,
      type: 'success',
      status: 'completed',
    }).catch(() => {});
    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'withdrawal_processed',
      description: `Withdrawal request ${request.id} processed by ${user.full_name || user.email || user.id}`,
      details: JSON.stringify({ transaction_id: transaction.id, amount, balance_before: currentBalance, balance_after: nextBalance, notes }),
      account_id: account.id,
      target_user_id: request.user_id,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    }).catch(() => {});

    return Response.json({
      success: true,
      decision,
      withdrawal_request_id: request.id,
      transaction_id: transaction.id,
      status: 'paid',
      balance_after: nextBalance,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Withdrawal processing failed' }, { status: 500 });
  }
}
