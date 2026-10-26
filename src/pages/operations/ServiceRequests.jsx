import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import StatusBadge from '@/components/vantoris/StatusBadge';
import { fulfillService } from '@/lib/platformFulfill';
import OperationsPageLayout from '@/components/vantoris/OperationsPageLayout';
import InternalComments from '@/components/vantoris/InternalComments';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Check, X, Wrench, FileText, Plus, Trash2, MessageSquare } from 'lucide-react';
import { logAuditEntry } from '@/lib/auditLogger';
import { useToast } from '@/components/ui/use-toast';

export default function ServiceRequests() {
  const [requests, setRequests] = useState([]);
  const [users, setUsers] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [newTemplate, setNewTemplate] = useState({ title: '', body: '', category: 'general' });
  const [savingTemplate, setSavingTemplate] = useState(false);
  const { toast } = useToast();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    try {
      const [reqs, usrs, tmpls] = await Promise.all([
        base44.entities.ServiceRequest.list('-created_date', 100),
        base44.entities.User.list('-created_date', 100),
        base44.entities.ServiceTemplate.list('-created_date', 100),
      ]);
      setRequests(reqs);
      setUsers(usrs);
      setTemplates(tmpls);
      } catch (e) {
      console.error(e);
      toast({ title: 'Load failed', description: e.message || 'Unable to load data.', variant: 'destructive' });
      }
      setLoading(false);
  }

  async function handleCreateTemplate() {
    if (!newTemplate.title || !newTemplate.body) return;
    setSavingTemplate(true);
    try {
      await base44.entities.ServiceTemplate.create(newTemplate);
      setNewTemplate({ title: '', body: '', category: 'general' });
      loadData();
      toast({ title: 'Template created', description: 'Response template saved successfully.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Save failed', description: e.message || 'Unable to create template.', variant: 'destructive' });
    }
    setSavingTemplate(false);
  }

  async function handleDeleteTemplate(id) {
    try {
      await base44.entities.ServiceTemplate.delete(id);
      loadData();
      toast({ title: 'Template deleted', description: 'Response template removed.' });
    } catch (e) {
      console.error(e);
      toast({ title: 'Delete failed', description: e.message || 'Unable to delete template.', variant: 'destructive' });
    }
  }

  function applyTemplate(tmpl) {
    setAdminNotes(tmpl.body);
  }

  function getUser(id) { return users.find(u => u.id === id); }

  async function handleAction(status) {
    if (!selected) return;
    setSubmitting(true);
    try {
      const result = await fulfillService(selected, status === 'approved');
      await base44.entities.ServiceRequest.update(selected.id, {
        status,
        admin_notes: adminNotes,
      });
      await base44.entities.Notification.create({
        user_id: selected.user_id,
        title: status === 'approved' ? 'Service Request Approved' : 'Service Request Rejected',
        message: status === 'approved'
          ? `Your request for ${selected.service_type} has been approved. ${result.note || ''}`
          : `Your request for ${selected.service_type} was not approved. ${adminNotes || ''}`,
        type: status === 'approved' ? 'success' : 'warning',
      });
      await logAuditEntry({
        action_type: 'application_approved',
        description: `Service request ${status}: ${selected.service_type}`,
        details: `Notes: ${adminNotes || 'None'}`,
        target_user_id: selected.user_id,
      });
      setSelected(null);
      setAdminNotes('');
      loadData();
      toast({ title: status === 'approved' ? 'Request approved' : 'Request rejected', description: `${selected.service_type} request has been ${status}.` });
    } catch (e) {
      console.error(e);
      toast({ title: 'Action failed', description: e.message || 'Unable to process request.', variant: 'destructive' });
    }
    setSubmitting(false);
  }

  if (loading) {
    return (
      <OperationsPageLayout title="Service Requests" description="Review member service and product requests" icon={Wrench}>
        <div className="flex items-center justify-center h-48">
          <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
        </div>
      </OperationsPageLayout>
    );
  }

  return (
    <OperationsPageLayout title="Service Requests" description="Review member service and product requests" icon={Wrench}
      actions={
        <button
          onClick={() => setShowTemplates(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-brass/15 text-brass rounded-xl text-xs font-medium hover:bg-brass/25 transition-all"
        >
          <FileText size={14} /> Templates ({templates.length})
        </button>
      }
    >
      <div className="vantoris-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#242D38] bg-[#1a2535]">
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Member</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Service</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Details</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Date</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Status</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {requests.map(req => {
              const user = getUser(req.user_id);
              return (
                <tr key={req.id} className="border-b border-[#242D38]/40 hover:bg-[#242D38]/20 transition-all">
                  <td className="px-5 py-4">
                    <p className="text-white font-medium text-sm">{user?.full_name || '—'}</p>
                    <p className="text-[#AAB4C3] text-xs">{user?.email || ''}</p>
                  </td>
                  <td className="px-5 py-4 text-white text-sm">{req.service_type}</td>
                  <td className="px-5 py-4 text-[#AAB4C3] text-xs max-w-xs truncate">{req.details || '—'}</td>
                  <td className="px-5 py-4 text-[#AAB4C3] text-xs">
                    {new Date(req.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={req.status} /></td>
                  <td className="px-5 py-4">
                    {req.status === 'pending' && (
                      <button onClick={() => setSelected(req)} className="px-3 py-1.5 bg-brass/15 text-brass rounded-lg text-xs font-medium hover:bg-brass/25 transition-all">
                        Review
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {requests.length === 0 && (
              <tr><td colSpan={6} className="py-12 text-center text-[#AAB4C3]">No service requests</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Review Dialog */}
      <Dialog open={!!selected} onOpenChange={() => setSelected(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Review Service Request</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-card p-4 space-y-2">
                <div className="flex justify-between"><span className="text-[#AAB4C3] text-xs">Service</span><span className="text-white text-sm font-medium">{selected.service_type}</span></div>
                {selected.details && (
                  <div><span className="text-[#AAB4C3] text-xs">Details</span><p className="text-white text-sm mt-1">{selected.details}</p></div>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[#AAB4C3] text-xs uppercase tracking-wider">Admin Notes / Reply</label>
                  {templates.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <MessageSquare size={12} className="text-brass" />
                      <select
                        onChange={e => {
                          const tmpl = templates.find(t => t.id === e.target.value);
                          if (tmpl) applyTemplate(tmpl);
                          e.target.value = '';
                        }}
                        className="bg-[#242D38] border border-[#242D38] rounded-lg px-2 py-1 text-brass text-xs focus:outline-none cursor-pointer"
                        defaultValue=""
                      >
                        <option value="" disabled>Use template...</option>
                        {templates.map(t => (
                          <option key={t.id} value={t.id}>{t.title}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)} className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none resize-none selectable-content" rows={3} />
              </div>
              <InternalComments entityType="service_request" entityId={selected.id} />
              <div className="flex gap-3">
                <button onClick={() => handleAction('approved')} disabled={submitting} className="flex-1 py-3 bg-olive text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-olive/80 transition-all disabled:opacity-40">
                  <Check size={16} /> Approve
                </button>
                <button onClick={() => handleAction('rejected')} disabled={submitting} className="flex-1 py-3 bg-crimson text-white font-semibold rounded-xl flex items-center justify-center gap-2 hover:bg-crimson/80 transition-all disabled:opacity-40">
                  <X size={16} /> Reject
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Template Management Dialog */}
      <Dialog open={showTemplates} onOpenChange={() => setShowTemplates(false)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <FileText size={18} className="text-brass" /> Response Templates
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            {/* Existing templates */}
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {templates.map(tmpl => (
                <div key={tmpl.id} className="vantoris-card p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white text-sm font-medium">{tmpl.title}</p>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-brass/15 text-brass uppercase">{tmpl.category}</span>
                    </div>
                    <p className="text-[#AAB4C3] text-xs line-clamp-2 selectable-content">{tmpl.body}</p>
                  </div>
                  <button
                    onClick={() => handleDeleteTemplate(tmpl.id)}
                    className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-crimson/10 rounded-lg transition-all flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {templates.length === 0 && (
                <p className="text-[#AAB4C3] text-xs text-center py-4">No templates yet</p>
              )}
            </div>
            {/* New template form */}
            <div className="border-t border-[#242D38] pt-4 space-y-3">
              <p className="text-white text-sm font-medium flex items-center gap-2"><Plus size={14} className="text-brass" /> New Template</p>
              <input
                value={newTemplate.title}
                onChange={e => setNewTemplate({ ...newTemplate, title: e.target.value })}
                placeholder="Template title..."
                className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-2.5 text-white text-sm focus:border-brass/50 focus:outline-none"
              />
              <select
                value={newTemplate.category}
                onChange={e => setNewTemplate({ ...newTemplate, category: e.target.value })}
                className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-2.5 text-white text-sm focus:border-brass/50 focus:outline-none"
              >
                <option value="general">General</option>
                <option value="approval">Approval</option>
                <option value="rejection">Rejection</option>
                <option value="info">Info</option>
              </select>
              <textarea
                value={newTemplate.body}
                onChange={e => setNewTemplate({ ...newTemplate, body: e.target.value })}
                placeholder="Template response text..."
                className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-2.5 text-white text-sm focus:border-brass/50 focus:outline-none resize-none selectable-content"
                rows={3}
              />
              <button
                disabled={savingTemplate || !newTemplate.title || !newTemplate.body}
                onClick={handleCreateTemplate}
                className="w-full py-2.5 bg-brass text-[#0E1A2B] font-semibold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Plus size={14} /> {savingTemplate ? 'Saving...' : 'Add Template'}
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </OperationsPageLayout>
  );
}