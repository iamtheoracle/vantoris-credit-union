import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import { Bell, Search, Check, X } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

export default function OperationsNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const { toast } = useToast();

  async function decide(note, approved) {
    setBusy(note.id);
    try {
      const txnId = (String(note.message || '').match(/txn:([A-Za-z0-9_-]+)/) || [])[1];
      if (txnId) {
        const txn = await base44.entities.Transaction.get(txnId).catch(() => null);
        if (txn) {
          if (approved && txn.account_id) {
            const account = await base44.entities.Account.get(txn.account_id).catch(() => null);
            const value = Math.abs(Number(txn.amount) || 0);
            const credit = txn.type === 'deposit' || Number(txn.amount) > 0;
            const next = account ? Math.round(((Number(account.balance) || 0) + (credit ? value : -value)) * 100) / 100 : null;
            if (account && next != null) await base44.entities.Account.update(account.id, { balance: next });
            await base44.entities.Transaction.update(txn.id, { status: 'approved', balance_after: next });
          } else {
            await base44.entities.Transaction.update(txn.id, { status: 'declined' });
          }
        }
      }
      await base44.entities.Notification.update(note.id, { status: approved ? 'approved' : 'declined' });
      setNotifications((rows) => rows.map((row) => row.id === note.id ? { ...row, status: approved ? 'approved' : 'declined' } : row));
      toast({ title: approved ? 'Approved' : 'Declined' });
    } catch (e) {
      toast({ title: 'Action failed', description: e.message || 'The backend rejected this decision.', variant: 'destructive' });
    } finally {
      setBusy('');
    }
  }

  useEffect(() => {
    (async () => {
      try {
        const notifs = await base44.entities.Notification.list('-created_date', 100);
        setNotifications(notifs);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, []);

  const filtered = notifications.filter(n =>
    (n.title || '').toLowerCase().includes(search.toLowerCase()) ||
    (n.message || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <OperationsPageLayout title="Notifications" description="All notifications sent across the platform" icon={Bell}>
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <div className="relative mb-6">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AAB4C3]" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notifications..."
              className="w-full bg-[#242D38] border border-[#242D38] rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
            />
          </div>
          <div className="vantoris-card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#242D38] bg-[#1a2535]">
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Title</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Message</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Type</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Date</th>
                  <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Decision</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => (
                  <tr key={n.id} className="border-b border-[#242D38]/40 hover:bg-[#242D38]/20 transition-all">
                    <td className="px-5 py-4 text-white font-medium text-xs">{n.title}</td>
                    <td className="px-5 py-4 text-[#AAB4C3] text-xs max-w-xs truncate">{n.message}</td>
                    <td className="px-5 py-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        n.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' :
                        n.type === 'warning' ? 'bg-brass/10 text-brass' :
                        n.type === 'action' ? 'bg-blue-500/10 text-blue-400' :
                        'bg-[#242D38] text-[#AAB4C3]'
                      }`}>{n.type}</span>
                    </td>
                    <td className="px-5 py-4 text-[#AAB4C3] text-xs">{n.created_date?.split('T')[0]}</td>
                    <td className="px-5 py-4">
                      {/request/i.test(`${n.title || ''} ${n.message || ''}`) && !['approved', 'declined'].includes(n.status) && (
                        <div className="flex gap-2">
                          <button type="button" disabled={busy === n.id} onClick={() => decide(n, true)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white"><Check size={12} /> Approve</button>
                          <button type="button" disabled={busy === n.id} onClick={() => decide(n, false)} className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"><X size={12} /> Decline</button>
                        </div>
                      )}
                      {n.status && <span className="text-xs text-[#AAB4C3]">{n.status}</span>}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-[#AAB4C3]">No notifications found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </OperationsPageLayout>
  );
}