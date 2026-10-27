import React, { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import { ArrowUpRight, Loader2, Check, X } from 'lucide-react';
import { formatCurrency } from '@/lib/formatCurrency';
import { useToast } from '@/components/ui/use-toast';

export default function InvestmentWithdrawals() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState('');
  const { toast } = useToast();

  const loadData = useCallback(async () => {
    const reqs = await base44.entities.InvestmentWithdrawalRequest.list('-created_date');
    setRequests(reqs);
  }, []);

  useEffect(() => { loadData().finally(() => setLoading(false)); }, [loadData]);

  async function handleAction(req, action) {
    setProcessing(req.id);
    try {
      const result = await base44.functions.invoke('processInvestmentRequest', {
        request_type: 'withdrawal',
        request_id: req.id,
        decision: action === 'approve' ? 'approve' : 'decline',
      });
      if (result?.data?.error) throw new Error(result.data.error);
      const expectedStatus = action === 'approve' ? 'completed' : 'rejected';
      if (!result?.data?.success || result?.data?.status !== expectedStatus) {
        throw new Error('Request outcome was not confirmed. Refresh the request status before retrying.');
      }

      toast({
        title: action === 'approve' ? 'Withdrawal completed' : 'Withdrawal rejected',
        description: action === 'approve'
          ? `${formatCurrency(req.amount)} transferred between the member's bank account and investment portfolio.`
          : 'The request was rejected without changing balances.',
      });
      await loadData();
    } catch (err) {
      toast({
        title: 'Action requires review',
        description: err.message || 'Check request and ledger status before retrying to avoid duplicate posting.',
        variant: 'destructive',
      });
      await loadData().catch(() => {});
    } finally {
      setProcessing('');
    }
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="animate-spin text-brass" /></div>;

  return (
    <OperationsPageLayout title="Investment Withdrawal Requests" description="Review and approve member withdrawal requests" icon={ArrowUpRight}>
      {requests.length === 0 ? (
        <div className="vantoris-glass p-12 text-center">
          <p className="text-gray">No withdrawal requests.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(req => (
            <div key={req.id} className="vantoris-glass p-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-bold text-foreground">{formatCurrency(req.amount)}</p>
                <p className="text-xs text-gray mt-0.5">
                  Submitted: {req.created_date?.substring(0, 10)} · Status: <span className="capitalize">{req.status.replace(/_/g, ' ')}</span>
                </p>
                {(req.failure_reason || req.review_notes) && <p className="text-xs text-gray mt-1">Notes: {req.failure_reason || req.review_notes}</p>}
              </div>
              {req.status === 'requested' && (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleAction(req, 'approve')}
                    disabled={processing === req.id}
                    className="px-3 py-2 rounded-lg bg-mint/10 text-mint text-xs font-semibold hover:bg-mint/20 transition flex items-center gap-1.5"
                  >
                    <Check size={14} /> Approve
                  </button>
                  <button
                    onClick={() => handleAction(req, 'reject')}
                    disabled={processing === req.id}
                    className="px-3 py-2 rounded-lg bg-crimson/10 text-crimson text-xs font-semibold hover:bg-crimson/20 transition flex items-center gap-1.5"
                  >
                    <X size={14} /> Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </OperationsPageLayout>
  );
}