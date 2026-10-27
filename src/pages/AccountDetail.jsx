import React, { useCallback, useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useNavigate, useParams } from 'react-router-dom';
import { formatCurrency } from '@/lib/formatCurrency';
import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronRight,
  Copy,
  Download,
  FileText,
  Snowflake,
  TrendingUp,
  Upload,
  ShieldCheck,
} from 'lucide-react';
import SecurityPinModal from '@/components/vantoris/SecurityPinModal';
import StatusBadge from '@/components/vantoris/StatusBadge';
import HistoricalStatementImport from '@/components/vantoris/HistoricalStatementImport';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { usePullToRefresh } from '@/hooks/usePullToRefresh';
import { useToast } from '@/components/ui/use-toast';
import TransactionFilters from '@/components/TransactionFilters';
import MonthlySummary from '@/components/vantoris/home/MonthlySummary';
import { getEffectiveTxnDate, formatTxnDate, getWeekday, formatPeriod } from '@/lib/statementDates';

const WITHDRAWAL_METHODS = [
  {
    value: 'ACH Transfer',
    title: 'ACH Transfer',
    speed: 'Fast',
    time: '1-2 Business Days',
    fee: '$0 standard fee',
    limit: 'Up to $25,000 daily',
    availability: 'Available for verified U.S. bank accounts',
  },
  {
    value: 'Domestic Wire',
    title: 'Domestic Wire',
    speed: 'Same Day',
    time: 'Same business day when submitted before cutoff',
    fee: '$25 estimated fee',
    limit: 'Up to $100,000 daily',
    availability: 'U.S. routing and account number required',
  },
  {
    value: 'International Wire',
    title: 'International Wire',
    speed: 'Global',
    time: '2-5 Business Days',
    fee: '$45 estimated fee',
    limit: 'Subject to destination country review',
    availability: 'SWIFT and beneficiary details required',
  },
  {
    value: 'External Transfer',
    title: 'External Transfer',
    speed: 'Standard',
    time: '2-3 Business Days',
    fee: '$0 standard fee',
    limit: 'Up to linked bank limits',
    availability: 'Requires verified external account',
  },
  {
    value: "Cashier's Check",
    title: "Cashier's Check",
    speed: 'Bank-Issued',
    time: '1-2 Business Days',
    fee: '$10 estimated fee',
    limit: 'Up to $50,000 per check',
    availability: 'Bank-issued check mailed to address',
  },
  {
    value: 'Check by Mail',
    title: 'Check by Mail',
    speed: 'Mail',
    time: '5-7 Business Days',
    fee: '$10 estimated fee',
    limit: 'Up to $10,000 per check',
    availability: 'Optional mailed check delivery',
  },

];

