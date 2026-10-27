import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import { exportToCsv } from '@/lib/exportCsv';
import StatusBadge from '@/components/vantoris/StatusBadge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Plus, Search, Download, History, ArrowLeft, ScrollText, Mail, Lock, Unlock, Upload } from 'lucide-react';
import { sendTransactionEmail } from '@/lib/transactionEmails';
import { useToast } from '@/components/ui/use-toast';

export default function AdminAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showTxn, setShowTxn] = useState(null);
  const [txnForm, setTxnForm] = useState({ type: 'deposit', amount: '', description: '', reference: '', transaction_date: '' });
  const [submitting, setSubmitting] = useState(false);
  const [viewingHistory, setViewingHistory] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loadingTxns, setLoadingTxns] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);
  const [toggleFreezeAccount, setToggleFreezeAccount] = useState(null);
  const [freezing, setFreezing] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    const accts = await base44.entities.Account.list('-created_date', 50);
    setAccounts(accts);
    setLoading(false);
  }

  async function viewHistory(acct) {
    setViewingHistory(acct);
    setLoadingTxns(true);
    try {
      const [txns, logs] = await Promise.all([
        base44.entities.Transaction.filter({ account_id: acct.id }, '-created_date', 200),
        base44.entities.AuditLog.filter({ account_id: acct.id }, '-created_date', 50),
      ]);
      setTransactions(txns);
      setAuditLogs(logs);
    } catch (e) {
      console.error(e);
      toast({ title: 'Failed to load history', description: e.message || 'Unable to load transaction history.', variant: 'destructive' });
    }
    setLoadingTxns(false);
  }

  async function handleAddTransaction() {
    if (!showTxn) return;
    setSubmitting(true);
    try {
      const amount = Number(txnForm.amount);
      if (!Number.isFinite(amount) || amount === 0 || (txnForm.type !== 'adjustment' && amount < 0)) {
        throw new Error('Enter a valid non-zero amount. Only adjustments may be negative.');
      }

      const signedAmount = txnForm.type === 'adjustment' ? amount : Math.abs(amount);
      const txnData = {
        account_id: showTxn.id,
        user_id: showTxn.user_id,
        type: txnForm.type,
        amount: signedAmount,
        description: txnForm.description,
        reference: txnForm.reference,
        created_by_admin: true,
        status: 'pending',
        source: 'admin_entry',
        posting_date: new Date().toISOString().slice(0, 10),
      };
      if (txnForm.transaction_date) txnData.transaction_date = txnForm.transaction_date;

      const created = await base44.entities.Transaction.create(txnData);
      const result = await base44.functions.invoke('approveTransaction', {
        transaction_id: created.id,
        decision: 'approve',
      });
      if (result?.data?.error) throw new Error(result.data.error);
      if (!result?.data?.success || result?.data?.status !== 'completed') {
        throw new Error('Posting outcome was not confirmed. Check transaction status before retrying.');
      }

      try {
        await sendTransactionEmail({
          user_id: showTxn.user_id,
          account: showTxn,
          type: txnForm.type,
          amount: Math.abs(amount),
          description: txnForm.description,
          newBalance: result.data.balance_after,
        });
      } catch (emailError) {
        console.error('Transaction posted, but email delivery failed:', emailError);
      }

      setShowTxn(null);
      setTxnForm({ type: 'deposit', amount: '', description: '', reference: '', transaction_date: '' });
      await loadAccounts();
      toast({ title: 'Transaction posted', description: `${formatCurrency(Math.abs(amount))} ${txnForm.type} posted successfully.` });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Posting outcome requires review',
        description: e.message || 'Check the ledger status before retrying to avoid duplicate posting.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExportCsv() {
    if (!viewingHistory) return;
    setExporting(true);
    try {
      const txns = transactions.length > 0 ? transactions : await base44.entities.Transaction.filter({ account_id: viewingHistory.id }, '-created_date', 200);
      const headers = ['Date', 'Type', 'Description', 'Reference', 'Amount', 'Balance After'];
      const rows = txns.map(t => ({
        Date: (t.transaction_date || t.created_date).split('T')[0],
        Type: t.type,
        Description: t.description || '',
        Reference: t.reference || '',
        Amount: t.amount,
        'Balance After': t.balance_after,
      }));
      exportToCsv(`account_${viewingHistory.account_number}_transactions`, headers, rows);
      toast({ title: 'Export complete', description: 'Transactions exported to CSV.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Export failed', description: e.message || 'Unable to export CSV.', variant: 'destructive' });
    }
    setExporting(false);
  }

  async function handleToggleFreeze(account) {
    setToggleFreezeAccount(account);
    setFreezing(true);
    try {
      const result = await base44.functions.invoke('setAccountStatus', { account_id: account.id });
      if (result?.data?.error) throw new Error(result.data.error);
      if (!result?.data?.success) throw new Error('Account status change was not confirmed.');
      const newStatus = result.data.status;

      setToggleFreezeAccount(null);
      await loadAccounts();
      if (viewingHistory) viewHistory({ ...viewingHistory, status: newStatus });
      toast({ title: newStatus === 'frozen' ? 'Account frozen' : 'Account unfrozen', description: `${account.account_name} is now ${newStatus}.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Action failed', description: e.message || 'Refresh and verify account status before retrying.', variant: 'destructive' });
    } finally {
      setFreezing(false);
    }
  }

  async function handleImportTransactions(file) {
    if (!file) return;
    setImporting(true);
    try {
      const csvText = await file.text();
      const lines = csvText.split('\n').map(line => line.trim()).filter(Boolean);
      if (lines.length < 2) throw new Error('CSV must include a header and at least one transaction.');

      // The server performs authoritative validation, idempotency, account status
      // checks, ledger posting and reconciliation tracking for this legacy import UI.
      const headers = lines[0].split(',').map(header => header.trim().toLowerCase());
      const dateIdx = headers.indexOf('date');
      const typeIdx = headers.indexOf('type');
      const descIdx = headers.indexOf('description');
      const refIdx = headers.indexOf('reference');
      const amountIdx = headers.indexOf('amount');
      const accountIdx = headers.indexOf('account_number');
      if ([dateIdx, typeIdx, amountIdx, accountIdx].some(index => index < 0)) {
        throw new Error('CSV must include date, type, amount, and account_number columns.');
      }

      const rows = [];
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(part => part.trim());
        rows.push({
          transaction_date: parts[dateIdx] || '',
          type: parts[typeIdx] || '',
          description: descIdx >= 0 ? parts[descIdx] || '' : '',
          reference: refIdx >= 0 ? parts[refIdx] || '' : '',
          amount: parts[amountIdx],
          account_number: parts[accountIdx] || '',
        });
      }

      const result = await base44.functions.invoke('bulkImportTransactions', { transactions: rows });
      if (result?.data?.error) throw new Error(result.data.error);
      const data = result?.data || {};
      const createdCount = Array.isArray(data.created) ? data.created.length : (data.created_count || 0);
      const errorCount = (data.errors?.length || 0) + (data.skipped?.length || 0);
      setShowImport(false);
      await loadAccounts();
      toast({
        title: data.idempotent_replay ? 'Import result recovered' : 'Import processed',
        description: `${createdCount} rows posted; ${errorCount} skipped or require review. Batch: ${data.batch_id || 'see server result'}.`,
      });
    } catch (e) {
      console.error(e);
      toast({
        title: 'Import requires review',
        description: e.message || 'Check the import batch status before retrying to avoid duplicate posting.',
        variant: 'destructive',
      });
    } finally {
      setImporting(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
    </div>;
  }

  const filtered = accounts.filter(a =>
    (a.account_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (a.account_number || '').toLowerCase().includes(search.toLowerCase())
  );

  // History View
  if (viewingHistory) {
    return (
      <div>
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setViewingHistory(null)} className="text-[#AAB4C3] hover:text-white transition-all">
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{viewingHistory.account_name}</h1>
            <p className="text-[#AAB4C3] text-sm font-mono">{viewingHistory.account_number}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="vantoris-card p-5">
            <p className="text-[#AAB4C3] text-xs mb-1">Current Balance</p>
            <p className="text-white font-bold text-2xl">{formatCurrency(viewingHistory.balance)}</p>
          </div>
          <div className="vantoris-card p-5">
            <p className="text-[#AAB4C3] text-xs mb-1">Account Type</p>
            <p className="text-white font-semibold text-lg">{viewingHistory.account_type}</p>
          </div>
          <div className="vantoris-card p-5">
            <p className="text-[#AAB4C3] text-xs mb-1">Status</p>
            <StatusBadge status={viewingHistory.status} />
          </div>
        </div>

        <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
          <div>
            <h2 className="text-white font-semibold text-lg">Transaction History</h2>
            <div className="flex items-center gap-2 mt-1">
              {viewingHistory.status === 'frozen' && (
                <span className="flex items-center gap-1 px-2.5 py-1 bg-crimson/15 text-red-400 rounded-lg text-xs font-medium">
                  <Lock size={12} /> Account Frozen
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleToggleFreeze(viewingHistory)}
              disabled={freezing}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all ${
                viewingHistory.status === 'frozen'
                  ? 'bg-olive/15 text-emerald-400 hover:bg-olive/25'
                  : 'bg-crimson/15 text-red-400 hover:bg-crimson/25'
              } disabled:opacity-40`}
            >
              {viewingHistory.status === 'frozen' ? <Unlock size={14} /> : <Lock size={14} />}
              {freezing ? 'Processing...' : viewingHistory.status === 'frozen' ? 'Unfreeze' : 'Freeze Account'}
            </button>
            <button
              onClick={() => { setShowTxn(viewingHistory); setTxnForm({ type: 'deposit', amount: '', description: '', reference: '', transaction_date: '' }); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-brass/15 text-brass rounded-xl text-xs font-medium hover:bg-brass/25 transition-all"
            >
              <Plus size={14} /> Add Transaction
            </button>
            <button
              onClick={handleExportCsv}
              disabled={exporting || transactions.length === 0}
              className="flex items-center gap-1.5 px-4 py-2 bg-olive/15 text-emerald-400 rounded-xl text-xs font-medium hover:bg-olive/25 transition-all disabled:opacity-40"
            >
              <Download size={14} /> {exporting ? 'Exporting...' : 'Export CSV'}
            </button>
          </div>
        </div>

        <div className="hidden md:block vantoris-card overflow-hidden">
          {loadingTxns ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#242D38] bg-[#1a2535]">
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Type</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Description</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Reference</th>
                  <th className="text-right text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Amount</th>
                  <th className="text-right text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Balance</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Action</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map(txn => (
                  <tr key={txn.id} className="border-b border-[#242D38]/40 hover:bg-[#242D38]/20 transition-all">
                    <td className="px-5 py-3 text-[#AAB4C3] text-xs">
                      {(txn.transaction_date || txn.created_date).split('T')[0]}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        txn.type === 'deposit' || txn.type === 'opening_balance' ? 'bg-emerald-500/10 text-emerald-400' :
                        txn.type === 'withdrawal' ? 'bg-red-500/10 text-red-400' :
                        'bg-brass/10 text-brass'
                      }`}>
                        {txn.type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-white text-xs">{txn.description || '—'}</td>
                    <td className="px-5 py-3 text-[#AAB4C3] text-xs font-mono">{txn.reference || '—'}</td>
                    <td className={`px-5 py-3 text-right font-semibold text-xs ${
                      (txn.amount || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                    }`}>
                      {formatCurrency(txn.amount)}
                    </td>
                    <td className="px-5 py-3 text-right text-white text-xs font-medium">
                      {txn.balance_after != null ? formatCurrency(txn.balance_after) : '—'}
                    </td>
                    <td className="px-5 py-3">
                      <span className="text-[#AAB4C3] text-[10px]">Ledger entry locked</span>
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr><td colSpan={7} className="py-12 text-center text-[#AAB4C3]">No transactions found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Mobile Transaction Cards */}
        <div className="md:hidden space-y-3">
          {loadingTxns ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
            </div>
          ) : (
            <>
              {transactions.map(txn => (
                <div key={txn.id} className="vantoris-card p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      txn.type === 'deposit' || txn.type === 'opening_balance' ? 'bg-emerald-500/10 text-emerald-400' :
                      txn.type === 'withdrawal' ? 'bg-red-500/10 text-red-400' :
                      'bg-brass/10 text-brass'
                    }`}>{txn.type.replace('_', ' ')}</span>
                    <span className="text-[#AAB4C3] text-xs">{(txn.transaction_date || txn.created_date).split('T')[0]}</span>
                  </div>
                  <p className="text-white text-xs">{txn.description || '—'}</p>
                  {txn.reference && <p className="text-[#AAB4C3] text-xs font-mono">{txn.reference}</p>}
                  <div className="flex items-center justify-between">
                    <span className={`font-semibold text-sm ${(txn.amount || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{formatCurrency(txn.amount)}</span>
                    <span className="text-white text-xs font-medium">{txn.balance_after != null ? formatCurrency(txn.balance_after) : '—'}</span>
                  </div>
                  <span className="text-[#AAB4C3] text-[10px]">Ledger entry locked</span>
                </div>
              ))}
              {transactions.length === 0 && <p className="text-center text-[#AAB4C3] py-8">No transactions found</p>}
            </>
          )}
        </div>

        {/* Audit Trail */}
        {auditLogs.length > 0 && (
          <div className="mt-6">
            <div className="flex items-center gap-2 mb-3">
              <ScrollText size={16} className="text-brass" />
              <h2 className="text-white font-semibold text-lg">Audit Trail</h2>
              <span className="text-[#AAB4C3] text-xs">{auditLogs.length} entries</span>
            </div>
            <div className="vantoris-card p-4 space-y-3">
              {auditLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 pb-3 border-b border-[#242D38]/60 last:border-0 last:pb-0">
                  <div className="w-2 h-2 rounded-full bg-brass mt-1.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium">{log.description}</p>
                    <p className="text-[#AAB4C3] text-xs mt-0.5">
                      {log.admin_name} • {new Date(log.created_date).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    {log.details && <p className="text-[#AAB4C3]/70 text-xs mt-1">{log.details}</p>}
                    {(log.balance_before != null || log.balance_after != null) && (
                      <p className="text-[#AAB4C3]/50 text-[11px] mt-0.5 font-mono">
                        {log.balance_before != null && `Before: ${formatCurrency(log.balance_before)}`}
                        {log.balance_before != null && log.balance_after != null && ' → '}
                        {log.balance_after != null && `After: ${formatCurrency(log.balance_after)}`}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Add Transaction Dialog (reused in history view) */}
        <Dialog open={!!showTxn} onOpenChange={() => setShowTxn(null)}>
          <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
            <DialogHeader>
              <DialogTitle className="text-white">Add Transaction</DialogTitle>
            </DialogHeader>
            {showTxn && <TransactionForm txnForm={txnForm} setTxnForm={setTxnForm} submitting={submitting} onSubmit={handleAddTransaction} account={viewingHistory} />}
          </DialogContent>
        </Dialog>


      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Accounts</h1>
      <p className="text-[#AAB4C3] text-sm mb-6">{accounts.length} total accounts</p>

      <div className="relative mb-6">
        <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AAB4C3]" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search accounts..."
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
        />
      </div>

      <div className="flex justify-end mb-6">
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 px-4 py-2.5 bg-olive/15 text-emerald-400 rounded-xl text-xs font-medium hover:bg-olive/25 transition-all"
        >
          <Upload size={14} /> Import CSV
        </button>
      </div>

      <div className="hidden md:block vantoris-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#242D38] bg-[#1a2535]">
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Account</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Number</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Type</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Balance</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(acct => (
              <tr key={acct.id} className="border-b border-[#242D38]/40 hover:bg-[#242D38]/20 transition-all">
                <td className="px-5 py-4 text-white font-medium">{acct.account_name}</td>
                <td className="px-5 py-4 text-[#AAB4C3] font-mono text-xs">{acct.account_number}</td>
                <td className="px-5 py-4 text-white">{acct.account_type}</td>
                <td className="px-5 py-4 text-white font-semibold">{formatCurrency(acct.balance)}</td>
                <td className="px-5 py-4"><StatusBadge status={acct.status} /></td>
                <td className="px-5 py-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => viewHistory(acct)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-[#242D38] text-[#AAB4C3] rounded-lg text-xs font-medium hover:bg-[#242D38]/80 hover:text-white transition-all"
                    >
                      <History size={12} /> History
                    </button>
                    <button
                      onClick={() => { setShowTxn(acct); setTxnForm({ type: 'deposit', amount: '', description: '', reference: '', transaction_date: '' }); }}
                      className="flex items-center gap-1 px-3 py-1.5 bg-brass/15 text-brass rounded-lg text-xs font-medium hover:bg-brass/25 transition-all"
                    >
                      <Plus size={12} /> Add Txn
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-[#AAB4C3]">No accounts found</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(acct => (
          <div key={acct.id} className="vantoris-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-white font-medium text-sm">{acct.account_name}</p>
              <StatusBadge status={acct.status} />
            </div>
            <p className="text-[#AAB4C3] font-mono text-xs">{acct.account_number}</p>
            <div className="flex items-center justify-between">
              <span className="text-white text-xs">{acct.account_type}</span>
              <span className="text-white font-semibold">{formatCurrency(acct.balance)}</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => viewHistory(acct)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#242D38] text-[#AAB4C3] rounded-lg text-xs font-medium">
                <History size={12} /> History
              </button>
              <button onClick={() => { setShowTxn(acct); setTxnForm({ type: 'deposit', amount: '', description: '', reference: '', transaction_date: '' }); }} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-brass/15 text-brass rounded-lg text-xs font-medium">
                <Plus size={12} /> Add Txn
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-[#AAB4C3] py-8">No accounts found</p>}
      </div>

      <Dialog open={!!showTxn} onOpenChange={() => setShowTxn(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Add Transaction</DialogTitle>
          </DialogHeader>
          {showTxn && <TransactionForm txnForm={txnForm} setTxnForm={setTxnForm} submitting={submitting} onSubmit={handleAddTransaction} account={showTxn} />}
        </DialogContent>
      </Dialog>

      {/* CSV Import Dialog */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Upload size={18} className="text-olive" /> Import Transactions
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div className="vantoris-card p-4 bg-olive/5 border border-olive/20">
              <p className="text-[#AAB4C3] text-xs mb-2"><strong>CSV Format Required:</strong></p>
              <p className="text-[#AAB4C3] text-xs font-mono">date,type,description,reference,amount,account_number</p>
              <p className="text-[#AAB4C3] text-xs mt-2 mb-1"><strong>Example:</strong></p>
              <p className="text-[#AAB4C3] text-xs font-mono">2025-01-15,deposit,Wire deposit,WT-001,5000,ACC-00001</p>
              <p className="text-[#AAB4C3] text-xs mt-2">• Date: YYYY-MM-DD format</p>
              <p className="text-[#AAB4C3] text-xs">• Type: deposit, withdrawal, or adjustment</p>
              <p className="text-[#AAB4C3] text-xs">• Amount: positive number (signs added automatically)</p>
            </div>
            <div>
              <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-2 block">Select CSV File</label>
              <input
                type="file"
                accept=".csv"
                onChange={e => {
                  if (e.target.files?.[0]) {
                    handleImportTransactions(e.target.files[0]);
                  }
                }}
                disabled={importing}
                className="w-full px-4 py-3 bg-[#242D38] border border-[#242D38] rounded-xl text-[#AAB4C3] text-sm focus:border-olive/50 focus:outline-none disabled:opacity-40 cursor-pointer"
              />
            </div>
            {importing && (
              <div className="flex items-center gap-2 text-olive text-xs">
                <div className="w-4 h-4 border-2 border-olive/30 border-t-olive rounded-full animate-spin" />
                <span>Importing transactions...</span>
              </div>
            )}
            <button
              onClick={() => setShowImport(false)}
              disabled={importing}
              className="w-full py-2.5 bg-[#242D38] text-[#AAB4C3] rounded-xl text-sm font-medium hover:text-white transition-all disabled:opacity-40"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionForm({ txnForm, setTxnForm, submitting, onSubmit, account, isEdit }) {
  return (
    <div className="space-y-4 mt-2">
      <div className="vantoris-card p-3">
        <p className="text-white text-sm font-medium">{account.account_name}</p>
        <p className="text-[#AAB4C3] text-xs">Balance: {formatCurrency(account.balance)}</p>
      </div>
      <div>
        <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Type</label>
        <select
          value={txnForm.type}
          onChange={e => setTxnForm({ ...txnForm, type: e.target.value })}
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
        >
          <option value="deposit">Deposit</option>
          <option value="withdrawal">Withdrawal</option>
          <option value="adjustment">Adjustment</option>
          {!isEdit && <option value="opening_balance">Opening Balance</option>}
        </select>
      </div>
      <div>
        <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Amount (USD)</label>
        <input
          type="number"
          value={txnForm.amount}
          onChange={e => setTxnForm({ ...txnForm, amount: e.target.value })}
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
          placeholder="0.00"
        />
      </div>
      <div>
        <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Description</label>
        <input
          value={txnForm.description}
          onChange={e => setTxnForm({ ...txnForm, description: e.target.value })}
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
          placeholder="e.g. Wire deposit from client"
        />
      </div>
      <div>
        <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Reference</label>
        <input
          value={txnForm.reference}
          onChange={e => setTxnForm({ ...txnForm, reference: e.target.value })}
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
          placeholder="e.g. WT-2025-001"
        />
      </div>
      <div>
        <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">
          Transaction Date {isEdit ? '' : '(optional — for backdating)'}
        </label>
        <input
          type="date"
          value={txnForm.transaction_date}
          onChange={e => setTxnForm({ ...txnForm, transaction_date: e.target.value })}
          className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
        />
      </div>
      <button
        disabled={!txnForm.amount || submitting}
        onClick={onSubmit}
        className="w-full py-3 bg-brass text-[#0E1A2B] font-semibold rounded-xl disabled:opacity-40"
      >
        {submitting ? 'Processing...' : isEdit ? 'Save Changes' : 'Add Transaction'}
      </button>
    </div>
  );
}