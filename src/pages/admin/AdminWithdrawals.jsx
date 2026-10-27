import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import StatusBadge from '@/components/vantoris/StatusBadge';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  CheckSquare, Square, Check, X, ArrowUpRight, CheckCircle2, AlertTriangle, Loader2,
  ShieldCheck, Search, Filter, Download, Flag, ChevronRight, XCircle, Clock, DollarSign,
  TrendingUp, ListChecks, UserCheck, FileText, Ban, ArrowRight,
} from 'lucide-react';
import { logAuditEntry } from '@/lib/auditLogger';
import { sendTransactionEmail } from '@/lib/transactionEmails';
import { useToast } from '@/components/ui/use-toast';
import { Link } from 'react-router-dom';

const STATUS_FILTERS = ['all', 'pending', 'processing', 'paid', 'rejected', 'reconciliation_required'];
const METHOD_FILTERS = ['All Methods', 'ACH Transfer', 'Domestic Wire', 'International Wire', 'External Transfer', 'Check by Mail', "Cashier's Check"];
const BULK_ACTIONS = [
  { id: 'pay', label: 'Approve', icon: Check, color: 'bg-mint text-white hover:bg-mint/90' },
  { id: 'reject', label: 'Reject', icon: X, color: 'bg-crimson text-white hover:bg-crimson/90' },
  { id: 'flag', label: 'Flag', icon: Flag, color: 'bg-brass/15 text-brass hover:bg-brass/25' },
  { id: 'escalate', label: 'Escalate', icon: ArrowUpRight, color: 'bg-crimson/10 text-crimson hover:bg-crimson/20' },
  { id: 'export', label: 'Export', icon: Download, color: 'bg-slate-100 text-gray hover:bg-slate-200' },
];

