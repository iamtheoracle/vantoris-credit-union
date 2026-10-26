import React, { useEffect, useMemo, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  ChevronRight,
  CreditCard,
  Eye,
  EyeOff,
  Gift,
  Landmark,
  LogOut,
  Percent,
  Plus,
  Sparkles,
  QrCode,
} from 'lucide-react';

const TABS = [
  { id: 'account', label: 'Shares' },
  { id: 'rewards', label: 'Benefits' },
  { id: 'activity', label: 'Activity' },
];

function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '·';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function relativeDay(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startThat = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((startToday - startThat) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff > 1 && diff < 7) return `${diff} days ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function accountLabel(a) {
  const type = (a.account_type || a.type || 'Account').replace(/_/g, ' ');
  const last4 = String(a.account_number || a.mask || '').slice(-4);
  return last4 ? `${type} ···${last4}` : type;
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [cards, setCards] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [hidden, setHidden] = useState(false);
  const [toast, setToast] = useState(null);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get('tab');
  const tab = ['account', 'rewards', 'activity'].includes(tabParam) ? tabParam : 'account';
  const setTab = (id) => {
    const next = new URLSearchParams(searchParams);
    if (id === 'account') next.delete('tab');
    else next.set('tab', id);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await base44.auth.me();
        const [a, c, p] = await Promise.all([
          base44.entities.Account.filter({ user_id: me.id }, '-created_date').catch(() => []),
          base44.entities.PaymentCard.filter({ user_id: me.id, status: 'active' }, '-created_date').catch(() => []),
          base44.entities.InvestmentPortfolio.filter({ user_id: me.id }, '-created_date').catch(() => []),
        ]);

        let txs = [];
        if (a.length) {
          const accountIds = a.map((x) => x.id);
          const batches = await Promise.all(
            accountIds.slice(0, 6).map((id) =>
              base44.entities.Transaction.filter({ account_id: id }, '-created_date', 20).catch(() => [])
            )
          );
          txs = batches
            .flat()
            .sort((x, y) => new Date(y.created_date || 0) - new Date(x.created_date || 0))
            .slice(0, 40);
        }

        if (!cancelled) {
          setUser(me);
          setAccounts(Array.isArray(a) ? a : []);
          setCards(Array.isArray(c) ? c : []);
          setPortfolios(Array.isArray(p) ? p : []);
          setTransactions(txs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 2400);
    return () => window.clearTimeout(t);
  }, [toast]);

  const balance = useMemo(() => accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0), [accounts]);
  const wealth = useMemo(
    () => portfolios.reduce((s, p) => s + (Number(p.total_value) || 0), 0),
    [portfolios]
  );
  const firstName = (() => {
    const raw =
      user?.first_name ||
      user?.given_name ||
      (user?.full_name && String(user.full_name).trim().split(/\s+/).filter(Boolean)[0]) ||
      '';
    let given = String(raw || '').trim();
    if (!given || given.includes('@')) return 'Member';
    if (!/\s/.test(given) && given === String(user?.email || '').split('@')[0]) return 'Member';
    given = given.split(/\s+/)[0];
    if (given.length < 2) return 'Member';
    return given.charAt(0).toUpperCase() + given.slice(1);
  })();
  const primaryAccount = accounts[0];

  function openQuick(mode) {
    navigate(`/move-money?action=${mode}`);
  }

  function handleSignOut() {
    try {
      base44.auth.logout('/');
    } catch (e) {
      try {
        localStorage.removeItem('base44_access_token');
        localStorage.removeItem('token');
      } catch (_) {}
      window.location.href = '/login';
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F6F9]">
        <div className="w-8 h-8 border-2 border-navy/20 border-t-navy rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] text-navy max-w-[430px] mx-auto relative">
      <header className="sticky top-0 z-20 flex items-center justify-between px-4 pt-3 pb-2 bg-[#F4F6F9]/95 backdrop-blur-md">
        <div className="w-9" />
        <div className="text-center flex-1">
          <h1 className="text-[17px] font-bold leading-tight text-navy">Membership</h1>
          <p className="text-[13px] text-slate-500 flex items-center justify-center gap-1.5">
            {firstName}
            <span className="inline-block w-1 h-1 rounded-full bg-[#1F6B4A]" />
            Shares
          </p>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => setHidden((v) => !v)}
            aria-label={hidden ? 'Show balances' : 'Hide balances'}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/80"
          >
            {hidden ? <Eye size={18} /> : <EyeOff size={18} />}
          </button>
          <button
            type="button"
            onClick={() => navigate('/messages')}
            aria-label="Notifications"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/80"
          >
            <Bell size={18} />
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Sign out"
            title="Sign out"
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-500 hover:bg-white/80"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      <div className="flex gap-2 px-4 pb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`shrink-0 px-[18px] py-2.5 rounded-full text-[15px] font-semibold transition-colors ${
              tab === t.id
                ? 'bg-navy text-white shadow-sm'
                : 'bg-white text-navy/70 border border-slate-200/80'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="px-4 pb-28">
        {tab === 'account' && (
          <section>
            <div className="rounded-[22px] bg-gradient-to-br from-navy via-[#0A2342] to-[#0E2A4A] text-white p-6 mb-5 shadow-[0_12px_32px_rgba(7,28,56,0.22)]">
              <p className="text-[13px] text-white/65 mb-1 font-medium">Available shares</p>
              <p className="text-[36px] font-bold tracking-tight tabular-nums leading-none">
                {hidden ? '••••••' : formatCurrency(balance)}
              </p>
              {wealth > 0 && (
                <button
                  type="button"
                  onClick={() => navigate('/investment')}
                  className="mt-3 text-[13px] text-brass inline-flex items-center gap-1 font-medium"
                >
                  + {hidden ? '••••' : formatCurrency(wealth)} invested
                  <ChevronRight size={14} />
                </button>
              )}
              {accounts.length > 0 && (
                <p className="mt-3 text-[12px] text-white/50">
                  {accounts.length} account{accounts.length === 1 ? '' : 's'} · Vantoris
                </p>
              )}
            </div>

            <div className="flex justify-center gap-5 sm:gap-8 mb-6 flex-wrap">
              {[
                { mode: 'deposit', label: 'Deposit', Icon: Plus },
                { mode: 'send', label: 'Send', Icon: ArrowUpRight },
                { mode: 'request', label: 'Request', Icon: ArrowDownLeft },
              ].map(({ mode, label, Icon }) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => openQuick(mode)}
                  className="flex flex-col items-center gap-2 text-[13px] font-semibold text-navy"
                >
                  <span className="w-14 h-14 rounded-full bg-navy text-white flex items-center justify-center shadow-md active:scale-95 transition-transform ring-2 ring-brass/30">
                    <Icon size={22} strokeWidth={2.5} />
                  </span>
                  {label}
                </button>
              ))}
              <button
                type="button"
                onClick={() => navigate('/qr')}
                className="flex flex-col items-center gap-2 text-[13px] font-semibold text-navy"
              >
                <span className="w-14 h-14 rounded-full bg-navy text-white flex items-center justify-center shadow-md active:scale-95 transition-transform ring-2 ring-brass/30">
                  <QrCode size={22} strokeWidth={2.5} />
                </span>
                QR Pay
              </button>
            </div>

            <div className="mb-4">
              <div className="flex items-center justify-between mb-2.5 px-0.5">
                <h2 className="text-[15px] font-bold text-navy">Your accounts</h2>
                <button
                  type="button"
                  onClick={() => navigate('/accounts')}
                  className="text-[13px] font-semibold text-navy/60 hover:text-navy"
                >
                  See all
                </button>
              </div>

              {accounts.length === 0 ? (
                <div className="rounded-[20px] bg-white border border-slate-200/80 p-5 text-center">
                  <p className="text-[15px] font-semibold text-navy">No accounts yet</p>
                  <p className="text-[13px] text-slate-500 mt-1">
                    Accounts linked to your membership will appear here.
                  </p>
                  <button
                    type="button"
                    onClick={() => openQuick('deposit')}
                    className="mt-4 inline-flex items-center gap-2 rounded-full bg-navy text-white px-5 py-2.5 text-[14px] font-semibold"
                  >
                    <Plus size={16} /> Make a deposit
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {accounts.map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => navigate(`/accounts/${a.id}`)}
                      className="w-full flex items-center gap-3 rounded-[18px] bg-white border border-slate-200/70 p-4 text-left shadow-sm hover:border-brass/40 transition-colors"
                    >
                      <span className="w-11 h-11 rounded-xl bg-navy/5 text-navy flex items-center justify-center shrink-0">
                        <Landmark size={20} />
                      </span>
                      <span className="flex-1 min-w-0">
                        <strong className="block text-[15px] text-navy truncate capitalize">
                          {accountLabel(a)}
                        </strong>
                        <span className="text-[13px] text-slate-500">
                          {a.status ? String(a.status).replace(/_/g, ' ') : 'Active'}
                        </span>
                      </span>
                      <span className="text-right shrink-0">
                        <span className="block text-[16px] font-bold tabular-nums text-navy">
                          {hidden ? '••••••' : formatCurrency(Number(a.balance) || 0)}
                        </span>
                        <ChevronRight size={16} className="text-slate-400 ml-auto mt-0.5" />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => navigate('/accounts')}
              className="w-full flex items-center gap-3 rounded-[18px] bg-white border border-slate-200/70 p-4 mb-3 text-left shadow-sm"
            >
              <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <Landmark size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <strong className="block text-[15px] text-navy">Set up direct deposit</strong>
                <span className="text-[14px] text-slate-500 leading-snug">Get paid up to 2 days early</span>
              </span>
              <ChevronRight size={18} className="text-slate-400 shrink-0" />
            </button>

            <div className="grid grid-cols-2 gap-2.5 mb-4">
              <button
                type="button"
                onClick={() => setTab('rewards')}
                className="rounded-[18px] bg-white border border-slate-200/70 p-4 min-h-[132px] flex flex-col gap-2 text-left shadow-sm"
              >
                <span className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                  <Gift size={16} />
                </span>
                <strong className="text-[15px] text-navy">Cash back</strong>
                <p className="text-[13px] text-slate-500 leading-snug flex-1">Earn on everyday spending</p>
              </button>
              <button
                type="button"
                onClick={() => setTab('rewards')}
                className="rounded-[18px] bg-white border border-slate-200/70 p-4 min-h-[132px] flex flex-col gap-2 text-left shadow-sm"
              >
                <span className="w-8 h-8 rounded-lg bg-brass/15 text-brass flex items-center justify-center">
                  <Percent size={16} />
                </span>
                <strong className="text-[15px] text-navy">Interest</strong>
                <p className="text-[13px] text-slate-500 leading-snug flex-1">Competitive APY on cash</p>
              </button>
            </div>

            {cards.length > 0 ? (
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="w-full rounded-[18px] bg-gradient-to-r from-navy to-[#0E2A4A] text-white p-5 text-left mb-3 shadow-md"
              >
                <div className="flex items-center gap-3">
                  <CreditCard size={22} className="text-brass" />
                  <div>
                    <p className="text-[12px] uppercase tracking-wider text-white/60">Your card</p>
                    <h2 className="text-lg font-semibold mt-0.5">
                      {cards[0].card_type || 'Debit'} ···
                      {String(cards[0].last_four || cards[0].card_number || '').slice(-4)}
                    </h2>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold mt-3 text-brass">
                  Manage card <ChevronRight size={16} />
                </span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="w-full rounded-[18px] bg-white border border-slate-200/70 p-5 text-left mb-3 shadow-sm"
              >
                <p className="text-[12px] uppercase tracking-wider text-slate-500">Card services</p>
                <h2 className="text-lg font-semibold text-navy mt-1">Request a debit card</h2>
                <p className="text-[14px] text-slate-500 mt-1">
                  Eligible members can request and manage cards here.
                </p>
                <span className="inline-flex items-center gap-1 text-[14px] font-semibold mt-3 text-navy">
                  View card services <ChevronRight size={16} />
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSignOut}
              className="mt-4 w-full flex items-center justify-center gap-2 rounded-full border border-slate-200 bg-white py-3.5 text-[15px] font-semibold text-navy hover:bg-slate-50 active:scale-[0.99] transition"
            >
              <LogOut size={18} />
              Sign out
            </button>

            <p className="mt-4 text-[12px] text-slate-400 leading-relaxed text-center">
              Banking services provided through Vantoris. Terms and limitations apply.
            </p>
          </section>
        )}

        {tab === 'rewards' && (
          <section>
            <div className="rounded-[20px] bg-gradient-to-b from-emerald-50 to-white border border-emerald-100 p-5 mb-3">
              <div className="flex gap-3 items-start mb-4">
                <span className="w-9 h-9 rounded-[10px] bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Sparkles size={18} />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-navy">Cash back</h3>
                  <p className="text-[14px] text-slate-500 leading-snug mt-1">
                    Earn cash back on everyday purchases with your Vantoris card.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/services')}
                className="w-full rounded-full bg-navy text-white py-3.5 text-[15px] font-bold"
              >
                Explore rewards
              </button>
            </div>

            <div className="rounded-[20px] bg-white border border-slate-200/70 p-5 mb-3 shadow-sm">
              <div className="flex gap-3 items-start">
                <span className="w-9 h-9 rounded-[10px] bg-brass/15 text-brass flex items-center justify-center shrink-0">
                  <Percent size={18} />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-navy">Interest on cash</h3>
                  <p className="text-[14px] text-slate-500 leading-snug mt-1">
                    Competitive rates on eligible balances. Rates subject to change.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[20px] bg-white border border-slate-200/70 p-5 shadow-sm">
              <div className="flex gap-3 items-start">
                <span className="w-9 h-9 rounded-[10px] bg-navy/8 text-navy flex items-center justify-center shrink-0">
                  <Gift size={18} />
                </span>
                <div>
                  <h3 className="text-[17px] font-semibold text-navy">Member perks</h3>
                  <p className="text-[14px] text-slate-500 leading-snug mt-1">
                    Preferential FX, priority support, and curated offers for active members.
                  </p>
                </div>
              </div>
            </div>
          </section>
        )}

        {tab === 'activity' && (
          <section>
            <h2 className="text-[15px] font-bold text-navy mb-3">Recent activity</h2>
            {transactions.length === 0 ? (
              <div className="rounded-[20px] bg-white border border-slate-200/70 p-8 text-center">
                <p className="text-[15px] font-semibold text-navy">No recent transactions</p>
                <p className="text-[13px] text-slate-500 mt-1">
                  Activity from your accounts will show up here.
                </p>
                <button
                  type="button"
                  onClick={() => openQuick('deposit')}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-navy text-white px-5 py-2.5 text-[14px] font-semibold"
                >
                  <Plus size={16} /> Make a deposit
                </button>
              </div>
            ) : (
              <div className="rounded-[18px] bg-white border border-slate-200/70 divide-y divide-slate-100 shadow-sm overflow-hidden">
                {transactions.map((tx) => {
                  const amt = Number(tx.amount) || 0;
                  const credit =
                    amt > 0 ||
                    ['deposit', 'interest', 'opening_balance', 'credit'].includes(
                      String(tx.type || '').toLowerCase()
                    );
                  const label = tx.description || tx.type || 'Transaction';
                  return (
                    <button
                      key={tx.id}
                      type="button"
                      onClick={() =>
                        primaryAccount ? navigate(`/accounts/${primaryAccount.id}`) : navigate('/accounts')
                      }
                      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80"
                    >
                      <span className="w-10 h-10 rounded-full bg-navy/5 flex items-center justify-center text-[13px] font-bold text-navy shrink-0">
                        {initials(label)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <strong className="block text-[15px] text-navy truncate">{label}</strong>
                        <span className="text-[13px] text-slate-500">
                          {relativeDay(tx.created_date)}
                          {tx.type ? ` · ${tx.type}` : ''}
                        </span>
                      </span>
                      <span
                        className={`text-[15px] font-semibold tabular-nums shrink-0 ${
                          credit ? 'text-emerald-600' : 'text-navy'
                        }`}
                      >
                        {credit ? '+' : '−'}
                        {formatCurrency(Math.abs(amt))}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>

      {toast && (
        <div className="fixed left-1/2 -translate-x-1/2 bottom-28 z-[70] bg-navy text-white px-4 py-3 rounded-full text-[14px] font-semibold max-w-[90%] shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
