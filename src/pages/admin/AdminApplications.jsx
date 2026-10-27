import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import StatusBadge from '@/components/vantoris/StatusBadge';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X, CheckSquare, Square, Mail, FileText, ExternalLink } from 'lucide-react';
import { logAuditEntry } from '@/lib/auditLogger';
import { hasOperationsAccess } from '@/lib/operationsAccess';
import { useToast } from '@/components/ui/use-toast';

export default function AdminApplications() {
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [openingBalance, setOpeningBalance] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkMode, setBulkMode] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const { toast } = useToast();

  useEffect(() => { loadApps(); }, []);

  async function loadApps() {
    const apps = await base44.entities.Application.list('-created_date', 50);
    setApplications(apps);
    setLoading(false);
  }

  async function handleSendReminders() {
    setSendingReminders(true);
    setReminderResult(null);
    try {
      const now = Date.now();
      const stale = applications.filter(a => {
        const created = new Date(a.created_date).getTime();
        const hoursOld = (now - created) / (1000 * 60 * 60);
        return a.application_status === 'pending' && hoursOld >= 48;
      });
      let sent = 0;
      for (const app of stale) {
        await base44.integrations.Core.SendEmail({
          to: app.email,
          subject: 'Complete Your Vantoris Application',
          body: `Dear ${app.full_name},\n\nWe noticed your Vantoris membership application is still incomplete. You're just a few steps away from accessing your wealth management portal.\n\nPlease log in to your account and complete your application to proceed:\n- Submit any remaining details\n- Complete KYC verification\n\nIf you have any questions, our team is here to help.\n\nWarm regards,\nThe Vantoris Team`,
        });
        await base44.entities.Notification.create({
          user_id: app.user_id,
          title: 'Complete Your Application',
          message: 'Your application has been pending for over 48 hours. Please complete it to proceed.',
          type: 'action',
          link: '/apply',
        });
        sent++;
      }
      setReminderResult({ sent, total: stale.length });
      toast({ title: 'Reminders sent', description: `${sent} reminder${sent !== 1 ? 's' : ''} sent to stale applications.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Reminders failed', description: e.message || 'Unable to send reminders.', variant: 'destructive' });
    }
    setSendingReminders(false);
  }

  const bulkEligible = applications.filter(a => a.application_status === 'pending' && a.kyc_status === 'approved');

  function toggleSelect(id) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  }

  function toggleSelectAll() {
    if (selectedIds.length === bulkEligible.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(bulkEligible.map(a => a.id));
    }
  }

  async function handleBulkApprove() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      for (const id of selectedIds) {
        const app = applications.find(a => a.id === id);
        if (!app) continue;
        const applicant = await base44.entities.User.get(app.user_id);
        if (hasOperationsAccess(applicant?.role)) continue;
        const result = await base44.functions.invoke('generateAccount', {
          user_id: app.user_id,
          account_type: app.account_type,
          account_name: app.business_name
            ? `${app.business_name} (${app.account_type})`
            : `${app.full_name} - ${app.account_type}`,
          application_id: app.id,
          opening_balance: 0,
        });
        if (result?.data?.error) throw new Error(result.data.error);
        if (!result?.data?.success) throw new Error(`Account opening was not confirmed for application ${id}.`);
      }
      setSelectedIds([]);
      setBulkMode(false);
      loadApps();
      toast({ title: 'Bulk approve complete', description: `${selectedIds.length} application${selectedIds.length !== 1 ? 's' : ''} approved.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Bulk approve failed', description: e.message || 'Unable to approve applications.', variant: 'destructive' });
    }
    setSubmitting(false);
  }

  async function handleBulkReject() {
    if (selectedIds.length === 0) return;
    setSubmitting(true);
    try {
      for (const id of selectedIds) {
        const app = applications.find(a => a.id === id);
        if (!app) continue;
        await base44.entities.Application.update(id, {
          application_status: 'rejected',
          admin_notes: 'Bulk rejected',
        });
        await base44.entities.Notification.create({
          user_id: app.user_id,
          title: 'Application Not Approved',
          message: 'Your application was not approved at this time.',
          type: 'warning',
        });
      }
      setSelectedIds([]);
      setBulkMode(false);
      loadApps();
      toast({ title: 'Bulk reject complete', description: `${selectedIds.length} application${selectedIds.length !== 1 ? 's' : ''} rejected.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Bulk reject failed', description: e.message || 'Unable to reject applications.', variant: 'destructive' });
    }
    setSubmitting(false);
  }

  async function handleApprove() {
    if (!selected) return;
    setSubmitting(true);
    try {
      const applicant = await base44.entities.User.get(selected.user_id);
      if (hasOperationsAccess(applicant?.role)) {
        setAdminNotes('Cannot approve — this user has an administrative role and cannot hold member accounts.');
        setSubmitting(false);
        return;
      }

      const balance = openingBalance.trim() === '' ? 0 : Number(openingBalance);
      if (!Number.isFinite(balance) || balance !== 0) {
        toast({
          title: 'Opening balance must be zero',
          description: 'New accounts start at zero. Record an opening deposit only after funds are verified and settled through the approved ledger workflow.',
          variant: 'destructive',
        });
        setSubmitting(false);
        return;
      }

      const result = await base44.functions.invoke('generateAccount', {
        user_id: selected.user_id,
        account_type: selected.account_type,
        account_name: selected.business_name
          ? `${selected.business_name} (${selected.account_type})`
          : `${selected.full_name} - ${selected.account_type}`,
        application_id: selected.id,
        opening_balance: 0,
        admin_notes: adminNotes,
      });
      if (result?.data?.error) throw new Error(result.data.error);
      if (!result?.data?.success) throw new Error('Account opening was not confirmed. Refresh the application before retrying.');

      setSelected(null);
      setOpeningBalance('');
      setAdminNotes('');
      await loadApps();
      toast({
        title: result.data.existing_account ? 'Account already opened' : 'Application approved',
        description: `${selected.full_name}'s ${selected.account_type} account is active at a zero opening balance.`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Approval requires review', description: e.message || 'Check application and account status before retrying.', variant: 'destructive' });
      await loadApps().catch(() => {});
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReject() {
    if (!selected) return;
    setSubmitting(true);
    try {
      await base44.entities.Application.update(selected.id, {
        application_status: 'rejected',
        admin_notes: adminNotes,
      });
      await base44.entities.Notification.create({
        user_id: selected.user_id,
        title: 'Application Not Approved',
        message: adminNotes || 'Your application was not approved at this time.',
        type: 'warning',
      });
      await logAuditEntry({
        action_type: 'application_rejected',
        description: `Application rejected for ${selected.full_name}`,
        details: `Reason: ${adminNotes || 'No reason provided'}`,
        target_user_id: selected.user_id,
      });
      setSelected(null);
      setAdminNotes('');
      loadApps();
      toast({ title: 'Application rejected', description: `${selected.full_name}'s application has been rejected.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Rejection failed', description: e.message || 'Unable to reject application.', variant: 'destructive' });
    }
    setSubmitting(false);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
    </div>;
  }

  return (
    <OperationsPageLayout
      title="Applications"
      description="Review and approve member applications"
      icon={FileText}
      breadcrumb="Operations Center"
      actions={
        <button
          onClick={handleSendReminders}
          disabled={sendingReminders}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brass/12 text-brass rounded-xl text-sm font-medium hover:bg-brass/20 transition-all disabled:opacity-40 whitespace-nowrap border border-brass/20"
        >
          <Mail size={16} /> {sendingReminders ? 'Sending...' : 'Send Reminders'}
        </button>
      }
    >
      {reminderResult && (
        <p className="text-muted-foreground text-sm mb-4">
          {reminderResult.sent > 0
            ? `✓ Sent ${reminderResult.sent} reminder${reminderResult.sent > 1 ? 's' : ''}`
            : 'No stale applications found'}
        </p>
      )}

      {/* Bulk Action Bar */}
      {bulkEligible.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => { setBulkMode(!bulkMode); setSelectedIds([]); }}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all border ${
                bulkMode
                  ? 'bg-brass/12 text-brass border-brass/20'
                  : 'bg-card text-muted-foreground border-border hover:text-foreground hover:bg-slate/50'
              }`}
            >
              <CheckSquare size={14} /> Bulk Select
            </button>
            {bulkMode && selectedIds.length > 0 && (
              <span className="text-muted-foreground text-xs">{selectedIds.length} selected</span>
            )}
          </div>
          {bulkMode && selectedIds.length > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleBulkApprove}
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-mint text-white rounded-xl text-xs font-semibold hover:bg-mint/90 transition-all disabled:opacity-40 whitespace-nowrap"
              >
                <Check size={14} /> Approve
              </button>
              <button
                onClick={handleBulkReject}
                disabled={submitting}
                className="flex items-center justify-center gap-1.5 px-4 py-2 bg-crimson text-white rounded-xl text-xs font-semibold hover:bg-crimson/90 transition-all disabled:opacity-40 whitespace-nowrap"
              >
                <X size={14} /> Reject
              </button>
            </div>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block vantoris-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-slate/50">
              {bulkMode && (
                <th className="px-3 py-3 w-10">
                  <button onClick={toggleSelectAll} className="text-muted-foreground hover:text-brass transition-all">
                    {selectedIds.length === bulkEligible.length && bulkEligible.length > 0
                      ? <CheckSquare size={16} className="text-brass" />
                      : <Square size={16} />}
                  </button>
                </th>
              )}
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Applicant</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Type</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">KYC</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Date</th>
              <th className="text-left text-muted-foreground text-xs font-semibold uppercase tracking-wider px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {applications.map(app => {
              const isBulkEligible = bulkMode && app.application_status === 'pending' && app.kyc_status === 'approved';
              return (
                <tr key={app.id} className={`border-b border-border/60 hover:bg-slate/30 transition-all ${
                  selectedIds.includes(app.id) ? 'bg-brass/5' : ''
                }`}>
                  {bulkMode && (
                    <td className="px-3 py-4">
                      {isBulkEligible ? (
                        <button onClick={() => toggleSelect(app.id)} className="text-muted-foreground hover:text-brass">
                          {selectedIds.includes(app.id)
                            ? <CheckSquare size={16} className="text-brass" />
                            : <Square size={16} />}
                        </button>
                      ) : (
                        <span className="inline-block w-4" />
                      )}
                    </td>
                  )}
                  <td className="px-5 py-4">
                    <p className="text-foreground font-medium">{app.full_name}</p>
                    <p className="text-muted-foreground text-xs">{app.email}</p>
                  </td>
                  <td className="px-5 py-4 text-foreground">{app.account_type}</td>
                  <td className="px-5 py-4"><StatusBadge status={app.kyc_status} /></td>
                  <td className="px-5 py-4"><StatusBadge status={app.application_status} /></td>
                  <td className="px-5 py-4 text-muted-foreground text-xs">
                    {new Date(app.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    {app.application_status === 'pending' && app.kyc_status === 'approved' && (
                      <button
                        onClick={() => setSelected(app)}
                        className="px-3 py-1.5 bg-navy/8 text-navy rounded-lg text-xs font-medium hover:bg-navy/14 transition-all border border-navy/10"
                      >
                        Review
                      </button>
                    )}
                    {app.application_status === 'pending' && app.kyc_status !== 'approved' && (
                      <span className="text-muted-foreground text-xs">Awaiting KYC</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {applications.length === 0 && (
              <tr>
                <td colSpan={bulkMode ? 7 : 6} className="py-12 text-center text-muted-foreground">No applications</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {applications.map(app => {
          const isBulkEligible = bulkMode && app.application_status === 'pending' && app.kyc_status === 'approved';
          return (
            <div key={app.id} className={`vantoris-card p-4 space-y-2 ${selectedIds.includes(app.id) ? 'border-brass/40' : ''}`}>
              {bulkMode && (
                <div className="flex items-center gap-2">
                  {isBulkEligible ? (
                    <button onClick={() => toggleSelect(app.id)} className="text-muted-foreground">
                      {selectedIds.includes(app.id) ? <CheckSquare size={16} className="text-brass" /> : <Square size={16} />}
                    </button>
                  ) : <span className="inline-block w-4" />}
                </div>
              )}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-foreground font-medium text-sm">{app.full_name}</p>
                  <p className="text-muted-foreground text-xs">{app.email}</p>
                </div>
                <StatusBadge status={app.application_status} />
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-foreground">{app.account_type}</span>
                <span className="text-muted-foreground">{new Date(app.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={app.kyc_status} />
                {app.application_status === 'pending' && app.kyc_status === 'approved' && !bulkMode && (
                  <button onClick={() => setSelected(app)} className="flex-1 py-2 bg-navy/8 text-navy rounded-lg text-xs font-medium border border-navy/10">
                    Review
                  </button>
                )}
                {app.application_status === 'pending' && app.kyc_status !== 'approved' && (
                  <span className="text-muted-foreground text-xs">Awaiting KYC</span>
                )}
              </div>
            </div>
          );
        })}
        {applications.length === 0 && <p className="text-center text-muted-foreground py-8">No applications</p>}
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-foreground">Review Application</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-glass-flat p-4">
                <p className="text-foreground font-medium">{selected.full_name}</p>
                <p className="text-muted-foreground text-xs">{selected.email}</p>
                <p className="text-muted-foreground text-xs mt-1">Type: {selected.account_type}</p>
                {selected.business_name && <p className="text-muted-foreground text-xs">Business: {selected.business_name}</p>}
                {selected.address && <p className="text-muted-foreground text-xs">Address: {selected.address}</p>}
              </div>
              {selected.opening_receipt_url && (
                <div className="vantoris-glass-flat p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-brass" />
                    <p className="text-foreground text-sm font-medium">Opening Contribution Receipt</p>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Amount</span>
                    <span className="text-foreground font-medium">{formatCurrency(selected.opening_balance || 0)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Method</span>
                    <span className="text-foreground font-medium">{selected.opening_payment_method || '—'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className={`font-medium ${
                      selected.opening_contribution_status === 'approved' ? 'text-mint' :
                      selected.opening_contribution_status === 'rejected' ? 'text-crimson' :
                      selected.opening_contribution_status === 'pending' ? 'text-brass' :
                      'text-muted-foreground'
                    }`}>
                      {selected.opening_contribution_status === 'approved' ? 'Verified' :
                       selected.opening_contribution_status === 'rejected' ? 'Rejected' :
                       selected.opening_contribution_status === 'pending' ? 'Pending Verification' :
                       'Not Submitted'}
                    </span>
                  </div>
                  <a
                    href={selected.opening_receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-brass text-xs font-medium hover:underline mt-1"
                  >
                    <ExternalLink size={12} /> View Receipt
                  </a>
                </div>
              )}
              <div>
                <label className="text-muted-foreground text-xs uppercase tracking-wider mb-1.5 block">Opening Balance (USD)</label>
                <input
                  type="number"
                  value={openingBalance}
                  onChange={e => setOpeningBalance(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none"
                  placeholder="0.00"
                />
                <p className="text-muted-foreground text-[11px] mt-1">Enter the amount received via wire/deposit outside the app</p>
              </div>
              <div>
                <label className="text-muted-foreground text-xs uppercase tracking-wider mb-1.5 block">Admin Notes</label>
                <textarea
                  value={adminNotes}
                  onChange={e => setAdminNotes(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-3 text-foreground text-sm focus:border-brass/50 focus:outline-none resize-none"
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={submitting}
                  className="flex-1 py-3 bg-mint text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-mint/90 transition-all disabled:opacity-40"
                >
                  <Check size={16} /> Approve
                </button>
                <button
                  onClick={handleReject}
                  disabled={submitting}
                  className="flex-1 py-3 bg-crimson text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-crimson/90 transition-all disabled:opacity-40"
                >
                  <X size={16} /> Reject
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </OperationsPageLayout>
  );
}