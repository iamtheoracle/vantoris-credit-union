import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { FileText, ArrowUpRight, ShieldCheck, ChevronRight } from 'lucide-react';

export default function PendingApprovalsWidget() {
  const [data, setData] = useState({ apps: 0, withdrawals: 0, verifications: 0, kyc: 0, pay: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const [apps, withdrawals, verifications, txns] = await Promise.all([
          base44.entities.Application.list('-created_date', 100),
          base44.entities.WithdrawalRequest.filter({ status: 'pending' }),
          base44.entities.VerificationRequest.filter({ status: 'pending' }),
          base44.entities.Transaction.list('-created_date', 100).catch(() => []),
        ]);
        setData({
          apps: apps.filter(a => a.application_status === 'pending').length,
          withdrawals: withdrawals.length,
          verifications: verifications.length,
          kyc: apps.filter(a => a.kyc_status === 'pending').length,
          pay: (Array.isArray(txns) ? txns : []).filter(t => ['pending', 'requested', 'review'].includes(String(t.status || '').toLowerCase())).length,
        });
      } catch (e) { console.error(e); }
      setLoading(false);
    }
    load();
  }, []);

  if (loading) return <div className="vantoris-glass-premium p-5 h-48 vantoris-shimmer rounded-2xl" />;

  const items = [
    { label: 'Applications', count: data.apps, path: '/operations/applications', icon: FileText, accent: 'text-brass' },
    { label: 'Pay requests', count: data.pay, path: '/operations/approvals', icon: ArrowUpRight, accent: 'text-crimson' },
    { label: 'Withdrawals', count: data.withdrawals, path: '/operations/withdrawals', icon: ArrowUpRight, accent: 'text-crimson' },
    { label: 'Verifications', count: data.verifications, path: '/operations/verification-requests', icon: ShieldCheck, accent: 'text-brass' },
    { label: 'KYC Reviews', count: data.kyc, path: '/operations/kyc', icon: ShieldCheck, accent: 'text-mint' },
  ];
  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <div className="vantoris-glass-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-foreground font-semibold text-sm">Pending Approvals</h3>
        <span className="px-2.5 py-0.5 rounded-full bg-crimson/10 text-crimson text-xs font-bold border border-crimson/20">{total} Total</span>
      </div>
      <div className="space-y-1">
        {items.map(item => {
          const Icon = item.icon;
          return (
            <Link key={item.label} to={item.path} className="flex items-center gap-3 py-2.5 px-2 -mx-2 rounded-lg hover:bg-slate-50 transition-all group">
              <Icon size={15} className={item.accent} />
              <span className="text-foreground text-sm flex-1">{item.label}</span>
              <span className={`font-bold text-sm ${item.count > 0 ? item.accent : 'text-gray/40'}`}>{item.count}</span>
              <ChevronRight size={14} className="text-gray/30 group-hover:text-brass transition-colors" />
            </Link>
          );
        })}
      </div>
    </div>
  );
}