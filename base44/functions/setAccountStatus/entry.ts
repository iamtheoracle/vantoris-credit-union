import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'A JSON object is required' }, { status: 400 });
    }
    const accountId = typeof body.account_id === 'string' ? body.account_id.trim() : '';
    if (!accountId || accountId.length > 200) {
      return Response.json({ error: 'A valid account_id is required' }, { status: 400 });
    }

    const account = await base44.asServiceRole.entities.Account.get(accountId).catch(() => null);
    if (!account) return Response.json({ error: 'Account not found' }, { status: 404 });
    const currentStatus = String(account.status || '').toLowerCase();
    if (!['active', 'frozen'].includes(currentStatus)) {
      return Response.json({ error: 'Only active or frozen accounts can be toggled. Closed accounts remain closed.' }, { status: 409 });
    }
    const nextStatus = currentStatus === 'frozen' ? 'active' : 'frozen';
    const changed = await base44.asServiceRole.entities.Account.updateMany(
      { id: account.id, status: account.status },
      { $set: { status: nextStatus } }
    );
    if (changed.updated !== 1) {
      return Response.json({ error: 'Account status changed concurrently; refresh before retrying' }, { status: 409 });
    }

    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'account_status_changed',
      description: `Account ${nextStatus === 'frozen' ? 'FROZEN' : 'UNFROZEN'} by ${user.full_name || user.email || user.id}: ${account.account_name || account.id}`,
      details: JSON.stringify({ previous_status: account.status, new_status: nextStatus }),
      account_id: account.id,
      target_user_id: account.user_id,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    }).catch(() => {});

    await base44.asServiceRole.entities.Notification.create({
      user_id: account.user_id,
      title: nextStatus === 'frozen' ? 'Account Frozen' : 'Account Unfrozen',
      message: nextStatus === 'frozen'
        ? `Your ${account.account_name || 'account'} has been frozen and is unavailable for transactions.`
        : `Your ${account.account_name || 'account'} has been unfrozen.`,
      type: nextStatus === 'frozen' ? 'warning' : 'success',
    }).catch(() => {});

    return Response.json({ success: true, account_id: account.id, previous_status: account.status, status: nextStatus });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Account status update failed' }, { status: 500 });
  }
}
