import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const PENDING = new Set(['pending', 'requested', 'review', '']);
const SUPPORTED_TYPES = new Set(['deposit', 'withdrawal', 'opening_balance', 'interest', 'fee', 'adjustment']);

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'A JSON object is required' }, { status: 400 });
    }
    const transactionId = typeof body.transaction_id === 'string' ? body.transaction_id.trim() : '';
    const decision = body.decision;
    if (!transactionId || !['approve', 'decline'].includes(decision)) {
      return Response.json({ error: 'transaction_id and decision (approve or decline) are required' }, { status: 400 });
    }

    const txn = await base44.asServiceRole.entities.Transaction.get(transactionId).catch(() => null);
    if (!txn) return Response.json({ error: 'Transaction not found' }, { status: 404 });

    const status = String(txn.status || 'pending').toLowerCase();
    if (!PENDING.has(status)) {
      return Response.json({ error: 'Transaction is not pending and cannot be processed again', status }, { status: 409 });
    }

    const storedStatus = typeof txn.status === 'string' ? txn.status : 'pending';
    if (decision === 'decline') {
      const claim = await base44.asServiceRole.entities.Transaction.updateMany(
        { id: txn.id, status: storedStatus },
        { $set: { status: 'declined' } }
      );
      if (claim.updated !== 1) {
        return Response.json({ error: 'Transaction changed concurrently; refresh before making another decision' }, { status: 409 });
      }
      await base44.asServiceRole.entities.AuditLog.create({
        action_type: 'transaction_declined',
        description: `Transaction ${txn.id} declined by ${user.full_name || user.email || user.id}`,
        target_user_id: txn.user_id || null,
        user_id: user.id,
        admin_name: user.full_name || user.email || 'Admin',
      }).catch(() => {});
      return Response.json({ success: true, decision, transaction_id: txn.id, status: 'declined' });
    }

    if (String(txn.type || '').toLowerCase() === 'send') {
      const sender = txn.account_id
        ? await base44.asServiceRole.entities.Account.get(txn.account_id).catch(() => null)
        : null;
      if (!sender || !txn.user_id || sender.user_id !== txn.user_id) {
        return Response.json({ error: 'Sender account ownership could not be verified; transfer blocked' }, { status: 422 });
      }
      if (sender.status !== 'active') return Response.json({ error: 'Sender account is not active; transfer blocked' }, { status: 409 });

      const recipientUserId = typeof txn.counterparty_user_id === 'string' ? txn.counterparty_user_id.trim() : '';
      if (!recipientUserId || recipientUserId === txn.user_id) {
        return Response.json({ error: 'A verified, different recipient member is required for internal transfers' }, { status: 422 });
      }
      const recipientAccounts = await base44.asServiceRole.entities.Account.filter(
        { user_id: recipientUserId, status: 'active' },
        '-created_date',
        100
      ).catch(() => []);
      if (!Array.isArray(recipientAccounts) || recipientAccounts.length !== 1) {
        return Response.json({ error: 'Recipient must have exactly one active account so the destination is unambiguous; no transfer was posted' }, { status: 409 });
      }
      const recipient = recipientAccounts[0];
      if (!recipient || recipient.user_id !== recipientUserId || recipient.id === sender.id) {
        return Response.json({ error: 'Recipient account could not be verified; transfer blocked' }, { status: 422 });
      }

      const signedAmount = Number(txn.amount);
      if (!Number.isFinite(signedAmount) || signedAmount >= 0) {
        return Response.json({ error: 'Internal transfer amount must be a finite negative sender debit' }, { status: 422 });
      }
      const amount = Math.abs(signedAmount);
      const senderBalance = Number(sender.balance ?? 0);
      const recipientBalance = Number(recipient.balance ?? 0);
      if (![senderBalance, recipientBalance].every(Number.isFinite)) {
        return Response.json({ error: 'Sender or recipient balance is invalid; transfer blocked' }, { status: 422 });
      }
      if (senderBalance < amount) return Response.json({ error: 'Insufficient available balance for this transfer' }, { status: 409 });

      const nextSenderBalance = Math.round((senderBalance - amount) * 100) / 100;
      const nextRecipientBalance = Math.round((recipientBalance + amount) * 100) / 100;
      const claim = await base44.asServiceRole.entities.Transaction.updateMany(
        { id: txn.id, status: storedStatus },
        { $set: { status: 'processing' } }
      );
      if (claim.updated !== 1) {
        return Response.json({ error: 'Transfer changed concurrently; refresh and reconcile before retrying' }, { status: 409 });
      }

      let recipientTxn: any = null;
      try {
        recipientTxn = await base44.asServiceRole.entities.Transaction.create({
          account_id: recipient.id,
          user_id: recipientUserId,
          type: 'transfer',
          amount,
          description: `Transfer received from ${txn.user_id}`,
          reference: `TR-${txn.id.slice(-8)}`,
          balance_after: nextRecipientBalance,
          created_by_admin: true,
          status: 'processing',
          source: 'admin_entry',
          transfer_direction: 'in',
          counterparty: txn.user_id,
          counterparty_user_id: txn.user_id,
          counterparty_account_id: sender.id,
          transaction_date: new Date().toISOString().slice(0, 10),
          posting_date: new Date().toISOString().slice(0, 10),
        });

        const debit = await base44.asServiceRole.entities.Account.updateMany(
          { id: sender.id, user_id: txn.user_id, balance: senderBalance, status: 'active' },
          { $set: { balance: nextSenderBalance } }
        );
        if (debit.updated !== 1) {
          return Response.json({
            error: 'Sender account changed concurrently. Both transfer records remain in processing for reconciliation; do not retry automatically.',
            transaction_id: txn.id,
            recipient_transaction_id: recipientTxn.id,
          }, { status: 409 });
        }

        const credit = await base44.asServiceRole.entities.Account.updateMany(
          { id: recipient.id, user_id: recipientUserId, balance: recipientBalance, status: 'active' },
          { $set: { balance: nextRecipientBalance } }
        );
        if (credit.updated !== 1) {
          return Response.json({
            error: 'Sender debit succeeded but recipient credit did not. Both transfer records remain in processing for manual reconciliation; do not retry automatically.',
            transaction_id: txn.id,
            recipient_transaction_id: recipientTxn.id,
          }, { status: 409 });
        }

        await base44.asServiceRole.entities.Transaction.update(txn.id, {
          status: 'completed',
          balance_after: nextSenderBalance,
          transfer_direction: 'out',
          counterparty_account_id: recipient.id,
        });
        await base44.asServiceRole.entities.Transaction.update(recipientTxn.id, { status: 'completed', balance_after: nextRecipientBalance });
      } catch (_error) {
        return Response.json({
          error: 'Internal transfer did not complete cleanly. Inspect both accounts and ledger records before retrying.',
          transaction_id: txn.id,
          recipient_transaction_id: recipientTxn?.id || null,
        }, { status: 500 });
      }

      await base44.asServiceRole.entities.AuditLog.create({
        action_type: 'transaction_approved',
        description: `Internal transfer ${txn.id} posted by ${user.full_name || user.email || user.id}`,
        details: JSON.stringify({ sender_account_id: sender.id, recipient_account_id: recipient.id, amount, sender_balance_after: nextSenderBalance, recipient_balance_after: nextRecipientBalance, recipient_transaction_id: recipientTxn.id }),
        target_user_id: recipientUserId,
        user_id: user.id,
        admin_name: user.full_name || user.email || 'Admin',
      }).catch(() => {});
      await base44.asServiceRole.entities.Notification.create({
        user_id: recipientUserId,
        title: 'Transfer received',
        message: `You received a transfer of ${amount.toFixed(2)}.`,
        type: 'info',
        status: 'completed',
      }).catch(() => {});

      return Response.json({
        success: true,
        decision,
        transaction_id: txn.id,
        recipient_transaction_id: recipientTxn.id,
        status: 'completed',
        balance_after: nextSenderBalance,
        recipient_balance_after: nextRecipientBalance,
      });
    }

    if (!SUPPORTED_TYPES.has(String(txn.type || '').toLowerCase())) {
      return Response.json({
        error: `Transaction type "${txn.type}" is not supported for direct ledger approval. Use the configured payment/transfer workflow.`,
      }, { status: 422 });
    }

    const account = txn.account_id
      ? await base44.asServiceRole.entities.Account.get(txn.account_id).catch(() => null)
      : null;
    if (!account) return Response.json({ error: 'The transaction account could not be verified' }, { status: 422 });
    if (String(account.status || '').toLowerCase() !== 'active') {
      return Response.json({ error: 'Account is not explicitly active; posting blocked' }, { status: 409 });
    }
    if (txn.user_id && account.user_id && txn.user_id !== account.user_id) {
      return Response.json({ error: 'Transaction owner does not match the account owner; posting blocked for reconciliation' }, { status: 409 });
    }

    const type = String(txn.type || '').toLowerCase();
    const amount = Number(txn.amount);
    if (!Number.isFinite(amount) || amount === 0 || (type !== 'adjustment' && amount < 0)) {
      return Response.json({ error: 'Transaction amount is invalid' }, { status: 422 });
    }

    // Base44 documents updateMany with a single-record id plus matching conditions
    // as an atomic claim. This prevents two approvals from claiming the same pending row.
    const claim = await base44.asServiceRole.entities.Transaction.updateMany(
      { id: txn.id, status: storedStatus },
      { $set: { status: 'processing' } }
    );
    if (claim.updated !== 1) {
      return Response.json({ error: 'Transaction changed concurrently; refresh and reconcile before retrying' }, { status: 409 });
    }

    const currentBalance = Number(account.balance ?? 0);
    if (!Number.isFinite(currentBalance)) {
      return Response.json({ error: 'Account balance is invalid; transaction left in processing for operator reconciliation' }, { status: 422 });
    }

    let delta;
    if (type === 'adjustment') delta = amount;
    else if (['withdrawal', 'fee'].includes(type)) delta = -Math.abs(amount);
    else delta = Math.abs(amount);

    const nextBalance = Math.round((currentBalance + delta) * 100) / 100;
    if (nextBalance < 0) {
      // Restore the pending state only before any account mutation has occurred.
      await base44.asServiceRole.entities.Transaction.update(txn.id, { status: 'pending' }).catch(() => {});
      return Response.json({ error: 'Insufficient available balance for this posting' }, { status: 409 });
    }

    try {
      // Compare-and-swap the balance so two different transactions cannot overwrite
      // one another's balance from a stale read. A lost race is held for reconciliation.
      const balanceWrite = await base44.asServiceRole.entities.Account.updateMany(
        { id: account.id, balance: currentBalance, status: 'active' },
        { $set: { balance: nextBalance } }
      );
      if (balanceWrite.updated !== 1) {
        return Response.json({
          error: 'Account balance or status changed concurrently. Transaction remains in processing for reconciliation; do not retry automatically.',
          transaction_id: txn.id,
        }, { status: 409 });
      }
      await base44.asServiceRole.entities.Transaction.update(txn.id, {
        status: 'completed',
        balance_after: nextBalance,
      });
    } catch (error) {
      // Do not reset to pending: the account update may have succeeded. Manual
      // reconciliation is safer than a retry that could post the same amount twice.
      return Response.json({
        error: 'Posting did not complete cleanly. Transaction is held for operator reconciliation; do not retry automatically.',
        transaction_id: txn.id,
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'transaction_approved',
      description: `Transaction ${txn.id} posted by ${user.full_name || user.email || user.id}`,
      details: JSON.stringify({ account_id: account.id, type, amount, balance_after: nextBalance }),
      target_user_id: txn.user_id || account.user_id || null,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    }).catch(() => {});

    if (txn.user_id) {
      await base44.asServiceRole.entities.Notification.create({
        user_id: txn.user_id,
        title: 'Transaction approved',
        message: `Posted: ${txn.description || txn.type}.`,
        type: 'info',
        status: 'completed',
      }).catch(() => {});
    }

    return Response.json({
      success: true,
      decision,
      transaction_id: txn.id,
      status: 'completed',
      balance_after: nextBalance,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Transaction approval failed' }, { status: 500 });
  }
}