const DESTINATIONS = [
  { id: 'saved-bank', title: 'Saved U.S. Bank', detail: 'Chase Checking ending 4821', type: 'Saved banks' },
  { id: 'linked-account', title: 'Linked Account', detail: 'Savings ending 0188', type: 'Linked accounts' },
];

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [account, setAccount] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [wStep, setWStep] = useState(1); // 1=details, 2=review, 3=pin
  const [wForm, setWForm] = useState({ amount: '', method: 'ACH Transfer', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const [copiedField, setCopiedField] = useState('');
  const [pendingWithdrawals, setPendingWithdrawals] = useState(0);
  const [showStatement, setShowStatement] = useState(false);
  const [stmtRange, setStmtRange] = useState({ from: '', to: '' });
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const { toast } = useToast();
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  const [showHistoricalImport, setShowHistoricalImport] = useState(false);

  const loadData = useCallback(async () => {
    const [user, acct, txns, pendingWds] = await Promise.all([
      base44.auth.me(),
      base44.entities.Account.get(id),
      base44.entities.Transaction.filter({ account_id: id }, '-created_date', 50),
      base44.entities.WithdrawalRequest.filter({ account_id: id, status: 'pending' }),
    ]);
    setCurrentUser(user);
    setAccount(acct);
    setTransactions(txns);
    setPendingWithdrawals(pendingWds.reduce((sum, w) => sum + (w.amount || 0), 0));
  }, [id]);

  useEffect(() => {
    loadData().catch(e => console.error(e)).finally(() => setLoading(false));
  }, [loadData]);

  useEffect(() => {
    setFilteredTransactions(transactions);
  }, [transactions]);

  function handleFilter({ dateRange, category, amountMin, amountMax }) {
    let filtered = [...transactions];
    if (dateRange) {
      filtered = filtered.filter(t => {
        const txDate = new Date(t.transaction_date || t.created_date);
        return txDate >= dateRange.start && txDate <= dateRange.end;
      });
    }
    if (category) {
      filtered = filtered.filter(t => t.type === category);
    }
    if (amountMin !== '' && amountMin != null) {
      filtered = filtered.filter(t => Math.abs(t.amount) >= parseFloat(amountMin));
    }
    if (amountMax !== '' && amountMax != null) {
      filtered = filtered.filter(t => Math.abs(t.amount) <= parseFloat(amountMax));
    }
    setFilteredTransactions(filtered);
  }

  const { containerProps, PullIndicator } = usePullToRefresh(loadData);

  function copyToClipboard(text, field) {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(''), 2000);
  }

  async function handlePinVerified() {
    setShowPin(false);
    const formData = { ...wForm };
    const amount = parseFloat(formData.amount);
    setShowWithdraw(false);
    setWStep(1);
    setWForm({ amount: '', method: 'ACH Transfer', notes: '' });

    const pendingToast = toast({ title: 'Submitting withdrawal...', description: `${formatCurrency(amount)} via ${formData.method}` });

    try {
      const user = currentUser || await base44.auth.me();
      await base44.entities.WithdrawalRequest.create({
        account_id: id,
        user_id: user.id,
        amount: amount,
        method: formData.method,
        notes: formData.notes,
        status: 'pending',
      });
      await base44.entities.Notification.create({
        user_id: user.id,
        title: 'Withdrawal Requested',
        message: `Your withdrawal request of ${formatCurrency(amount)} is pending review.`,
        type: 'info',
      });
      pendingToast.update({ title: 'Withdrawal submitted', description: `${formatCurrency(amount)} is pending review.` });
    } catch (e) {
      console.error(e);
      pendingToast.update({ title: 'Withdrawal failed', description: 'Please try again.', variant: 'destructive' });
    }
  }

  async function generateStatement() {
    setGeneratingPdf(true);
    try {
      const me = await base44.auth.me();
      const jsPDF = (await import('jspdf')).default;
      const doc = new jsPDF();

      // Use getEffectiveTxnDate — respects transaction_date, then posting_date, then created_date
      // NEVER substitutes today's date for historical dates
      const allTxns = [...transactions].sort((a, b) =>
        new Date(getEffectiveTxnDate(a)) - new Date(getEffectiveTxnDate(b))
      );

      const filtered = allTxns.filter(t => {
        const d = new Date(getEffectiveTxnDate(t));
        if (isNaN(d.getTime())) return false;
        if (stmtRange.from && d < new Date(stmtRange.from)) return false;
        if (stmtRange.to && d > new Date(stmtRange.to + 'T23:59:59')) return false;
        return true;
      });

      const beforeRange = stmtRange.from
        ? allTxns.filter(t => {
            const d = new Date(getEffectiveTxnDate(t));
            return !isNaN(d.getTime()) && d < new Date(stmtRange.from);
          })
        : [];
      const openingBalance = beforeRange.reduce((sum, t) => sum + (t.amount || 0), 0);

      const closingBalance = filtered.length > 0
        ? (filtered[filtered.length - 1].balance_after != null
          ? filtered[filtered.length - 1].balance_after
          : openingBalance + filtered.reduce((sum, t) => sum + (t.amount || 0), 0))
        : account.balance;

      const credits = filtered.filter(t => (t.amount || 0) >= 0).reduce((s, t) => s + Math.abs(t.amount || 0), 0);
      const debits = filtered.filter(t => (t.amount || 0) < 0).reduce((s, t) => s + Math.abs(t.amount || 0), 0);

      const now = new Date();
      const refDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const refRand = Math.random().toString(36).substring(2, 6).toUpperCase();
      const referenceNumber = `VST-${refDate}-${refRand}`;

      // Statement date = the end of the selected period (or latest transaction date, or today for live statements)
      // This is SEPARATE from the generated/upload date
      const statementDate = stmtRange.to
        ? stmtRange.to
        : filtered.length > 0
          ? formatTxnDate(getEffectiveTxnDate(filtered[filtered.length - 1])).replace(/,/g, '')
          : now.toISOString().split('T')[0];

      const periodText = formatPeriod(stmtRange.from, stmtRange.to);

      doc.setFillColor(14, 26, 43);
      doc.rect(0, 0, 210, 297, 'F');

      doc.setTextColor(176, 141, 87);
      doc.setFontSize(22);
      doc.setFont(undefined, 'bold');
      doc.text('VANTORIS', 20, 25);
      doc.setFontSize(8);
      doc.setTextColor(170, 180, 195);
      doc.text('VANTORIS PIP · PRIVATE INVESTMENT & PAYMENTS', 20, 31);

      doc.setTextColor(255, 255, 255);
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('STATEMENT OF ACCOUNT', 130, 25);

      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(170, 180, 195);
      doc.text(`Reference Number: ${referenceNumber}`, 130, 33);
      // Statement Date — the actual date of the statement (calculated, not today)
      doc.text(`Statement Date: ${formatTxnDate(statementDate)}`, 130, 38);
      doc.text(`Statement Period: ${periodText}`, 130, 43);
      // Generated Date — when the PDF was created (system timestamp, separate from statement date)
      doc.text(`Generated: ${now.toLocaleString('en-US')}`, 130, 48);

      doc.setDrawColor(176, 141, 87);
      doc.setLineWidth(0.5);
      doc.line(20, 47, 190, 47);

      doc.setTextColor(170, 180, 195);
      doc.setFontSize(7);
      doc.text('MEMBER', 20, 55);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(me.full_name || 'Member', 20, 61);

      doc.setTextColor(170, 180, 195);
      doc.setFontSize(7);
      doc.setFont(undefined, 'normal');
      doc.text('ACCOUNT', 110, 55);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(account.account_name, 110, 61);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(170, 180, 195);
      doc.text(`Account Number: ${account.account_number}`, 110, 67);
      doc.text(`Account Type: ${account.account_type}`, 110, 72);

      doc.setFillColor(36, 45, 56);
      doc.roundedRect(20, 78, 170, 24, 3, 3, 'F');
      doc.setTextColor(170, 180, 195);
      doc.setFontSize(7);
      doc.text('OPENING BALANCE', 25, 85);
      doc.text('TOTAL CREDITS', 80, 85);
      doc.text('TOTAL DEBITS', 120, 85);
      doc.text('CLOSING BALANCE', 155, 85);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont(undefined, 'bold');
      doc.text(formatCurrency(openingBalance), 25, 93);
      doc.setTextColor(62, 76, 58);
      doc.text(formatCurrency(credits), 80, 93);
      doc.setTextColor(140, 47, 57);
      doc.text(formatCurrency(debits), 120, 93);
      doc.setTextColor(255, 255, 255);
      doc.text(formatCurrency(closingBalance), 155, 93);
      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      doc.setTextColor(170, 180, 195);
      doc.text(`${filtered.length} transactions in period`, 25, 99);

      let y = 114;
      doc.setFillColor(36, 45, 56);
      doc.rect(20, y - 5, 170, 8, 'F');
      doc.setTextColor(170, 180, 195);
      doc.setFontSize(7);
      doc.setFont(undefined, 'bold');
      doc.text('TRANSACTION DATE', 22, y);
      doc.text('DESCRIPTION', 58, y);
      doc.text('REFERENCE', 108, y);
      doc.text('DEBIT', 145, y);
      doc.text('CREDIT', 168, y);
      y += 8;

      doc.setFont(undefined, 'normal');
      doc.setFontSize(7);
      filtered.forEach(txn => {
        if (y > 275) {
          doc.addPage();
          doc.setFillColor(14, 26, 43);
          doc.rect(0, 0, 210, 297, 'F');
          y = 20;
        }
        // Use getEffectiveTxnDate — respects transaction_date > posting_date > created_date
        const effDate = getEffectiveTxnDate(txn);
        // Weekday calculated from the ACTUAL date — never hardcoded
        const weekday = getWeekday(effDate, true);
        const dateStr = formatTxnDate(effDate);
        doc.setTextColor(170, 180, 195);
        doc.text(`${weekday}, ${dateStr}`, 22, y);
        // Description — use natural banking language
        let descText = txn.description || txn.type || '';
        // For transfers, show direction
        if (txn.type === 'transfer') {
          if (txn.transfer_direction === 'in') descText = `Transfer In — ${descText}`;
          else if (txn.transfer_direction === 'out') descText = `Transfer Out — ${descText}`;
          else if (txn.transfer_direction === 'external') descText = `External Transfer — ${descText}`;
          else if (txn.transfer_direction === 'internal') descText = `Internal Transfer — ${descText}`;
        }
        // Mark historical imports
        if (txn.source === 'historical_import') {
          descText = `[Historical] ${descText}`;
        }
        doc.setTextColor(255, 255, 255);
        doc.text(descText.substring(0, 30), 58, y);
        doc.setTextColor(170, 180, 195);
        doc.text((txn.reference || '-').substring(0, 16), 108, y);
        if (txn.amount < 0) {
          doc.setTextColor(140, 47, 57);
          doc.text(formatCurrency(Math.abs(txn.amount)), 145, y);
          doc.text('-', 173, y);
        } else {
          doc.text('-', 148, y);
          doc.setTextColor(62, 76, 58);
          doc.text(formatCurrency(Math.abs(txn.amount)), 168, y);
        }
        doc.setDrawColor(36, 45, 56);
        doc.line(20, y + 2, 190, y + 2);
        y += 7;
      });

      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setTextColor(176, 141, 87);
        doc.setFontSize(7);
        doc.text('SECURE. TRUSTED. TAILORED FOR YOU.', 20, 287);
        doc.setTextColor(170, 180, 195);
        doc.text('VANTORIS — Elevating Your Financial World.', 20, 292);
        doc.text(`Page ${i} of ${pageCount}`, 170, 292);
        doc.text(referenceNumber, 90, 292);
      }

      doc.save(`Vantoris_Statement_${account.account_number}.pdf`);

      try {
        const blob = doc.output('blob');
        const file = new File([blob], `statement_${referenceNumber}.pdf`, { type: 'application/pdf' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        await base44.entities.Document.create({
          user_id: me.id,
          title: `Account Statement — ${periodText}`,
          type: 'statement',
          file_url,
          reference_number: referenceNumber,
          account_id: account.id,
          statement_period: periodText,
          statement_date: statementDate,
          period_start: stmtRange.from || '',
          period_end: stmtRange.to || '',
          issue_date: statementDate,
          status: 'active',
        });
      } catch (archiveErr) {
        console.error('Statement archive failed:', archiveErr);
      }
    } catch (e) { console.error(e); }
    setGeneratingPdf(false);
    setShowStatement(false);
  }

  if (loading || !account) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
      </div>
    );
  }

  const selectedMethod = WITHDRAWAL_METHODS.find(m => m.value === wForm.method);

  return (
    <div className="px-5 pt-6 vantoris-scroll" {...containerProps}>
      <PullIndicator />
      <button onClick={() => navigate('/accounts')} className="flex items-center gap-2 text-gray text-sm mb-6">
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>

      {/* Balance Card */}
      <div className="vantoris-glass-premium p-6 mb-5 relative overflow-hidden">
        <div className="vantoris-balance-glow absolute inset-0" />
        <div className="relative z-10">
          <div className="flex items-start justify-between mb-3">
            <div>
              <p className="text-gray text-xs">{account.account_name}</p>
              <p className="text-gray/60 text-[10px]">{account.account_type} · {account.status === 'active' ? 'Active' : account.status}</p>
            </div>
            <StatusBadge status={account.status} />
          </div>
          {/* Masked account & routing numbers with copy */}
          <div className="flex flex-col gap-1.5 mb-4">
            <button
              onClick={() => copyToClipboard(account.account_number || '', 'acct')}
              className="flex items-center gap-2 text-left"
            >
              <span className="text-gray/60 text-[11px]">Acct</span>
              <span className="text-gray text-[11px] font-mono">••••{(account.account_number || '').slice(-4)}</span>
              {copiedField === 'acct' ? <Check size={11} className="text-mint" /> : <Copy size={11} className="text-gray/40" />}
            </button>
            <button
              onClick={() => copyToClipboard('021000021', 'rout')}
              className="flex items-center gap-2 text-left"
            >
              <span className="text-gray/60 text-[11px]">Routing</span>
              <span className="text-gray text-[11px] font-mono">021000021</span>
              {copiedField === 'rout' ? <Check size={11} className="text-mint" /> : <Copy size={11} className="text-gray/40" />}
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-gray text-[10px] uppercase tracking-widest mb-1">Available</p>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">{formatCurrency(account.balance - pendingWithdrawals)}</h2>
            </div>
            <div>
              <p className="text-gray text-[10px] uppercase tracking-widest mb-1">Current</p>
              <h2 className="text-2xl font-bold text-foreground tracking-tight">{formatCurrency(account.balance)}</h2>
              {pendingWithdrawals > 0 && (
                <p className="text-brass text-[10px] mt-0.5">{formatCurrency(pendingWithdrawals)} pending</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => setShowWithdraw(true)}
          className="py-3 bg-brass text-foreground font-semibold rounded-xl text-sm hover:bg-brass/90 transition-all flex items-center justify-center gap-2"
        >
          <ArrowUpRight size={16} />
          Withdraw
        </button>
        <button
          onClick={() => setShowStatement(true)}
          className="py-3 bg-slate-100 text-foreground font-medium rounded-xl text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
        >
          <Download size={16} />
          Statement
        </button>
      </div>

      {/* Admin: Freeze Account & Import History */}
      {currentUser?.role === 'admin' && (
        <div className="grid grid-cols-2 gap-3 mb-6">
          <button
            onClick={async () => {
              try {
                const result = await base44.functions.invoke('setAccountStatus', { account_id: id });
                if (result?.data?.error) throw new Error(result.data.error);
                if (!result?.data?.success) throw new Error('Account status change was not confirmed.');
                await loadData();
                toast({ title: result.data.status === 'frozen' ? 'Account frozen' : 'Account unfrozen' });
              } catch (error) {
                toast({ title: 'Account status update failed', description: error.message || 'Refresh and verify status before retrying.', variant: 'destructive' });
              }
            }}
            className={`py-3 font-semibold rounded-xl text-sm transition-all flex items-center justify-center gap-2 ${
              account.status === 'frozen'
                ? 'bg-mint/10 text-mint hover:bg-mint/20'
                : 'bg-crimson/10 text-crimson hover:bg-crimson/20'
            }`}
          >
            <Snowflake size={16} />
            {account.status === 'frozen' ? 'Unfreeze' : 'Freeze'}
          </button>
          <button
            onClick={() => setShowHistoricalImport(true)}
            className="py-3 bg-slate-100 text-foreground font-medium rounded-xl text-sm hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
          >
            <Upload size={16} />
            Import Statement
          </button>
        </div>
      )}
      {account.status === 'frozen' && currentUser?.role !== 'admin' && (
        <div className="bg-crimson/10 border border-crimson/20 rounded-xl p-3 mb-6 flex gap-2">
          <Snowflake size={16} className="text-crimson flex-shrink-0 mt-0.5" />
          <p className="text-crimson text-xs">This account is currently frozen and cannot process transactions.</p>
        </div>
      )}

      {/* Monthly Summary */}
      <MonthlySummary transactions={transactions} />

      {/* Transaction History */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-foreground font-semibold text-sm">Transaction History</h3>
        <div className="flex items-center gap-2">
          <TransactionFilters onFilter={handleFilter} />
          <span className="text-gray text-xs">{filteredTransactions.length}/{transactions.length}</span>
        </div>
      </div>

      {filteredTransactions.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <FileText size={24} className="text-gray mx-auto mb-2" />
          <p className="text-gray text-sm">{transactions.length === 0 ? 'No transactions yet' : 'No transactions match filters'}</p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl px-4 divide-y divide-slate-100">
          {filteredTransactions.map(txn => (
            <div key={txn.id} className="flex items-center justify-between py-3.5">
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  txn.type === 'deposit' || txn.type === 'opening_balance' || txn.type === 'interest'
                    ? 'bg-mint/10'
                    : txn.type === 'withdrawal' || txn.type === 'fee'
                    ? 'bg-crimson/10'
                    : 'bg-brass/10'
                }`}>
                  {txn.type === 'deposit' || txn.type === 'opening_balance' || txn.type === 'interest'
                    ? <ArrowDownLeft size={15} className="text-mint" />
                    : txn.type === 'withdrawal' || txn.type === 'fee'
                    ? <ArrowUpRight size={15} className="text-crimson" />
                    : <TrendingUp size={15} className="text-brass" />
                  }
                </div>
                <div>
                  <p className="text-foreground text-sm font-medium flex items-center gap-1.5">
                    {txn.description || txn.type.replace('_', ' ')}
                    {txn.source === 'historical_import' && (
                      <span className="inline-block px-1.5 py-0.5 bg-brass/10 text-brass text-[9px] font-semibold uppercase rounded">Historical</span>
                    )}
                  </p>
                  <p className="text-gray text-[11px]">
                    {formatTxnDate(getEffectiveTxnDate(txn))}
                    {txn.posting_date && txn.posting_date !== txn.transaction_date && (
                      <span className="text-gray/60"> · Posted: {formatTxnDate(txn.posting_date)}</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className={`font-semibold text-sm ${(txn.type === 'withdrawal' || txn.type === 'fee') ? 'text-crimson' : 'text-mint'}`}>
                  {(txn.type === 'withdrawal' || txn.type === 'fee') ? '-' : '+'}{formatCurrency(Math.abs(txn.amount))}
                </p>
                {txn.balance_after != null && (
                  <p className="text-gray text-[10px]">Bal: {formatCurrency(txn.balance_after)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Withdrawal Dialog — Multi-Step */}
      <Dialog open={showWithdraw} onOpenChange={(val) => { setShowWithdraw(val); if (!val) setWStep(1); }}>
        <DialogContent className="bg-white border-slate-200 max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-foreground">{wStep === 1 ? 'Request Withdrawal' : 'Review & Authorize'}</DialogTitle>
          </DialogHeader>

          {/* Step indicator */}
          <div className="flex items-center gap-2 mb-2">
            {[1, 2].map(s => (
              <div key={s} className={`h-1 flex-1 rounded-full transition ${s <= wStep ? 'bg-brass' : 'bg-slate-50'}`} />
            ))}
          </div>

          {wStep === 1 && (
            <div className="space-y-4 mt-2">
              <div>
                <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">Amount (USD)</label>
                <input
                  type="number"
                  value={wForm.amount}
                  onChange={e => setWForm({ ...wForm, amount: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none"
                  placeholder="0.00"
                />
                {wForm.amount && parseFloat(wForm.amount) > 0 && (
                  <p className="text-gray text-[11px] mt-1">Available: {formatCurrency(account.balance - pendingWithdrawals)}</p>
                )}
              </div>
              <div>
                <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">Method</label>
                <Select
                  value={wForm.method}
                  onValueChange={val => setWForm({ ...wForm, method: val })}
                >
                  <SelectTrigger className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none h-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-50 border-slate-200 max-h-60">
                    {WITHDRAWAL_METHODS.map(method => (
                      <SelectItem key={method.value} value={method.value} className="text-foreground focus:bg-brass/15 focus:text-brass">
                        {method.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedMethod && (
                  <div className="mt-2 vantoris-card p-3 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 bg-brass/15 text-brass rounded text-[10px] font-semibold">{selectedMethod.speed}</span>
                      <span className="text-gray text-xs">{selectedMethod.time}</span>
                    </div>
                    <p className="text-foreground text-xs"><span className="text-gray">Fee:</span> {selectedMethod.fee}</p>
                    <p className="text-foreground text-xs"><span className="text-gray">Limit:</span> {selectedMethod.limit}</p>
                    <p className="text-gray text-[11px]">{selectedMethod.availability}</p>
                  </div>
                )}
              </div>
              <div>
                <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">Notes</label>
                <textarea
                  value={wForm.notes}
                  onChange={e => setWForm({ ...wForm, notes: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none resize-none"
                  rows={3}
                />
              </div>
              <button
                disabled={!wForm.amount || parseFloat(wForm.amount) <= 0 || submitting}
                onClick={() => setWStep(2)}
                className="w-full py-3 bg-brass text-white font-semibold rounded-xl disabled:opacity-40"
              >
                Review
              </button>
            </div>
          )}

          {wStep === 2 && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-card p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-gray text-xs">From</span>
                  <span className="text-foreground text-sm font-medium">{account.account_name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray text-xs">Amount</span>
                  <span className="text-foreground text-lg font-bold">{formatCurrency(parseFloat(wForm.amount) || 0)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray text-xs">Method</span>
                  <span className="text-foreground text-sm">{selectedMethod?.title || wForm.method}</span>
                </div>
                {selectedMethod && (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-gray text-xs">Processing Time</span>
                      <span className="text-gray text-xs">{selectedMethod.time}</span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray text-xs">Fee</span>
                      <span className="text-gray text-xs">{selectedMethod.fee}</span>
                    </div>
                  </>
                )}
                {wForm.notes && (
                  <div className="flex justify-between items-start">
                    <span className="text-gray text-xs">Notes</span>
                    <span className="text-foreground text-xs text-right max-w-[60%]">{wForm.notes}</span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2 bg-brass/5 border border-brass/15 rounded-xl p-3">
                <ShieldCheck size={16} className="text-brass flex-shrink-0" />
                <p className="text-gray text-[11px]">This transaction requires PIN verification for security.</p>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => setWStep(1)}
                  className="flex-1 py-3 bg-slate-50 text-foreground font-medium rounded-xl hover:bg-slate-200 transition-all"
                >
                  Back
                </button>
                <button
                  onClick={() => setShowPin(true)}
                  className="flex-1 py-3 bg-brass text-white font-semibold rounded-xl hover:bg-brass/90 transition-all"
                >
                  Authorize & Submit
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Security PIN Modal */}
      <SecurityPinModal
        open={showPin}
        onVerified={handlePinVerified}
        onClose={() => setShowPin(false)}
        title="Authorize Withdrawal"
        description={`Enter your 6-digit PIN to authorize ${formatCurrency(parseFloat(wForm.amount) || 0)} withdrawal.`}
      />

      {/* Statement Dialog */}
      <Dialog open={showStatement} onOpenChange={setShowStatement}>
        <DialogContent className="bg-white border-slate-200 max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-foreground">Download Statement</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div>
              <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">From Date</label>
              <input
                type="date"
                value={stmtRange.from}
                onChange={e => setStmtRange({ ...stmtRange, from: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-gray text-xs uppercase tracking-wider mb-1.5 block">To Date</label>
              <input
                type="date"
                value={stmtRange.to}
                onChange={e => setStmtRange({ ...stmtRange, to: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none"
              />
            </div>
            <button
              onClick={generateStatement}
              disabled={generatingPdf}
              className="w-full py-3 bg-brass text-white font-semibold rounded-xl disabled:opacity-40"
            >
              {generatingPdf ? 'Generating...' : 'Download PDF'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Historical Statement Import — proper import with date separation, dedup, review */}
      <HistoricalStatementImport
        open={showHistoricalImport}
        onClose={() => setShowHistoricalImport(false)}
        accountId={id}
        account={account}
        onImported={loadData}
      />
    </div>
  );
}