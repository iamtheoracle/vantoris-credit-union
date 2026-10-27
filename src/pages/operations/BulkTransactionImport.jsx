import React, { useState, useRef, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import {
  UploadCloud, FileSpreadsheet, Download, CheckCircle2,
  AlertTriangle, Loader2, ArrowRight, RotateCcw, FileUp,
} from 'lucide-react';

const VALID_TYPES = ['deposit', 'withdrawal', 'adjustment', 'opening_balance'];

export default function BulkTransactionImport() {
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parsedData, setParsedData] = useState(null);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [accountNumbers, setAccountNumbers] = useState(new Set());
  const fileRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const accounts = await base44.entities.Account.list('-created_date', 500);
        setAccountNumbers(new Set((accounts || []).map(a => String(a.account_number || '').trim())));
      } catch (e) { /* ignore — validation will be best-effort */ }
    })();
  }, []);

  const handleFileSelect = (e) => {
    const f = e.target.files[0];
    if (f) { setFile(f); setParsedData(null); setResults(null); setError(null); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) { setFile(f); setParsedData(null); setResults(null); setError(null); }
  };

  const handleParse = async () => {
    if (!file) return;
    setParsing(true);
    setError(null);
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.file_url;

      const extractRes = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url: fileUrl,
        json_schema: {
          type: 'object',
          properties: {
            account_number: { type: 'string' },
            type: { type: 'string' },
            amount: { type: 'number' },
            description: { type: 'string' },
            reference: { type: 'string' },
            transaction_date: { type: 'string' },
          },
          required: ['account_number', 'type', 'amount'],
        },
      });

      const output = extractRes.output || extractRes;
      const data = Array.isArray(output) ? output : (output.transactions || output.data || []);
      if (!data.length) {
        setError('No transactions found in file. Ensure your CSV has headers: account_number, type, amount, description, reference, transaction_date');
        setParsing(false);
        return;
      }
      setParsedData(data);
    } catch (e) {
      setError(e.message || 'Failed to parse file. Ensure it is a valid CSV or Excel file.');
    }
    setParsing(false);
  };

  const handleImport = async () => {
    setImporting(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('bulkImportTransactions', { transactions: parsedData });
      setResults(res.data || res);
      setParsedData(null);
      setFile(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Import failed');
    }
    setImporting(false);
  };

  const downloadTemplate = () => {
    const csv = [
      'account_number,type,amount,description,reference,transaction_date',
      '1234567890,deposit,5000.00,Monthly deposit,REF001,2026-08-01',
      '9876543210,withdrawal,1500.00,ATM withdrawal,REF002,2026-08-01',
      '1234567890,adjustment,-250.00,Fee adjustment,REF003,2026-08-01',
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'transaction_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const reset = () => {
    setFile(null);
    setParsedData(null);
    setResults(null);
    setError(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  // Validate parsed rows for preview
  const validatedRows = parsedData ? parsedData.map((row, i) => {
    const accNum = row.account_number ? String(row.account_number).trim() : '';
    const type = (row.type || '').toString().toLowerCase().trim();
    const amount = Number(row.amount);
    const issues = [];
    if (!accNum) issues.push('Missing account number');
    else if (!accountNumbers.has(accNum)) issues.push(`Account not found: ${accNum}`);
    if (!type) issues.push('Missing type');
    else if (!VALID_TYPES.includes(type)) issues.push(`Invalid type: ${type}`);
    if (isNaN(amount)) issues.push('Invalid amount');
    return { ...row, row: i + 2, valid: issues.length === 0, issues };
  }) : [];

  const validCount = validatedRows.filter(r => r.valid).length;
  const invalidCount = validatedRows.length - validCount;

  return (
    <OperationsPageLayout title="Bulk Transaction Import" description="Import transactions for multiple accounts at once" icon={FileUp}>
      {/* Error banner */}
      {error && (
        <div className="mb-4 p-4 rounded-xl bg-crimson/8 border border-crimson/20 flex items-start gap-3">
          <AlertTriangle size={18} className="text-crimson flex-shrink-0 mt-0.5" />
          <p className="text-sm text-crimson">{error}</p>
        </div>
      )}

      {/* Results summary */}
      {results && (
        <div className="mb-6">
          <div className="vantoris-glass-premium p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-mint/10 flex items-center justify-center">
                <CheckCircle2 size={24} className="text-mint" />
              </div>
              <div>
                <h3 className="text-foreground font-semibold text-lg">Import Complete</h3>
                <p className="text-gray text-sm">{results.summary.created} of {results.summary.total} transactions imported successfully</p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-5">
              <div className="text-center p-3 rounded-xl bg-mint/8">
                <p className="text-2xl font-bold text-mint">{results.summary.created}</p>
                <p className="text-xs text-gray mt-1">Created</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-warning/8">
                <p className="text-2xl font-bold text-warning">{results.summary.skipped}</p>
                <p className="text-xs text-gray mt-1">Skipped</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-crimson/8">
                <p className="text-2xl font-bold text-crimson">{results.summary.errors}</p>
                <p className="text-xs text-gray mt-1">Errors</p>
              </div>
              <div className="text-center p-3 rounded-xl bg-navy/8">
                <p className="text-2xl font-bold text-navy">{results.summary.total}</p>
                <p className="text-xs text-gray mt-1">Total Rows</p>
              </div>
            </div>

            {results.idempotent_replay && (
              <div role="status" className="mb-4 p-3 rounded-lg border border-mint/30 bg-mint/5 text-sm text-foreground">
                This exact batch was already processed. The saved result is being shown; no new transactions were posted by this retry.
              </div>
            )}

            {results.batch_id && (
              <p className="text-xs text-gray mb-3">Import batch reference: <code>{results.batch_id}</code></p>
            )}

            {results.audit_log_error && (
              <div role="alert" className="mb-4 p-3 rounded-lg border border-warning/30 bg-warning/5 text-sm text-warning">
                Ledger processing returned results, but the audit log could not be saved: {results.audit_log_error}. Do not re-import this file automatically; reconcile the listed results first.
              </div>
            )}

            {results.errors && results.errors.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-crimson uppercase tracking-wider mb-2">Posting Errors — Reconciliation Required</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {results.errors.map((item, i) => (
                    <div key={i} className="text-xs text-crimson p-2 rounded-lg bg-crimson/5">
                      <span className="font-medium">Row {item.row}:</span> {item.error || item.reason || 'Posting failed'}
                      {item.transaction_id ? <span> · Transaction {item.transaction_id}</span> : null}
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray mt-2">Do not retry rows marked as processing until their ledger and account balances have been reconciled.</p>
              </div>
            )}

            {results.skipped && results.skipped.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-gray uppercase tracking-wider mb-2">Skipped Rows</p>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {results.skipped.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-gray p-2 rounded-lg bg-slate-50">
                      <span className="font-medium text-gray">Row {s.row}:</span>
                      <span>{s.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <button onClick={reset} className="inline-flex items-center gap-2 px-5 py-2.5 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 transition-colors">
              <RotateCcw size={16} /> Import Another File
            </button>
          </div>
        </div>
      )}

      {/* Upload step */}
      {!results && !parsedData && (
        <div className="vantoris-card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-foreground font-semibold text-base">Step 1: Upload File</h3>
            <button onClick={downloadTemplate} className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-navy bg-navy/5 border border-navy/10 rounded-lg hover:bg-navy/10 transition-colors">
              <Download size={14} /> CSV Template
            </button>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-slate-300 rounded-2xl p-10 text-center cursor-pointer hover:border-brass/40 hover:bg-brass/5 transition-all"
          >
            <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFileSelect} className="hidden" />
            <div className="w-16 h-16 rounded-2xl bg-navy/8 flex items-center justify-center mx-auto mb-4">
              {file ? <FileSpreadsheet size={28} className="text-navy" /> : <UploadCloud size={28} className="text-gray" />}
            </div>
            {file ? (
              <>
                <p className="text-foreground font-medium text-sm">{file.name}</p>
                <p className="text-gray text-xs mt-1">{(file.size / 1024).toFixed(1)} KB · Click to change file</p>
              </>
            ) : (
              <>
                <p className="text-foreground font-medium text-sm">Drop CSV or Excel file here</p>
                <p className="text-gray text-xs mt-1">or click to browse · Max 500 rows</p>
              </>
            )}
          </div>

          {file && (
            <button
              onClick={handleParse}
              disabled={parsing}
              className="mt-4 w-full inline-flex items-center justify-center gap-2 px-5 py-3 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-50"
            >
              {parsing ? <><Loader2 size={16} className="animate-spin" /> Parsing file...</> : <><ArrowRight size={16} /> Parse & Preview</>}
            </button>
          )}

          <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200">
            <p className="text-xs text-gray font-medium mb-1">Required columns:</p>
            <p className="text-xs text-gray/70"><code className="text-navy font-medium">account_number</code>, <code className="text-navy font-medium">type</code> (deposit, withdrawal, adjustment, opening_balance), <code className="text-navy font-medium">amount</code></p>
            <p className="text-xs text-gray/70 mt-1">Optional: <code className="text-navy font-medium">description</code>, <code className="text-navy font-medium">reference</code>, <code className="text-navy font-medium">transaction_date</code></p>
          </div>
        </div>
      )}

      {/* Preview step */}
      {!results && parsedData && (
        <div className="vantoris-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-foreground font-semibold text-base">Step 2: Review & Import</h3>
              <p className="text-gray text-xs mt-0.5">{parsedData.length} transactions parsed · {validCount} valid · {invalidCount} need attention</p>
            </div>
            <button onClick={reset} className="text-xs text-gray hover:text-foreground font-medium">Start over</button>
          </div>

          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Row</th>
                  <th className="text-left text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Account</th>
                  <th className="text-left text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Type</th>
                  <th className="text-right text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Amount</th>
                  <th className="text-left text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Description</th>
                  <th className="text-left text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Date</th>
                  <th className="text-center text-gray text-xs font-medium uppercase tracking-wider py-3 px-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {validatedRows.slice(0, 100).map((row, i) => (
                  <tr key={i} className={`border-b border-slate-100 ${row.valid ? '' : 'bg-warning/5'}`}>
                    <td className="py-2.5 px-3 text-gray text-xs">{row.row}</td>
                    <td className="py-2.5 px-3 text-foreground text-xs font-medium">{row.account_number || '—'}</td>
                    <td className="py-2.5 px-3">
                      <span className={`text-xs font-medium ${
                        row.type === 'withdrawal' ? 'text-crimson' :
                        row.type === 'adjustment' ? 'text-warning' :
                        row.type === 'opening_balance' ? 'text-champagne' : 'text-mint'
                      }`}>{row.type || '—'}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-foreground text-xs font-semibold">{isNaN(Number(row.amount)) ? '—' : formatCurrency(Number(row.amount))}</td>
                    <td className="py-2.5 px-3 text-gray text-xs max-w-[200px] truncate">{row.description || '—'}</td>
                    <td className="py-2.5 px-3 text-gray text-xs">{row.transaction_date || '—'}</td>
                    <td className="py-2.5 px-3 text-center">
                      {row.valid ? (
                        <CheckCircle2 size={16} className="text-mint inline" />
                      ) : (
                        <span className="text-[10px] text-warning font-medium" title={row.issues.join('; ')}>⚠ {row.issues[0]}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {parsedData.length > 100 && (
            <p className="text-xs text-gray mt-3 text-center">Showing first 100 of {parsedData.length} rows</p>
          )}

          <div className="flex items-center gap-3 mt-5 pt-5 border-t border-slate-100">
            <button
              onClick={handleImport}
              disabled={importing || validCount === 0}
              className="inline-flex items-center gap-2 px-6 py-3 bg-navy text-white text-sm font-semibold rounded-xl hover:bg-navy/90 transition-colors disabled:opacity-50"
            >
              {importing ? <><Loader2 size={16} className="animate-spin" /> Importing...</> : <><ArrowRight size={16} /> Import {validCount} Transaction{validCount !== 1 ? 's' : ''}</>}
            </button>
            {invalidCount > 0 && (
              <p className="text-xs text-warning flex items-center gap-1">
                <AlertTriangle size={14} /> {invalidCount} row{invalidCount !== 1 ? 's' : ''} will be skipped
              </p>
            )}
          </div>
        </div>
      )}
    </OperationsPageLayout>
  );
}