export default function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkAction, setBulkAction] = useState(null);
  const [bulkNotes, setBulkNotes] = useState('');
  const [limits, setLimits] = useState([]);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState('All Methods');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showFilters, setShowFilters] = useState(true);

  const { toast } = useToast();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [wds, accts, lmts] = await Promise.all([
      base44.entities.WithdrawalRequest.list('-created_date', 200),
      base44.entities.Account.list('-created_date', 200),
      base44.entities.WithdrawalLimit.list('-created_date', 10),
    ]);
    setWithdrawals(wds);
    setAccounts(accts);
    setLimits(lmts);
    setLoading(false);
  }

  function getAccount(id) { return accounts.find(a => a.id === id); }

  function checkWithdrawalLimit(acct, amount) {
    if (!acct) return null;
    const limit = limits.find(l => l.account_type === acct.account_type && l.enabled);
    if (!limit) return null;
    const violations = [];
    if (limit.single_limit && amount > limit.single_limit) {
      violations.push(`Exceeds single limit: ${formatCurrency(limit.single_limit)}`);
    }
    return violations.length > 0 ? violations : null;
  }

  // Apply filters
  const filteredWithdrawals = useMemo(() => {
    let filtered = [...withdrawals];
    if (statusFilter !== 'all') filtered = filtered.filter(w => w.status === statusFilter);
    if (methodFilter !== 'All Methods') filtered = filtered.filter(w => w.method === methodFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter(w => {
        const acct = getAccount(w.account_id);
        return acct?.account_name?.toLowerCase().includes(q) || acct?.account_number?.includes(q) || w.method?.toLowerCase().includes(q);
      });
    }
    if (minAmount) filtered = filtered.filter(w => Math.abs(w.amount) >= parseFloat(minAmount));
    if (maxAmount) filtered = filtered.filter(w => Math.abs(w.amount) <= parseFloat(maxAmount));
    return filtered;
  }, [withdrawals, statusFilter, methodFilter, search, minAmount, maxAmount, accounts]);

  const pendingWds = filteredWithdrawals.filter(w => w.status === 'pending');
  const selectedWithdrawals = selectedIds.map(id => withdrawals.find(w => w.id === id)).filter(Boolean);
  const selectedTotal = selectedWithdrawals.reduce((sum, w) => sum + Math.abs(w.amount), 0);

  // Summary stats
  const summary = useMemo(() => {
    const total = filteredWithdrawals.length;
    const pending = filteredWithdrawals.filter(w => w.status === 'pending').length;
    const paid = filteredWithdrawals.filter(w => w.status === 'paid').length;
    const rejected = filteredWithdrawals.filter(w => w.status === 'rejected').length;
    const totalAmount = filteredWithdrawals.filter(w => w.status === 'pending').reduce((s, w) => s + Math.abs(w.amount), 0);
    const flagged = filteredWithdrawals.filter(w => checkWithdrawalLimit(getAccount(w.account_id), Math.abs(w.amount))).length;
    return { total, pending, paid, rejected, totalAmount, flagged };
  }, [filteredWithdrawals, accounts, limits]);

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }
  function toggleSelectAll() {
    const eligible = pendingWds.map(w => w.id);
    if (eligible.length > 0 && eligible.every(id => selectedIds.includes(id))) {
      setSelectedIds(prev => prev.filter(id => !eligible.includes(id)));
    } else {
      setSelectedIds(prev => [...new Set([...prev, ...eligible])]);
    }
  }
  function selectFiltered() {
    setSelectedIds(filteredWithdrawals.filter(w => w.status === 'pending').map(w => w.id));
  }

  async function payOne(wd, notes) {
    const result = await base44.functions.invoke('processWithdrawalRequest', {
      withdrawal_request_id: wd.id,
      decision: 'approve',
      admin_notes: notes || '',
    });
    if (result?.data?.error) throw new Error(result.data.error);
    if (!result?.data?.success || result?.data?.status !== 'paid') {
      throw new Error('Withdrawal outcome was not confirmed. Check the request status before retrying.');
    }

    // Email is best-effort and must not turn a confirmed posting into a reported payment failure.
    const account = getAccount(wd.account_id);
    if (account) {
      try {
        await sendTransactionEmail({
          user_id: wd.user_id,
          account,
          type: 'withdrawal',
          amount: Math.abs(wd.amount),
          description: `Withdrawal - ${wd.method}`,
          newBalance: result.data.balance_after,
        });
      } catch (emailError) {
        console.error('Withdrawal posted, but transaction email failed:', emailError);
      }
    }
  }

  async function rejectOne(wd, notes) {
    const result = await base44.functions.invoke('processWithdrawalRequest', {
      withdrawal_request_id: wd.id,
      decision: 'decline',
      admin_notes: notes || '',
    });
    if (result?.data?.error) throw new Error(result.data.error);
    if (!result?.data?.success || result?.data?.status !== 'rejected') {
      throw new Error('Withdrawal rejection was not confirmed. Refresh the request before retrying.');
    }
  }

  async function handlePay() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await payOne(selected, adminNotes);
      setSelected(null); setAdminNotes(''); loadData();
      toast({ title: 'Withdrawal processed', description: `${formatCurrency(Math.abs(selected.amount))} paid via ${selected.method}.` });
    } catch (e) {
      toast({ title: 'Payment failed', description: e.message, variant: 'destructive' });
    }
    setSubmitting(false);
  }

  async function handleReject() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await rejectOne(selected, adminNotes);
      setSelected(null); setAdminNotes(''); loadData();
      toast({ title: 'Withdrawal rejected' });
    } catch (e) {
      toast({ title: 'Rejection failed', description: e.message, variant: 'destructive' });
    }
    setSubmitting(false);
  }

  async function executeBulkAction() {
    if (!bulkAction || selectedIds.length === 0) return;
    setSubmitting(true);
    let ok = 0, fail = 0;
    const isPay = bulkAction === 'pay';
    const isReject = bulkAction === 'reject';
    for (const id of selectedIds) {
      const wd = withdrawals.find(w => w.id === id);
      if (!wd) continue;
      try {
        if (isPay) {
          await payOne(wd, bulkNotes || 'Bulk approved');
        } else if (isReject) {
          await rejectOne(wd, bulkNotes || 'Bulk rejected');
        } else {
          // Flag/escalate/export — log and notify
          await logAuditEntry({
            action_type: `withdrawal_${bulkAction}`,
            description: `Withdrawal ${bulkAction}: ${formatCurrency(Math.abs(wd.amount))} via ${wd.method}`,
            details: `Request ID: ${wd.id}, Action: ${bulkAction}, Notes: ${bulkNotes || 'None'}`,
            account_id: wd.account_id, amount: -Math.abs(wd.amount), target_user_id: wd.user_id,
          });
        }
        ok++;
      } catch (e) { console.error('Bulk action failed for', id, e); fail++; }
    }
    setSelectedIds([]); setBulkMode(false); setBulkAction(null); setBulkNotes('');
    loadData();
    toast({
      title: `Bulk ${bulkAction} complete`,
      description: `${ok} processed${fail > 0 ? `, ${fail} failed` : ''}.`,
    });
    setSubmitting(false);
  }

  function clearFilters() {
    setSearch(''); setStatusFilter('all'); setMethodFilter('All Methods');
    setMinAmount(''); setMaxAmount('');
  }

  const activeFilterCount = [statusFilter !== 'all', methodFilter !== 'All Methods', minAmount, maxAmount, search.trim()].filter(Boolean).length;

  if (loading) {
    return (
      <OperationsPageLayout title="Withdrawals" description="Enterprise withdrawal management workspace" icon={ArrowUpRight}>
        <div className="flex items-center justify-center h-96">
          <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
        </div>
      </OperationsPageLayout>
    );
  }

  return (
    <OperationsPageLayout
      title="Withdrawals"
      description="Enterprise withdrawal management workspace"
      icon={ArrowUpRight}
      breadcrumb="Operations · Payments"
      actions={
        <Link to="/operations/withdrawal-audit-log" className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray hover:text-navy transition-colors">
          <ShieldCheck size={14} /> Audit Trail
        </Link>
      }
    >
      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_300px] gap-4">
        {/* === LEFT: Advanced Filters === */}
        <div className={`${showFilters ? 'block' : 'hidden'} lg:block`}>
          <div className="vantoris-glass-premium p-4 sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Filter size={15} className="text-navy" />
                <h3 className="text-foreground font-semibold text-sm">Filters</h3>
                {activeFilterCount > 0 && (
                  <span className="px-1.5 py-0.5 bg-brass/15 text-brass rounded text-[9px] font-bold">{activeFilterCount}</span>
                )}
              </div>
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="text-[10px] text-gray hover:text-crimson font-medium">Clear</button>
              )}
            </div>

            <div className="space-y-4">
              {/* Search */}
              <div>
                <label className="text-gray text-[10px] uppercase tracking-wider font-semibold mb-1.5 block">Search</label>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Account, number..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-navy/20"
                  />
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="text-gray text-[10px] uppercase tracking-wider font-semibold mb-1.5 block">Status</label>
                <div className="grid grid-cols-2 gap-1">
                  {STATUS_FILTERS.map(s => (
                    <button
                      key={s}
                      onClick={() => setStatusFilter(s)}
                      className={`px-2 py-1.5 rounded-lg text-[10px] font-semibold capitalize transition-all ${
                        statusFilter === s ? 'bg-navy text-white' : 'bg-slate-50 text-gray hover:bg-slate-100'
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>

              {/* Method */}
              <div>
                <label className="text-gray text-[10px] uppercase tracking-wider font-semibold mb-1.5 block">Method</label>
                <select
                  value={methodFilter}
                  onChange={e => setMethodFilter(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-navy/20"
                >
                  {METHOD_FILTERS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>

              {/* Amount Range */}
              <div>
                <label className="text-gray text-[10px] uppercase tracking-wider font-semibold mb-1.5 block">Amount Range</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={minAmount}
                    onChange={e => setMinAmount(e.target.value)}
                    placeholder="Min"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-navy/20"
                  />
                  <span className="text-gray text-xs">—</span>
                  <input
                    type="number"
                    value={maxAmount}
                    onChange={e => setMaxAmount(e.target.value)}
                    placeholder="Max"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-navy/20"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* === CENTER: Table + Bulk Toolbar === */}
        <div className="min-w-0">
          {/* Sticky Bulk Action Toolbar */}
          <div className="vantoris-glass-header sticky top-0 z-20 mb-3 p-3 rounded-xl">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                {!bulkMode ? (
                  <button
                    onClick={() => { setBulkMode(true); setSelectedIds([]); }}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-navy text-white rounded-xl text-xs font-semibold hover:bg-navy/90 transition-colors"
                  >
                    <CheckSquare size={14} /> Bulk Actions
                  </button>
                ) : (
                  <>
                    <button
                      onClick={toggleSelectAll}
                      className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-navy bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
                    >
                      {pendingWds.length > 0 && pendingWds.every(w => selectedIds.includes(w.id)) ? <CheckSquare size={14} className="text-mint" /> : <Square size={14} />}
                      Select All Pending
                    </button>
                    <button onClick={selectFiltered} className="text-[10px] text-gray hover:text-navy font-medium underline">
                      Select all filtered ({pendingWds.length})
                    </button>
                    {selectedIds.length > 0 && (
                      <span className="text-xs text-gray">
                        <span className="font-semibold text-foreground">{selectedIds.length}</span> selected · {formatCurrency(selectedTotal)}
                      </span>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-2">
                {bulkMode && selectedIds.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {BULK_ACTIONS.map(action => {
                      const Icon = action.icon;
                      return (
                        <button
                          key={action.id}
                          onClick={() => setBulkAction(action.id)}
                          disabled={submitting}
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold transition-all disabled:opacity-40 ${action.color}`}
                        >
                          <Icon size={12} /> {action.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {bulkMode && (
                  <button onClick={() => { setBulkMode(false); setSelectedIds([]); }} className="px-3 py-2 text-xs font-medium text-gray hover:text-foreground">
                    Cancel
                  </button>
                )}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="lg:hidden px-3 py-2 text-xs font-medium text-gray hover:text-foreground"
                >
                  <Filter size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Interactive Table (Desktop) */}
          <div className="hidden md:block vantoris-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    {bulkMode && <th className="px-3 py-3 w-10"><button onClick={toggleSelectAll} className="text-gray hover:text-mint">{pendingWds.length > 0 && pendingWds.every(w => selectedIds.includes(w.id)) ? <CheckSquare size={16} className="text-mint" /> : <Square size={16} />}</button></th>}
                    <th className="text-left text-gray text-xs font-semibold uppercase tracking-wider px-4 py-3">Account</th>
                    <th className="text-left text-gray text-xs font-semibold uppercase tracking-wider px-4 py-3">Amount</th>
                    <th className="text-left text-gray text-xs font-semibold uppercase tracking-wider px-4 py-3">Method</th>
                    <th className="text-left text-gray text-xs font-semibold uppercase tracking-wider px-4 py-3">Date</th>
                    <th className="text-left text-gray text-xs font-semibold uppercase tracking-wider px-4 py-3">Status</th>
                    <th className="px-4 py-3 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredWithdrawals.map(wd => {
                    const acct = getAccount(wd.account_id);
                    const isPending = wd.status === 'pending';
                    const isSelected = selectedIds.includes(wd.id);
                    const isFlagged = checkWithdrawalLimit(acct, Math.abs(wd.amount));
                    return (
                      <tr
                        key={wd.id}
                        className={`border-b border-slate-100 hover:bg-slate-50/70 transition-all cursor-pointer ${isSelected ? 'bg-brass/5' : ''} ${selected?.id === wd.id ? 'bg-navy/5' : ''}`}
                        onClick={() => !bulkMode && setSelected(wd)}
                      >
                        {bulkMode && (
                          <td className="px-3 py-4" onClick={e => { e.stopPropagation(); isPending && toggleSelect(wd.id); }}>
                            {isPending ? (isSelected ? <CheckSquare size={16} className="text-mint" /> : <Square size={16} className="text-gray" />) : <span className="inline-block w-4" />}
                          </td>
                        )}
                        <td className="px-4 py-4">
                          <p className="text-foreground font-medium">{acct?.account_name || '—'}</p>
                          <p className="text-gray text-xs font-mono">{acct?.account_number || '—'}</p>
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex items-center gap-2">
                            <span className="text-foreground font-semibold">{formatCurrency(Math.abs(wd.amount))}</span>
                            {isFlagged && <span className="px-1.5 py-0.5 bg-crimson/10 text-crimson rounded text-[9px] font-bold">FLAG</span>}
                          </div>
                        </td>
                        <td className="px-4 py-4 text-gray text-xs">{wd.method}</td>
                        <td className="px-4 py-4 text-gray text-xs">{new Date(wd.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                        <td className="px-4 py-4"><StatusBadge status={wd.status} /></td>
                        <td className="px-4 py-4"><ChevronRight size={14} className="text-gray/40" /></td>
                      </tr>
                    );
                  })}
                  {filteredWithdrawals.length === 0 && (
                    <tr><td colSpan={bulkMode ? 7 : 6} className="py-16 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <ListChecks size={28} className="text-gray/30" />
                        <p className="text-gray text-sm">{withdrawals.length === 0 ? 'No withdrawal requests' : 'No withdrawals match filters'}</p>
                      </div>
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-3">
            {filteredWithdrawals.map(wd => {
              const acct = getAccount(wd.account_id);
              const isPending = wd.status === 'pending';
              return (
                <div key={wd.id} className={`vantoris-card p-4 space-y-2 ${selectedIds.includes(wd.id) ? 'border-mint/40' : ''}`}>
                  {bulkMode && isPending && (
                    <button onClick={() => toggleSelect(wd.id)} className="flex items-center gap-2 text-xs text-gray">
                      {selectedIds.includes(wd.id) ? <CheckSquare size={14} className="text-mint" /> : <Square size={14} />}
                      {selectedIds.includes(wd.id) ? 'Selected' : 'Select'}
                    </button>
                  )}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-foreground font-medium text-sm">{acct?.account_name || '—'}</p>
                      <p className="text-gray text-xs font-mono">{acct?.account_number || ''}</p>
                    </div>
                    <StatusBadge status={wd.status} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-gray text-xs">{wd.method}</span>
                    <span className="text-foreground font-semibold text-sm">{formatCurrency(Math.abs(wd.amount))}</span>
                  </div>
                  <p className="text-gray text-[10px]">{new Date(wd.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                  {isPending && !bulkMode && (
                    <button onClick={() => setSelected(wd)} className="w-full py-2 bg-brass/15 text-brass rounded-lg text-xs font-medium">Review</button>
                  )}
                </div>
              );
            })}
            {filteredWithdrawals.length === 0 && (
              <div className="vantoris-glass-flat p-8 text-center">
                <ListChecks size={28} className="text-gray/30 mx-auto mb-2" />
                <p className="text-gray text-sm">{withdrawals.length === 0 ? 'No withdrawal requests' : 'No withdrawals match filters'}</p>
              </div>
            )}
          </div>
        </div>

        {/* === RIGHT: Context Panel === */}
        <div className="hidden lg:block">
          <div className="vantoris-glass-premium p-4 sticky top-4">
            {selected ? (
              <>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-foreground font-semibold text-sm">Review Request</h3>
                  <button onClick={() => setSelected(null)} className="text-gray hover:text-foreground"><X size={14} /></button>
                </div>
                <div className="space-y-3 mb-4">
                  <div className="vantoris-glass-flat p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray text-[10px] uppercase tracking-wider">Amount</span>
                      <span className="text-foreground font-bold text-lg">{formatCurrency(Math.abs(selected.amount))}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray text-[10px] uppercase tracking-wider">Method</span>
                      <span className="text-foreground text-xs font-medium">{selected.method}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray text-[10px] uppercase tracking-wider">Account</span>
                      <span className="text-foreground text-xs font-medium">{getAccount(selected.account_id)?.account_name || '—'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray text-[10px] uppercase tracking-wider">Balance</span>
                      <span className="text-foreground text-xs font-medium">{formatCurrency(getAccount(selected.account_id)?.balance || 0)}</span>
                    </div>
                    {selected.notes && <p className="text-gray text-[10px] pt-2 border-t border-slate-200">Member Notes: {selected.notes}</p>}
                    {checkWithdrawalLimit(getAccount(selected.account_id), Math.abs(selected.amount)) && (
                      <div className="pt-2 border-t border-slate-200">
                        <p className="text-crimson text-[10px] font-bold mb-1">⚠ Limit Violation</p>
                        {checkWithdrawalLimit(getAccount(selected.account_id), Math.abs(selected.amount)).map((v, i) => (
                          <p key={i} className="text-crimson/80 text-[10px]">{v}</p>
                        ))}
                      </div>
                    )}
                  </div>
                  {selected.status === 'pending' && (
                    <>
                      <div>
                        <label className="text-gray text-[10px] uppercase tracking-wider font-semibold mb-1.5 block">Admin Notes</label>
                        <textarea
                          value={adminNotes}
                          onChange={e => setAdminNotes(e.target.value)}
                          placeholder="Review notes..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-foreground text-xs focus:outline-none focus:ring-1 focus:ring-navy/20 resize-none"
                          rows={3}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={handlePay} disabled={submitting} className="py-2.5 bg-mint text-white rounded-lg text-xs font-semibold hover:bg-mint/90 disabled:opacity-40 flex items-center justify-center gap-1.5">
                          {submitting ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Approve
                        </button>
                        <button onClick={handleReject} disabled={submitting} className="py-2.5 bg-crimson text-white rounded-lg text-xs font-semibold hover:bg-crimson/90 disabled:opacity-40 flex items-center justify-center gap-1.5">
                          <X size={13} /> Reject
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <h3 className="text-foreground font-semibold text-sm mb-4">Processing Summary</h3>
                <div className="space-y-3">
                  <div className="vantoris-glass-flat p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Clock size={13} className="text-brass" />
                      <span className="text-gray text-[10px] uppercase tracking-wider font-semibold">Pending</span>
                    </div>
                    <p className="text-foreground font-bold text-xl">{summary.pending}</p>
                    <p className="text-gray text-[10px]">{formatCurrency(summary.totalAmount)}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="vantoris-glass-flat p-3">
                      <CheckCircle2 size={12} className="text-mint mb-1" />
                      <p className="text-foreground font-bold text-base">{summary.paid}</p>
                      <p className="text-gray text-[9px] uppercase tracking-wider font-semibold">Paid</p>
                    </div>
                    <div className="vantoris-glass-flat p-3">
                      <XCircle size={12} className="text-crimson mb-1" />
                      <p className="text-foreground font-bold text-base">{summary.rejected}</p>
                      <p className="text-gray text-[9px] uppercase tracking-wider font-semibold">Rejected</p>
                    </div>
                  </div>
                  <div className="vantoris-glass-flat p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Flag size={12} className="text-crimson" />
                      <span className="text-gray text-[10px] uppercase tracking-wider font-semibold">Flagged</span>
                    </div>
                    <p className="text-foreground font-bold text-base">{summary.flagged}</p>
                    <p className="text-gray text-[10px]">Limit violations</p>
                  </div>
                  <div className="vantoris-glass-flat p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp size={12} className="text-navy" />
                      <span className="text-gray text-[10px] uppercase tracking-wider font-semibold">Total Volume</span>
                    </div>
                    <p className="text-foreground font-bold text-base">{summary.total}</p>
                    <p className="text-gray text-[10px]">All withdrawal requests</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom: Real-time Processing Summary */}
      <div className="mt-4 vantoris-glass-flat p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <DollarSign size={13} className="text-brass" />
              <span className="text-gray">Showing</span>
              <span className="text-foreground font-semibold">{filteredWithdrawals.length}/{withdrawals.length}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-mint animate-pulse" />
              <span className="text-gray">Real-time · {summary.pending} pending</span>
            </div>
            {submitting && (
              <div className="flex items-center gap-1.5">
                <Loader2 size={13} className="animate-spin text-brass" />
                <span className="text-brass font-medium">Processing...</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-xs text-gray">
            <ShieldCheck size={13} className="text-mint" />
            <span>All actions audit-logged</span>
          </div>
        </div>
      </div>

      {/* Bulk Action Confirmation */}
      <Dialog open={!!bulkAction} onOpenChange={() => !submitting && setBulkAction(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 capitalize">
              {bulkAction === 'pay' ? <CheckCircle2 size={18} className="text-mint" /> : bulkAction === 'reject' ? <AlertTriangle size={18} className="text-crimson" /> : <Flag size={18} className="text-brass" />}
              {bulkAction === 'pay' ? 'Approve' : bulkAction === 'reject' ? 'Reject' : bulkAction} Withdrawals
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray text-xs">Selected Requests</span>
                <span className="text-foreground font-semibold">{selectedIds.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-gray text-xs">Total Amount</span>
                <span className="text-foreground font-semibold">{formatCurrency(selectedTotal)}</span>
              </div>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5">
              {selectedWithdrawals.map(wd => (
                <div key={wd.id} className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50">
                  <span className="text-gray">{getAccount(wd.account_id)?.account_name || '—'} · {wd.method}</span>
                  <span className="text-foreground font-medium">{formatCurrency(Math.abs(wd.amount))}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">Admin Notes</label>
              <textarea
                value={bulkNotes}
                onChange={e => setBulkNotes(e.target.value)}
                placeholder={bulkAction === 'pay' ? 'Bulk approval notes...' : 'Reason for action...'}
                className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-navy/30 focus:outline-none resize-none"
                rows={2}
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={executeBulkAction}
                disabled={submitting}
                className={`flex-1 py-3 text-white font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40 ${bulkAction === 'pay' ? 'bg-mint hover:bg-mint/90' : bulkAction === 'reject' ? 'bg-crimson hover:bg-crimson/90' : 'bg-navy hover:bg-navy/90'}`}
              >
                {submitting ? <><Loader2 size={16} className="animate-spin" /> Processing...</> : <><Check size={16} /> Confirm</>}
              </button>
              <button onClick={() => setBulkAction(null)} disabled={submitting} className="px-5 py-3 bg-slate-100 text-gray font-semibold rounded-xl hover:bg-slate-200 disabled:opacity-40">Cancel</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Review Dialog (Mobile) */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md lg:hidden">
          <DialogHeader>
            <DialogTitle className="text-foreground">Review Withdrawal</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-glass-flat p-4 space-y-2">
                <div className="flex items-center justify-between"><span className="text-gray text-xs">Amount</span><span className="text-foreground font-bold text-lg">{formatCurrency(Math.abs(selected.amount))}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray text-xs">Method</span><span className="text-foreground text-sm">{selected.method}</span></div>
                <div className="flex items-center justify-between"><span className="text-gray text-xs">Balance</span><span className="text-foreground text-sm">{formatCurrency(getAccount(selected.account_id)?.balance || 0)}</span></div>
                {selected.notes && <p className="text-gray text-xs pt-2 border-t border-slate-200">Notes: {selected.notes}</p>}
                {checkWithdrawalLimit(getAccount(selected.account_id), Math.abs(selected.amount)) && (
                  <div className="pt-2 border-t border-slate-200">
                    <p className="text-crimson text-xs font-semibold mb-1">⚠ Limit Violation</p>
                    {checkWithdrawalLimit(getAccount(selected.account_id), Math.abs(selected.amount)).map((v, i) => <p key={i} className="text-crimson/80 text-xs">{v}</p>)}
                  </div>
                )}
              </div>
              {selected.status === 'pending' && (
                <>
                  <div>
                    <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">Admin Notes</label>
                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:outline-none resize-none" rows={3} />
                  </div>
                  <div className="flex gap-3">
                    <button onClick={handlePay} disabled={submitting} className="flex-1 py-3 bg-mint text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-mint/90 disabled:opacity-40">
                      {submitting ? <Loader2 size={16} className="animate-spin" /> : <><Check size={16} /> Mark Paid</>}
                    </button>
                    <button onClick={handleReject} disabled={submitting} className="flex-1 py-3 bg-crimson text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-crimson/80 disabled:opacity-40">
                      <X size={16} /> Reject
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </OperationsPageLayout>
  );
}