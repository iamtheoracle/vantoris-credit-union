import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * Transaction Ledger Export
 * 
 * Exports HeroBox/Vantoris financial transactions to CSV format.
 * Supports monthly, weekly, daily, and manual exports.
 * Prevents duplicate exports by tracking the last exported transaction ID.
 * 
 * Per the HeroBox Platform Enhancement spec:
 * - One row per transaction with full ledger fields
 * - Append new records without overwriting historical data
 * - Maintain export history
 * - Log every export
 */
export default async function(req) {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    // Never interpret an anonymous request as a trusted scheduler. Scheduled
    // calls must present a separately configured bearer token; without it the
    // endpoint fails closed. Manual calls require an authenticated administrator.
    const configuredToken = Deno.env.get('TRANSACTION_EXPORT_SCHEDULER_TOKEN');
    const authorization = req.headers.get('authorization') || '';
    const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    const isScheduled = !user && Boolean(configuredToken) && suppliedToken === configuredToken;
    if (!user && !isScheduled) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    let {
      export_type = isScheduled ? 'monthly' : 'manual',
      format = 'csv',
      date_from,
      date_to,
    } = body;

    // For scheduled invocations, calculate the previous month's date range
    if (isScheduled && !date_from) {
      const now = new Date();
      const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      date_from = firstOfLastMonth.toISOString().split('T')[0];
      date_to = firstOfThisMonth.toISOString().split('T')[0];
    }

    // Create export record
    const exportRecord = await base44.asServiceRole.entities.TransactionExport.create({
      export_type,
      status: 'in_progress',
      format,
      date_from: date_from || null,
      date_to: date_to || null,
      exported_by: isScheduled ? null : user.id,
      exported_by_name: isScheduled ? 'Automated Scheduler' : user.full_name,
      rows_exported: 0,
      failed_rows: 0,
      retry_count: 0,
    });

    try {
      // Find last export to get the last transaction ID for deduplication
      const previousExports = await base44.asServiceRole.entities.TransactionExport.filter(
        { status: 'completed', format },
        '-created_date',
        1
      );
      const lastTransactionId = previousExports[0]?.last_transaction_id || null;

      // Build query for transactions
      const query = {};
      if (date_from || date_to) {
        query.transaction_date = {};
        if (date_from) query.transaction_date.$gte = date_from;
        if (date_to) query.transaction_date.$lte = date_to;
      }

      // Fetch transactions (paginated — up to 500 per page)
      let allTransactions = [];
      let hasMore = true;
      let skip = 0;
      while (hasMore) {
        const batch = await base44.asServiceRole.entities.Transaction.filter(
          query,
          '-created_date',
          500,
          skip
        );
        allTransactions = allTransactions.concat(batch);
        hasMore = batch.length === 500;
        skip += 500;
      }

      // Deduplicate: skip transactions already exported if no date range specified
      let transactionsToExport = allTransactions;
      if (lastTransactionId && !date_from) {
        const lastIdx = allTransactions.findIndex(t => t.id === lastTransactionId);
        if (lastIdx >= 0) {
          transactionsToExport = allTransactions.slice(0, lastIdx);
        }
      }

      // Fetch related accounts for enrichment
      const accountIds = [...new Set(transactionsToExport.map(t => t.account_id).filter(Boolean))];
      const accounts = accountIds.length > 0
        ? await base44.asServiceRole.entities.Account.filter({ id: { $in: accountIds } })
        : [];
      const accountMap = {};
      accounts.forEach(a => { accountMap[a.id] = a; });

      // Fetch related users for enrichment
      const userIds = [...new Set(transactionsToExport.map(t => t.created_by_id).filter(Boolean))];
      const users = userIds.length > 0
        ? await base44.asServiceRole.entities.User.filter({ id: { $in: userIds } })
        : [];
      const userMap = {};
      users.forEach(u => { userMap[u.id] = u; });

      // Build CSV
      const headers = [
        'Transaction ID', 'Transaction Date', 'Transaction Time', 'User',
        'Organization', 'Mission', 'Campaign', 'Package', 'Order Number',
        'Payment Method', 'Transaction Type', 'Currency', 'Amount', 'Fees',
        'Net Amount', 'Status', 'Reference', 'Description', 'Approval Status',
        'Created By', 'Last Updated', 'Export Timestamp'
      ];

      const escape = (val) => {
        if (val === null || val === undefined) return '';
        const str = String(val);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const now = new Date().toISOString();
      let rowsExported = 0;
      let failedRows = 0;

      const sheetDataRows = [];
      const csvRows = transactionsToExport.map(tx => {
        try {
          const account = accountMap[tx.account_id];
          const createdBy = userMap[tx.created_by_id];
          const txDate = tx.transaction_date || tx.created_date;
          const dateObj = new Date(txDate);

          const row = {
            'Transaction ID': tx.id || '',
            'Transaction Date': txDate ? dateObj.toLocaleDateString('en-US') : '',
            'Transaction Time': txDate ? dateObj.toLocaleTimeString('en-US') : '',
            'User': createdBy?.full_name || createdBy?.email || '',
            'Organization': account?.account_name || '',
            'Mission': '',
            'Campaign': '',
            'Package': tx.description?.includes('HeroBox') ? tx.description : '',
            'Order Number': tx.reference || '',
            'Payment Method': '',
            'Transaction Type': tx.type || '',
            'Currency': 'USD',
            'Amount': tx.amount || 0,
            'Fees': tx.type === 'fee' ? Math.abs(tx.amount || 0) : 0,
            'Net Amount': tx.type === 'withdrawal' || tx.type === 'fee' ? -(tx.amount || 0) : (tx.amount || 0),
            'Status': tx.type === 'opening_balance' ? 'completed' : 'completed',
            'Reference': tx.reference || '',
            'Description': tx.description || '',
            'Approval Status': 'approved',
            'Created By': createdBy?.full_name || '',
            'Last Updated': tx.updated_date ? new Date(tx.updated_date).toISOString() : '',
            'Export Timestamp': now,
          };
          rowsExported++;
          sheetDataRows.push(headers.map(h => row[h] ?? ''));
          return headers.map(h => escape(row[h])).join(',');
        } catch (e) {
          failedRows++;
          return '';
        }
      });

      const csv = [headers.map(escape).join(','), ...csvRows.filter(r => r)].join('\n');
      const lastTx = transactionsToExport[0];

      let fileUrl = null;
      let googleSheetId = null;
      let googleSheetUrl = null;

      if (format === 'google_sheets') {
        // Export to Google Sheets via the authorized shared connector
        const { accessToken } = await base44.asServiceRole.connectors.getConnection('googlesheets');
        const sheetTitle = `HeroBox Transaction Ledger — ${export_type} ${now.split('T')[0]}`;

        // 1. Create a new spreadsheet
        const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            properties: { title: sheetTitle },
            sheets: [{ properties: { title: 'Transactions' } }],
          }),
        });
        if (!createRes.ok) {
          const errBody = await createRes.text();
          throw new Error(`Google Sheets create failed: ${createRes.status} ${errBody}`);
        }
        const sheetData = await createRes.json();
        googleSheetId = sheetData.spreadsheetId;
        googleSheetUrl = sheetData.spreadsheetUrl;

        // 2. Write header + data rows in a single batch
        const values = [headers, ...sheetDataRows];
        const appendRes = await fetch(
          `https://sheets.googleapis.com/v4/spreadsheets/${googleSheetId}/values/Transactions!A1:append?valueInputOption=RAW&insertDataOption=OVERWRITE`,
          {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ values }),
          }
        );
        if (!appendRes.ok) {
          const errBody = await appendRes.text();
          throw new Error(`Google Sheets append failed: ${appendRes.status} ${errBody}`);
        }
      } else {
        // Upload as CSV file
        const csvBlob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const file = new File([csvBlob], `transaction_ledger_${export_type}_${now.split('T')[0]}.csv`, { type: 'text/csv' });
        const uploadResult = await base44.asServiceRole.integrations.Core.UploadFile({ file });
        fileUrl = uploadResult.file_url;
      }

      // Update export record
      const updated = await base44.asServiceRole.entities.TransactionExport.update(exportRecord.id, {
        status: 'completed',
        rows_exported: rowsExported,
        failed_rows: failedRows,
        file_url: fileUrl,
        google_sheet_id: googleSheetId,
        google_sheet_url: googleSheetUrl,
        last_transaction_id: lastTx?.id || null,
      });

      // Audit log
      await base44.asServiceRole.entities.AuditLog.create({
        action_type: 'transaction_export',
        description: `Exported ${rowsExported} transactions (${export_type} ${format})`,
        details: JSON.stringify({
          exportId: exportRecord.id,
          exportType: export_type,
          format,
          rowsExported,
          failedRows,
          dateFrom: date_from,
          dateTo: date_to,
        }),
        user_id: isScheduled ? null : user.id,
        admin_name: isScheduled ? 'Automated Scheduler' : user.full_name,
      });

      return Response.json({
        status: 'completed',
        exportId: exportRecord.id,
        rowsExported,
        failedRows,
        fileUrl,
        googleSheetUrl,
      });
    } catch (innerError) {
      // Mark export as failed
      await base44.asServiceRole.entities.TransactionExport.update(exportRecord.id, {
        status: 'failed',
        error_details: innerError.message,
      });
      throw innerError;
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}