import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ACCOUNT_TYPES = new Set(['Checking', 'Savings', 'Money Market', 'CD', 'Joint', 'Business']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const user_id = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const account_type = typeof body.account_type === 'string' ? body.account_type.trim() : '';
    const account_name = typeof body.account_name === 'string' ? body.account_name.trim() : '';
    const application_id = typeof body.application_id === 'string' ? body.application_id.trim() : '';
    const openingBalance = body.opening_balance == null || body.opening_balance === '' ? 0 : Number(body.opening_balance);

    if (!user_id || !account_type || !account_name) {
      return Response.json({ error: 'user_id, account_type, and account_name are required' }, { status: 400 });
    }
    if (!ACCOUNT_TYPES.has(account_type)) {
      return Response.json({ error: 'Unsupported account_type' }, { status: 422 });
    }
    if (!Number.isFinite(openingBalance) || openingBalance !== 0) {
      return Response.json({
        error: 'New accounts must start at zero. Record any opening balance as a separately approved ledger transaction.',
      }, { status: 422 });
    }
    if (account_name.length > 100) {
      return Response.json({ error: 'account_name must be 100 characters or fewer' }, { status: 422 });
    }

    if (application_id) {
      const application = await base44.asServiceRole.entities.Application.get(application_id).catch(() => null);
      if (!application || application.user_id !== user_id || application.application_status !== 'approved') {
        return Response.json({ error: 'Application must exist, belong to the target member, and be approved' }, { status: 409 });
      }
      if (application.account_type && application.account_type !== account_type) {
        return Response.json({ error: 'Account type does not match the approved application' }, { status: 409 });
      }
    }

    // Generate a unique 10-digit account number. The entity API in this project
    // does not expose a verified database uniqueness constraint, so this remains
    // a collision check rather than a guarantee under concurrent account creation.
    const existingAccounts = await base44.asServiceRole.entities.Account.list('-created_date', 500);
    const existingNumbers = new Set((existingAccounts || []).map(a => a.account_number).filter(Boolean));

    let accountNumber = '';
    for (let attempts = 0; attempts < 100; attempts++) {
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      accountNumber = String(1000000000 + (random[0] % 9000000000));
      if (!existingNumbers.has(accountNumber)) break;
      accountNumber = '';
    }
    if (!accountNumber) {
      return Response.json({ error: 'Could not allocate an unused account number; retry later' }, { status: 503 });
    }

    // Placeholder institutional routing value retained from the existing app.
    // It must be validated with the institution/processor before real-money use.
    const routingNumber = '021000021';

    const account = await base44.asServiceRole.entities.Account.create({
      user_id,
      account_type,
      account_name,
      account_number: accountNumber,
      routing_number: routingNumber,
      balance: 0,
      status: 'active',
      ...(application_id ? { application_id } : {}),
    });

    await base44.asServiceRole.entities.Notification.create({
      user_id,
      title: 'Account Opened',
      message: `Your ${account_type} account has been opened. Account Number: ${accountNumber}, Routing Number: ${routingNumber}.`,
      type: 'success',
    }).catch(() => {});

    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'account_created',
      description: `Account created by administrator for user ${user_id}`,
      details: JSON.stringify({ account_id: account.id, account_type, application_id: application_id || null }),
      target_user_id: user_id,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    });

    return Response.json({
      success: true,
      account_id: account.id,
      account_number: accountNumber,
      routing_number: routingNumber,
      account_type,
      account_name,
      balance: 0,
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Account creation failed' }, { status: 500 });
  }
});
