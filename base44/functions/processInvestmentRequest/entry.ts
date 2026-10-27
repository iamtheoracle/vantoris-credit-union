import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const REQUEST_TYPES = new Set(['deposit', 'withdrawal']);

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
    const requestType = body.request_type;
    const requestId = typeof body.request_id === 'string' ? body.request_id.trim() : '';
    const decision = body.decision;
    if (!REQUEST_TYPES.has(requestType) || !requestId || requestId.length > 200 || !['approve', 'decline'].includes(decision)) {
      return Response.json({ error: 'request_type, request_id and decision (approve or decline) are required' }, { status: 400 });
    }

    const requests = requestType === 'deposit'
      ? base44.asServiceRole.entities.InvestmentDepositRequest
      : base44.asServiceRole.entities.InvestmentWithdrawalRequest;
    const request = await requests.get(requestId).catch(() => null);
    if (!request) return Response.json({ error: 'Investment request not found' }, { status: 404 });
    if (request.status !== 'requested') {
      return Response.json({ error: 'Investment request is not awaiting review and cannot be processed again', status: request.status }, { status: 409 });
    }

    const reviewedAt = new Date().toISOString();
    const reviewNotes = typeof body.review_notes === 'string' ? body.review_notes.trim().slice(0, 2000) : '';
    if (decision === 'decline') {
      const rejected = await requests.updateMany(
        { id: request.id, status: 'requested' },
        { $set: { status: 'rejected', reviewed_by: user.id, reviewed_by_name: user.full_name || user.email || 'Admin', review_date: reviewedAt, review_notes: reviewNotes } }
      );
      if (rejected.updated !== 1) return Response.json({ error: 'Investment request changed concurrently; refresh before retrying' }, { status: 409 });
      return Response.json({ success: true, request_type: requestType, request_id: request.id, status: 'rejected' });
    }

    const amount = Number(request.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return Response.json({ error: 'Investment request amount must be a finite positive number' }, { status: 422 });
    }

    const claim = await requests.updateMany(
      { id: request.id, status: 'requested' },
      { $set: { status: 'processing', reviewed_by: user.id, reviewed_by_name: user.full_name || user.email || 'Admin', review_date: reviewedAt, review_notes: reviewNotes } }
    );
    if (claim.updated !== 1) return Response.json({ error: 'Investment request changed concurrently; refresh before retrying' }, { status: 409 });

    const portfolio = await base44.asServiceRole.entities.InvestmentPortfolio.get(request.portfolio_id).catch(() => null);
    if (!portfolio || portfolio.user_id !== request.user_id || portfolio.status !== 'active') {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Review blocked: portfolio missing, owner mismatch, or portfolio is not active' }).catch(() => {});
      return Response.json({ error: 'Portfolio ownership or active status could not be verified; no transfer was attempted' }, { status: 409 });
    }

    const accountId = requestType === 'deposit' ? request.source_account_id : request.destination_account_id;
    const account = accountId
      ? await base44.asServiceRole.entities.Account.get(accountId).catch(() => null)
      : null;
    if (!account || account.user_id !== request.user_id) {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Review blocked: linked bank account missing or owner mismatch' }).catch(() => {});
      return Response.json({ error: 'Linked bank account could not be verified for this member; no transfer was attempted' }, { status: 409 });
    }
    if (account.status !== 'active') {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Review blocked: linked bank account is not active' }).catch(() => {});
      return Response.json({ error: 'Linked bank account is not explicitly active; no transfer was attempted' }, { status: 409 });
    }

    const bankBalance = Number(account.balance ?? 0);
    const cashBalance = Number(portfolio.cash_balance ?? 0);
    const totalValue = Number(portfolio.total_value ?? 0);
    if (![bankBalance, cashBalance, totalValue].every(Number.isFinite)) {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Review blocked: one or more balances are invalid' }).catch(() => {});
      return Response.json({ error: 'One or more balances are invalid; no transfer was attempted' }, { status: 409 });
    }
    if (requestType === 'deposit' && bankBalance < amount) {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Insufficient source-account balance' }).catch(() => {});
      return Response.json({ error: 'Source account has insufficient available balance; no transfer was posted' }, { status: 409 });
    }
    if (requestType === 'withdrawal' && cashBalance < amount) {
      await requests.update(request.id, { status: 'requested', failure_reason: 'Insufficient portfolio cash balance' }).catch(() => {});
      return Response.json({ error: 'Portfolio has insufficient available cash; no transfer was posted' }, { status: 409 });
    }

    const nextBankBalance = Math.round((bankBalance + (requestType === 'deposit' ? -amount : amount)) * 100) / 100;
    const nextCashBalance = Math.round((cashBalance + (requestType === 'deposit' ? amount : -amount)) * 100) / 100;
    const nextTotalValue = Math.round((totalValue + (requestType === 'deposit' ? amount : -amount)) * 100) / 100;
    const transactionDate = new Date().toISOString().slice(0, 10);
    let bankTransaction: any = null;
    let investmentTransaction: any = null;

    try {
      bankTransaction = await base44.asServiceRole.entities.Transaction.create({
        account_id: account.id,
        user_id: request.user_id,
        type: requestType === 'deposit' ? 'withdrawal' : 'deposit',
        amount: requestType === 'deposit' ? -amount : amount,
        description: requestType === 'deposit' ? 'Transfer to investment portfolio' : 'Transfer from investment portfolio',
        reference: `INV-${requestType.toUpperCase()}-${request.id.slice(-8)}`,
        balance_after: nextBankBalance,
        created_by_admin: true,
        status: 'processing',
        source: 'admin_entry',
        transaction_date: transactionDate,
        posting_date: transactionDate,
      });
      investmentTransaction = await base44.asServiceRole.entities.InvestmentTransaction.create({
        portfolio_id: portfolio.id,
        user_id: request.user_id,
        type: requestType,
        amount,
        description: requestType === 'deposit' ? 'Bank transfer to investment cash' : 'Investment cash transfer to bank',
        status: 'processing',
        transaction_date: transactionDate,
        source: 'operator_entry',
      });

      const bankWrite = await base44.asServiceRole.entities.Account.updateMany(
        { id: account.id, balance: bankBalance, status: 'active' },
        { $set: { balance: nextBankBalance } }
      );
      if (bankWrite.updated !== 1) {
        await requests.update(request.id, { status: 'reconciliation_required', failure_reason: 'Bank balance/status changed concurrently before transfer' }).catch(() => {});
        return Response.json({ error: 'Bank account changed concurrently; request and ledger entries held for reconciliation', request_id: request.id, bank_transaction_id: bankTransaction.id, investment_transaction_id: investmentTransaction.id }, { status: 409 });
      }

      const portfolioWrite = await base44.asServiceRole.entities.InvestmentPortfolio.updateMany(
        { id: portfolio.id, cash_balance: cashBalance, total_value: totalValue, status: 'active' },
        { $set: { cash_balance: nextCashBalance, total_value: nextTotalValue } }
      );
      if (portfolioWrite.updated !== 1) {
        await requests.update(request.id, { status: 'reconciliation_required', failure_reason: 'Portfolio balance/status changed after bank-side write' }).catch(() => {});
        return Response.json({ error: 'Portfolio changed after bank-side posting; request and ledger entries held for manual reconciliation', request_id: request.id, bank_transaction_id: bankTransaction.id, investment_transaction_id: investmentTransaction.id }, { status: 409 });
      }

      await base44.asServiceRole.entities.Transaction.update(bankTransaction.id, { status: 'completed', balance_after: nextBankBalance });
      await base44.asServiceRole.entities.InvestmentTransaction.update(investmentTransaction.id, { status: 'completed' });
      const completed = await requests.updateMany(
        { id: request.id, status: 'processing' },
        { $set: { status: 'completed', completed_date: new Date().toISOString(), failure_reason: '' } }
      );
      if (completed.updated !== 1) {
        await requests.update(request.id, { status: 'reconciliation_required', failure_reason: 'Balances posted but request completion could not be confirmed' }).catch(() => {});
        return Response.json({ error: 'Transfer posted but request completion could not be confirmed; manual reconciliation required', request_id: request.id }, { status: 500 });
      }
    } catch (_error) {
      await requests.update(request.id, { status: 'reconciliation_required', failure_reason: 'Posting interrupted; inspect both balances and ledger entries before retrying' }).catch(() => {});
      return Response.json({
        error: 'Investment transfer did not complete cleanly. Request is held for manual reconciliation; do not retry automatically.',
        request_id: request.id,
        bank_transaction_id: bankTransaction?.id || null,
        investment_transaction_id: investmentTransaction?.id || null,
      }, { status: 500 });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action_type: requestType === 'deposit' ? 'investment_deposit_processed' : 'investment_withdrawal_processed',
      description: `Investment ${requestType} request ${request.id} completed by ${user.full_name || user.email || user.id}`,
      details: JSON.stringify({ amount, account_id: account.id, portfolio_id: portfolio.id, bank_transaction_id: bankTransaction.id, investment_transaction_id: investmentTransaction.id }),
      account_id: account.id,
      target_user_id: request.user_id,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    }).catch(() => {});

    return Response.json({
      success: true,
      request_type: requestType,
      request_id: request.id,
      status: 'completed',
      bank_transaction_id: bankTransaction.id,
      investment_transaction_id: investmentTransaction.id,
      bank_balance_after: nextBankBalance,
      portfolio_cash_after: nextCashBalance,
    });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Investment request processing failed' }, { status: 500 });
  }
}
