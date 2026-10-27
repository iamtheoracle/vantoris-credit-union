import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { formatCurrency } from '@/lib/formatCurrency';
import { Users, Search, Plus, Wallet, Download, StickyNote, UserPlus, Trash2, History } from 'lucide-react';
import MemberActivityFeed from '@/components/vantoris/MemberActivityFeed';
import { logAuditEntry } from '@/lib/auditLogger';
import { exportToCsv } from '@/lib/exportCsv';
import { useToast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import InviteUserDialog from '@/components/vantoris/InviteUserDialog';

const ACCOUNT_TYPES = ['Checking', 'Savings', 'Money Market', 'CD', 'Joint', 'Business'];

export default function AdminMembers() {
  const [users, setUsers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(null);
  const [acctForm, setAcctForm] = useState({ account_type: 'Checking', account_name: '', opening_balance: '' });
  const [creating, setCreating] = useState(false);
  const [notesMember, setNotesMember] = useState(null);
  const [notesText, setNotesText] = useState('');
  const [savingNotes, setSavingNotes] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [activityMember, setActivityMember] = useState(null);
  const [referrals, setReferrals] = useState([]);
  const { toast } = useToast();

  useEffect(() => { loadData(); }, []);

  async function loadData() {
    const [u, a, refs] = await Promise.all([
      base44.entities.User.list('-created_date', 50),
      base44.entities.Account.list('-created_date', 50),
      base44.entities.Referral.list('-created_date', 200),
    ]);
    setUsers(u);
    setAccounts(a);
    setReferrals(refs);
    setLoading(false);
  }

  async function handleDeleteMember() {
    if (!deleteTarget) return;
    // Financial records and audit history must not be deleted through this client screen.
    // A compliant retention/deactivation workflow is not implemented in this repository.
    toast({
      title: 'Permanent deletion blocked',
      description: 'Member deletion is disabled until a retention-aware deactivation workflow is available. Financial accounts, transactions, applications, and audit history must not be erased from this screen.',
      variant: 'destructive',
    });
    setDeleteTarget(null);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96">
      <div className="w-8 h-8 border-2 border-brass/30 border-t-brass rounded-full animate-spin" />
    </div>;
  }

  async function handleCreateAccount() {
    if (!showCreate) return;
    setCreating(true);
    try {
      const balance = acctForm.opening_balance.trim() === '' ? 0 : Number(acctForm.opening_balance);
      if (!Number.isFinite(balance) || balance !== 0) {
        throw new Error('New accounts start at zero. Record a deposit only after funds are verified and settled.');
      }

      const result = await base44.functions.invoke('generateAccount', {
        user_id: showCreate.id,
        account_type: acctForm.account_type,
        account_name: acctForm.account_name || `${showCreate.full_name} - ${acctForm.account_type}`,
        opening_balance: 0,
      });
      if (result?.data?.error) throw new Error(result.data.error);
      if (!result?.data?.success) throw new Error('Account creation was not confirmed. Refresh the member before retrying.');

      setShowCreate(null);
      setAcctForm({ account_type: 'Checking', account_name: '', opening_balance: '' });
      await loadData();
      toast({
        title: result.data.existing_account ? 'Account already exists' : 'Account created',
        description: `${acctForm.account_type} account created for ${showCreate.full_name} at zero balance.`,
      });
    } catch (e) {
      console.error(e);
      toast({ title: 'Account creation requires review', description: e.message || 'Check account status before retrying.', variant: 'destructive' });
      await loadData().catch(() => {});
    } finally {
      setCreating(false);
    }
  }

  function handleExportMembers() {
    const headers = ['Member Name', 'Email', 'Account Type', 'Account Number', 'Account Name', 'Balance', 'Status', 'Joined'];
    const rows = [];
    for (const member of members) {
      const memberAccts = accounts.filter(a => a.user_id === member.id);
      if (memberAccts.length === 0) {
        rows.push({
          'Member Name': member.full_name || '',
          'Email': member.email || '',
          'Account Type': '—',
          'Account Number': '—',
          'Account Name': '—',
          'Balance': 0,
          'Status': '—',
          'Joined': new Date(member.created_date).toLocaleDateString(),
        });
      } else {
        for (const acct of memberAccts) {
          rows.push({
            'Member Name': member.full_name || '',
            'Email': member.email || '',
            'Account Type': acct.account_type || '',
            'Account Number': acct.account_number || '',
            'Account Name': acct.account_name || '',
            'Balance': acct.balance || 0,
            'Status': acct.status || '',
            'Joined': new Date(member.created_date).toLocaleDateString(),
          });
        }
      }
    }
    exportToCsv('vantoris_members_balances', headers, rows);
  }

  const members = users.filter(u => u.role === 'user');
  const filtered = members.filter(m =>
    (m.full_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (m.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const referrerMap = {};
  referrals.forEach(r => { if (r.referred_id) referrerMap[r.referred_id] = r.referrer_id; });
  function getReferrerName(userId) {
    const rid = referrerMap[userId];
    if (!rid) return null;
    const refUser = users.find(u => u.id === rid);
    return refUser?.full_name || null;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-white mb-1">Members</h1>
      <p className="text-[#AAB4C3] text-sm mb-6">{members.length} registered members</p>

      {/* Search + Actions */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mb-6">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-[#AAB4C3]" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search members..."
            className="w-full bg-[#242D38] border border-[#242D38] rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-3 bg-brass text-[#0E1A2B] rounded-xl text-xs font-semibold hover:bg-brass/90 transition-all whitespace-nowrap"
          >
            <UserPlus size={14} /> Invite
          </button>
          <button
            onClick={handleExportMembers}
            className="flex items-center justify-center gap-1.5 px-4 py-3 bg-olive/15 text-emerald-400 rounded-xl text-xs font-medium hover:bg-olive/25 transition-all whitespace-nowrap"
          >
            <Download size={14} /> Export
          </button>
        </div>
      </div>

      <div className="hidden md:block vantoris-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#242D38] bg-[#1a2535]">
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Member</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Email</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Referred By</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Accounts</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Total Balance</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Joined</th>
              <th className="text-left text-[#AAB4C3] text-xs font-medium uppercase tracking-wider px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(member => {
              const memberAccts = accounts.filter(a => a.user_id === member.id);
              const totalBal = memberAccts.reduce((sum, a) => sum + (a.balance || 0), 0);
              return (
                <tr key={member.id} className="border-b border-[#242D38]/40 hover:bg-[#242D38]/20 transition-all">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-brass/15 flex items-center justify-center">
                        <span className="text-brass text-xs font-bold">{(member.full_name || 'U').charAt(0)}</span>
                      </div>
                      <p className="text-white font-medium">{member.full_name || '—'}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-[#AAB4C3]">{member.email}</td>
                  <td className="px-5 py-4">
                    {getReferrerName(member.id) ? (
                      <span className="text-brass text-xs font-medium">{getReferrerName(member.id)}</span>
                    ) : (
                      <span className="text-[#AAB4C3]/40 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-white">{memberAccts.length}</td>
                  <td className="px-5 py-4 text-white font-medium">{formatCurrency(totalBal)}</td>
                  <td className="px-5 py-4 text-[#AAB4C3] text-xs">
                    {new Date(member.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => { setShowCreate(member); setAcctForm({ account_type: 'Personal', account_name: '', opening_balance: '' }); }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-brass/15 text-brass rounded-lg text-xs font-medium hover:bg-brass/25 transition-all"
                      >
                        <Plus size={12} /> Add Account
                      </button>
                      <button
                        onClick={() => { setNotesMember(member); setNotesText(member.admin_notes || ''); }}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${member.admin_notes ? 'bg-brass/25 text-brass' : 'bg-[#242D38] text-[#AAB4C3] hover:bg-[#242D38]/80 hover:text-white'}`}
                      >
                        <StickyNote size={12} /> Notes
                      </button>
                      <button
                        onClick={() => setActivityMember(member)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-[#242D38] text-[#AAB4C3] rounded-lg text-xs font-medium hover:bg-[#242D38]/80 hover:text-white transition-all"
                        title="View activity timeline"
                      >
                        <History size={12} /> Activity
                      </button>
                      <button
                        onClick={() => setDeleteTarget(member)}
                        className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-crimson/10 rounded-lg transition-all"
                        title="Delete member"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-12 text-center text-[#AAB4C3]">No members found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards */}
      <div className="md:hidden space-y-3">
        {filtered.map(member => {
          const memberAccts = accounts.filter(a => a.user_id === member.id);
          const totalBal = memberAccts.reduce((sum, a) => sum + (a.balance || 0), 0);
          return (
            <div key={member.id} className="vantoris-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-brass/15 flex items-center justify-center">
                  <span className="text-brass text-xs font-bold">{(member.full_name || 'U').charAt(0)}</span>
                </div>
                <div className="flex-1">
                  <p className="text-white font-medium text-sm">{member.full_name || '—'}</p>
                  <p className="text-[#AAB4C3] text-xs">{member.email}</p>
                </div>
              </div>
              {getReferrerName(member.id) && (
                <p className="text-brass text-xs">Referred by {getReferrerName(member.id)}</p>
              )}
              <div className="flex items-center justify-between text-xs">
                <span className="text-[#AAB4C3]">{memberAccts.length} accounts</span>
                <span className="text-white font-medium">{formatCurrency(totalBal)}</span>
              </div>
              <p className="text-[#AAB4C3] text-xs">Joined {new Date(member.created_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</p>
              <div className="flex items-center gap-2">
                <button onClick={() => { setShowCreate(member); setAcctForm({ account_type: 'Personal', account_name: '', opening_balance: '' }); }} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-brass/15 text-brass rounded-lg text-xs font-medium">
                  <Plus size={12} /> Add Account
                </button>
                <button onClick={() => { setNotesMember(member); setNotesText(member.admin_notes || ''); }} className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg text-xs font-medium ${member.admin_notes ? 'bg-brass/25 text-brass' : 'bg-[#242D38] text-[#AAB4C3]'}`}>
                  <StickyNote size={12} /> Notes
                </button>
                <button onClick={() => setActivityMember(member)} className="flex-1 flex items-center justify-center gap-1 px-3 py-2 bg-[#242D38] text-[#AAB4C3] rounded-lg text-xs font-medium">
                  <History size={12} /> Activity
                </button>
                <button onClick={() => setDeleteTarget(member)} className="flex items-center justify-center gap-1 px-3 py-2 bg-crimson/10 text-red-400 rounded-lg text-xs font-medium">
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <p className="text-center text-[#AAB4C3] py-8">No members found</p>}
      </div>

      <Dialog open={!!showCreate} onOpenChange={() => setShowCreate(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Create Account for {showCreate?.full_name}</DialogTitle>
          </DialogHeader>
          {showCreate && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-card p-3">
                <p className="text-white text-sm font-medium">{showCreate.full_name}</p>
                <p className="text-[#AAB4C3] text-xs">{showCreate.email}</p>
              </div>
              <div>
                <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Account Type</label>
                <Select
                  value={acctForm.account_type}
                  onValueChange={val => setAcctForm({ ...acctForm, account_type: val })}
                >
                  <SelectTrigger className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none h-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-[#242D38] border-[#242D38]">
                    {ACCOUNT_TYPES.map(type => (
                      <SelectItem key={type} value={type} className="text-white focus:bg-brass/15 focus:text-brass">
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Account Name</label>
                <input
                  value={acctForm.account_name}
                  onChange={e => setAcctForm({ ...acctForm, account_name: e.target.value })}
                  className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
                  placeholder={`${showCreate.full_name} - ${acctForm.account_type}`}
                />
              </div>
              <div>
                <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Opening Balance (USD)</label>
                <input
                  type="number"
                  value={acctForm.opening_balance}
                  onChange={e => setAcctForm({ ...acctForm, opening_balance: e.target.value })}
                  className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none"
                  placeholder="0.00"
                />
              </div>
              <button
                disabled={creating}
                onClick={handleCreateAccount}
                className="w-full py-3 bg-brass text-[#0E1A2B] font-semibold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
              >
                <Wallet size={16} /> {creating ? 'Creating...' : 'Create Account'}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Admin Notes Dialog */}
      <Dialog open={!!notesMember} onOpenChange={() => setNotesMember(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <StickyNote size={18} className="text-brass" />
              Admin Notes — {notesMember?.full_name}
            </DialogTitle>
          </DialogHeader>
          {notesMember && (
            <div className="space-y-4 mt-2">
              <div className="vantoris-card p-3">
                <p className="text-[#AAB4C3] text-xs">{notesMember.email}</p>
              </div>
              <div>
                <label className="text-[#AAB4C3] text-xs uppercase tracking-wider mb-1.5 block">Internal Notes (member cannot see these)</label>
                <textarea
                  value={notesText}
                  onChange={e => setNotesText(e.target.value)}
                  placeholder="Add internal context, special instructions, or compliance notes..."
                  className="w-full bg-[#242D38] border border-[#242D38] rounded-xl px-4 py-3 text-white text-sm focus:border-brass/50 focus:outline-none resize-none selectable-content"
                  rows={5}
                />
              </div>
              <button
                disabled={savingNotes}
                onClick={async () => {
                  setSavingNotes(true);
                  try {
                    await base44.entities.User.update(notesMember.id, { admin_notes: notesText });
                    await logAuditEntry({
                      action_type: 'account_status_changed',
                      description: `Updated admin notes for ${notesMember.full_name}`,
                      details: notesText || 'Notes cleared',
                      target_user_id: notesMember.id,
                    });
                    setNotesMember(null);
                    loadData();
                    toast({ title: 'Notes saved', description: `Admin notes updated for ${notesMember.full_name}.` });
                  } catch (e) {
                    console.error(e);
                    toast({ title: 'Save failed', description: e.message || 'Unable to save notes.', variant: 'destructive' });
                  }
                  setSavingNotes(false);
                }}
                className="w-full py-3 bg-brass text-[#0E1A2B] font-semibold rounded-xl disabled:opacity-40"
              >
                {savingNotes ? 'Saving...' : 'Save Notes'}
              </button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Activity Timeline Dialog */}
      <Dialog open={!!activityMember} onOpenChange={() => setActivityMember(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <History size={18} className="text-brass" />
              Activity Timeline — {activityMember?.full_name}
            </DialogTitle>
          </DialogHeader>
          {activityMember && (
            <div className="mt-2">
              <MemberActivityFeed memberId={activityMember.id} />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <InviteUserDialog open={showInvite} onOpenChange={setShowInvite} onInvited={loadData} />

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <DialogContent className="bg-[#0E1A2B] border-[#242D38] max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Trash2 size={18} className="text-red-400" /> Delete Member
            </DialogTitle>
          </DialogHeader>
          {deleteTarget && (
            <div className="space-y-4 mt-2">
              <p className="text-[#AAB4C3] text-sm">
                Are you sure you want to permanently delete <span className="text-white font-medium">{deleteTarget.full_name}</span> ({deleteTarget.email})?
                This will also remove all their accounts, transactions, and associated data. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleDeleteMember}
                  disabled={deleting}
                  className="flex-1 py-3 bg-crimson text-white font-semibold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2"
                >
                  <Trash2 size={16} /> {deleting ? 'Deleting...' : 'Delete Permanently'}
                </button>
                <button
                  onClick={() => setDeleteTarget(null)}
                  className="px-6 py-3 bg-[#242D38] text-[#AAB4C3] rounded-xl text-sm font-medium hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}