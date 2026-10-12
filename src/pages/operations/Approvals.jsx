import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import { useToast } from '@/components/ui/use-toast';

const PENDING = new Set(['pending', 'requested', 'review']);

function isPending(item) {
  return PENDING.has(String(item.status || 'pending').toLowerCase());
}

export default function Approvals() {
  const [me, setMe] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState('');
  const { toast } = useToast();

  async function load() {
    const user = await base44.auth.me().catch(() => null);
    setMe(user);
    const [txns, notes] = await Promise.all([
      base44.entities.Transaction.list('-created_date', 200).catch(() => []),
      user ? base44.entities.Notification.filter({ user_id: user.id }, '-created_date', 80).catch(() => []) : [],
    ]);
    const money = (Array.isArray(txns) ? txns : [])
      .filter((t) => isPending(t))
      .map((t) => ({ kind: 'money', id: t.id, title: t.type || 'transaction', detail: t.description || 'No description', amount: t.amount, user_id: t.user_id, account_id: t.account_id, raw: t }));
    const requests = (Array.isArray(notes) ? notes : [])
      .filter((n) => /request/i.test(n.title || '') && isPending(n))
      .map((n) => ({ kind: 'request', id: n.id, title: n.title, detail: n.message, amount: null, user_id: n.user_id, raw: n }));
    setItems([...money, ...requests]);
  }

  useEffect(() => { load().catch(() => {}); }, []);

  async function decide(item, approved) {
    setBusy(item.id);
    try {
      if (item.kind === 'money') {
        const txn = item.raw;
        if (approved) {
          const account = txn.account_id ? await base44.entities.Account.get(txn.account_id).catch(() => null) : null;
          const value = Math.abs(Number(txn.amount) || 0);
          const credit = txn.type === 'deposit' || Number(txn.amount) > 0;
          const next = account ? Math.round(((account.balance || 0) + (credit ? value : -value)) * 100) / 100 : null;
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
          }).catch(() => {});
        }
      } else {
        await base44.entities.Notification.update(item.id, { status: approved ? 'approved' : 'declined' }).catch(() => {});
        if (item.user_id && item.user_id !== me?.id) {
          await base44.entities.Notification.create({
            user_id: item.user_id,
            title: approved ? 'Request approved' : 'Request declined',
            message: item.detail || item.title,
            type: approved ? 'info' : 'warning',
          }).catch(() => {});
        }
      }
      toast({ title: approved ? 'Approved' : 'Declined' });
      await load();
    } catch (e) {
      toast({ title: 'Action failed', description: e.message || 'The backend rejected this decision.', variant: 'destructive' });
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="min-h-screen bg-[#F4F6F9] px-5 pb-28 pt-6">
      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Operators</p>
      <h1 className="mt-1 text-3xl font-bold text-navy">Approvals</h1>
      <p className="mt-1 text-sm text-slate-500">Approve posts the money. Decline leaves the balance unchanged.</p>
      <div className="mt-6 space-y-3">
        {items.map((item) => (
          <div key={`${item.kind}-${item.id}`} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-brass">{item.title}</p>
            <p className="mt-1 font-semibold text-navy">{item.detail}</p>
            {item.amount != null && <p className="mt-1 text-sm">{formatCurrency(item.amount)}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy === item.id} onClick={() => decide(item, true)} className="h-11 rounded-xl bg-navy text-sm font-semibold text-white disabled:opacity-50">Approve</button>
              <button type="button" disabled={busy === item.id} onClick={() => decide(item, false)} className="h-11 rounded-xl border border-slate-300 text-sm font-semibold text-slate-700 disabled:opacity-50">Decline</button>
            </div>
          </div>
        ))}
        {!items.length && <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No pending requests.</div>}
      </div>
    </div>
  );
}
