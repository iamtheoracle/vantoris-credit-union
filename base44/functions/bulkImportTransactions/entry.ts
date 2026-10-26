import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const VALID_TYPES = new Set(['deposit', 'withdrawal', 'adjustment', 'opening_balance']);
const PAGE_SIZE = 500;

function validDate(value) {
  if (value == null || value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : null;
}

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { transactions } = body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return Response.json({ error: 'A non-empty transactions array is required' }, { status: 400 });
    }
    if (transactions.length > 500) {
      return Response.json({ error: 'Maximum 500 transactions per import' }, { status: 400 });
    }

    // Read all account pages rather than silently ignoring accounts after the first 500.
    const accounts = [];
    let skip = 0;
    while (true) {
      const page = await base44.asServiceRole.entities.Account.filter({}, '-created_date', PAGE_SIZE, skip);
      const rows = Array.isArray(page) ? page : [];
      accounts.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    const accountMap = new Map();
    for (const account of accounts) {
      if (account.account_number) accountMap.set(String(account.account_number).trim(), account);
    }

    const created = [];
    const skipped = [];
    const errors = [];

    for (let i = 0; i < transactions.length; i++) {
      const txn = transactions[i] && typeof transactions[i] === 'object' ? transactions[i] : {};
      const rowNumber = i + 2;
      try {
        const account_number = txn.account_number == null ? '' : String(txn.account_number).trim();
        const type = String(txn.type || '').toLowerCase().trim();
        const amount = Number(txn.amount);
        const transactionDate = validDate(txn.transaction_date);

        if (!account_number || !type || txn.amount == null || txn.amount === '' || !Number.isFinite(amount)) {
          skipped.push({ row: rowNumber, reason: 'Missing or invalid account_number, type, or amount' });
          continue;
        }
        if (!VALID_TYPES.has(type)) {
          skipped.push({ row: rowNumber, reason: `Invalid type "${type}". Allowed: ${Array.from(VALID_TYPES).join(', ')}` });
          continue;
        }
        if (amount === 0 || (type !== 'adjustment' && amount < 0)) {
          skipped.push({ row: rowNumber, reason: 'Amount must be non-zero; only adjustment rows may use a signed amount' });
          continue;
        }
        if (transactionDate === null) {
          skipped.push({ row: rowNumber, reason: 'transaction_date must be a real calendar date in YYYY-MM-DD format' });
          continue;
        }

        const account = accountMap.get(account_number);
        if (!account) {
          skipped.push({ row: rowNumber, reason: `Account not found: ${account_number}` });
          continue;
        }
        if (['frozen', 'closed'].includes(String(account.status || '').toLowerCase())) {
          skipped.push({ row: rowNumber, reason: `Account is ${account.status} and cannot receive imported postings` });
          continue;
        }

        const amountToRecord = type === 'adjustment' ? amount : Math.abs(amount);
        const currentBalance = Number(account.balance ?? 0);
        if (!Number.isFinite(currentBalance)) {
          skipped.push({ row: rowNumber, reason: 'Account has an invalid current balance' });
          continue;
        }

        let balanceChange;
        if (type === 'withdrawal') balanceChange = -Math.abs(amount);
        else if (type === 'adjustment') balanceChange = amount;
        else balanceChange = Math.abs(amount);

        const newBalance = Math.round((currentBalance + balanceChange) * 100) / 100;
        if (newBalance < 0) {
          skipped.push({ row: rowNumber, reason: 'Import would create a negative account balance' });
          continue;
        }

        // Keep the record visibly in progress until its balance update succeeds.
        // This is still not atomic; interrupted rows must be reconciled, not retried blindly.
        const record = await base44.asServiceRole.entities.Transaction.create({
          account_id: account.id,
          user_id: account.user_id,
          type,
          amount: amountToRecord,
          description: typeof txn.description === 'string' ? txn.description.slice(0, 500) : '',
          reference: typeof txn.reference === 'string' ? txn.reference.slice(0, 120) : '',
          balance_after: newBalance,
          created_by_admin: true,
          transaction_date: transactionDate || undefined,
          posting_date: new Date().toISOString().slice(0, 10),
          source: 'historical_import',
          status: 'processing',
        });

        try {
          await base44.asServiceRole.entities.Account.update(account.id, { balance: newBalance });
          await base44.asServiceRole.entities.Transaction.update(record.id, {
            status: 'completed',
            balance_after: newBalance,
          });
        } catch (error) {
          errors.push({
            row: rowNumber,
            transaction_id: record.id,
            account_id: account.id,
            error: 'Posting interrupted. Transaction remains in processing for manual reconciliation; do not retry this row automatically.',
          });
          continue;
        }

        account.balance = newBalance;
        created.push({
          row: rowNumber,
          id: record.id,
          account_number,
          account_id: account.id,
          type,
          amount: amountToRecord,
          balance_after: newBalance,
          transaction_date: transactionDate || null,
        });
      } catch (error) {
        errors.push({ row: rowNumber, error: error?.message || 'Import row failed' });
      }
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'transaction_created',
      description: `Historical transaction import by ${user.full_name || user.email || user.id}: ${created.length} completed, ${skipped.length} skipped, ${errors.length} errors`,
      details: JSON.stringify({
        total: transactions.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
        source: 'historical_import',
      }),
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    });

    return Response.json({
      success: errors.length === 0,
      summary: {
        total: transactions.length,
        created: created.length,
        skipped: skipped.length,
        errors: errors.length,
      },
      created,
      skipped,
      errors,
    }, { status: errors.length ? 207 : 200 });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Transaction import failed' }, { status: 500 });
  }
}
