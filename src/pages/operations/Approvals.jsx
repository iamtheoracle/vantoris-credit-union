import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import { useToast } from '@/components/ui/use-toast';

const PENDING = new Set(['pending', 'requested', 'review', '']);

function isPending(item) {
  return PENDING.has(String(item?.status || 'pending').toLowerCase());
}

function txnIdFrom(text) {
  return (String(text || '').match(/txn:([A-Za-z0-9_-]+)/) || [])[1] || '';
}

export default function Approvals() {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const { toast } = useToast();

  async function load() {
    const user = await base44.auth.me().catch(() => null);
    const [txns, notes] = await Promise.all([
      base44.entities.Transaction.list('-created_date', 200).catch(() => []),
      user ? base44.entities.Notification.filter({ user_id: user.id }, '-created_date', 100).catch(() => []) : [],
    ]);
    const money = (Array.isArray(txns) ? txns : [])
      .filter((t) => isPending(t))
      .map((t) => ({
        kind: 'money',
        id: t.id,
        title: t.type || 'transaction',
        detail: t.description || 'No description',
        amount: t.amount,
        user_id: t.user_id,
        raw: t,
      }));
    const requests = (Array.isArray(notes) ? notes : [])
      .filter((n) => /request/i.test(`${n.title || ''} ${n.message || ''}`) && isPending(n) && !txnIdFrom(n.message))
      .map((n) => ({
        kind: 'request',
        id: n.id,
        title: n.title,
        detail: n.message,
        amount: null,
        user_id: n.user_id,
        raw: n,
      }));
    setItems([...money, ...requests]);
  }

  useEffect(() => { load().catch((e) => setError(e.message || 'Could not load approvals.')); }, []);

  async function decide(item, approved) {
    setBusy(item.id);
    setError('');
    try {
      const txn = item.kind === 'money'
        ? item.raw
        : await base44.entities.Transaction.get(txnIdFrom(item.detail)).catch(() => null);
      if (txn?.id) {
        if (approved) {
          const account = txn.account_id ? await base44.entities.Account.get(txn.account_id).catch(() => null) : null;
          const value = Math.abs(Number(txn.amount) || 0);
          const credit = txn.type === 'deposit' || Number(txn.amount) > 0;
          const next = account ? Math.round(((Number(account.balance) || 0) + (credit ? value : -value)) * 100) / 100 : null;
          if (account && next != null) await base44.entities.Account.update(account.id, { balance: next });
          await base44.entities.Transaction.update(txn.id, { status: 'approved', balance_after: next });
        } else {
          await base44.entities.Transaction.update(txn.id, { status: 'declined' });
        }
        if (txn.user_id) {
          await base44.entities.Notification.create({
            user_id: txn.user_id,
            title: approved ? 'Transaction approved' : 'Transaction declined',
            message: `${approved ? 'Approved' : 'Declined'}: ${txn.description || txn.type}.`,
            type: approved ? 'info' : 'warning',
            status: approved ? 'approved' : 'declined',
          }).catch(() => {});
        }
      }
      if (item.kind === 'request') {
        await base44.entities.Notification.update(item.id, { status: approved ? 'approved' : 'declined' }).catch(() => {});
      }
      toast({ title: approved ? 'Approved' : 'Declined', description: txn?.id ? 'The ledger was updated.' : 'The request was marked.' });
      await load();
    } catch (e) {
      const message = e.message || 'The backend rejected this decision.';
      setError(message);
      toast({ title: 'Action failed', description: message, variant: 'destructive' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-5 pb-28 pt-6">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Operators and administrators</p>
      <h1 className="mt-1 text-3xl font-bold text-navy">Approvals</h1>
      <p className="mt-1 text-sm text-slate-500">Approve posts the money. Decline leaves the balance unchanged.</p>
      {error && <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-brass">{item.title}</p>
            <p className="mt-1 font-semibold text-navy">{item.detail}</p>
            {item.amount != null && <p className="mt-1 text-sm">{formatCurrency(item.amount)}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy === item.id} onClick={() => decide(item, true)} className="h-12 rounded-xl bg-emerald-700 text-sm font-semibold text-white disabled:opacity-50">{busy === item.id ? 'Working…' : 'Approve'}</button>
              <button type="button" disabled={busy === item.id} onClick={() => decide(item, false)} className="h-12 rounded-xl border border-red-200 bg-red-50 text-sm font-semibold text-red-700 disabled:opacity-50">{busy === item.id ? 'Working…' : 'Decline'}</button>
            </div>
          </div>
        ))}
        {!items.length && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No pending requests. New Pay and Add money requests appear here.</div>}
      </div>
    </div>
  );
}
