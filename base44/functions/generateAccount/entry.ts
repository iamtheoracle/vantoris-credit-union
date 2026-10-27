import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const ACCOUNT_TYPES = new Set(['Checking', 'Savings', 'Money Market', 'CD', 'Joint', 'Business']);
const PRIVILEGED_ROLES = new Set(['admin', 'administrator', 'executive', 'super_administrator', 'operations_manager', 'operations_officer', 'finance_officer', 'treasury_officer', 'compliance_officer', 'kyc_officer', 'auditor', 'it_administrator', 'risk_officer', 'customer_support', 'herobox_manager', 'volunteer_manager', 'shipping_manager', 'investment_manager', 'investment_officer']);

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user?.id) return Response.json({ error: 'Authentication required' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin access required' }, { status: 403 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'A JSON object is required' }, { status: 400 });
    }

    const user_id = typeof body.user_id === 'string' ? body.user_id.trim() : '';
    const account_type = typeof body.account_type === 'string' ? body.account_type.trim() : '';
    const account_name = typeof body.account_name === 'string' ? body.account_name.trim() : '';
    const application_id = typeof body.application_id === 'string' ? body.application_id.trim() : '';
    const admin_notes = typeof body.admin_notes === 'string' ? body.admin_notes.trim().slice(0, 2000) : '';
    const openingBalance = body.opening_balance == null || body.opening_balance === '' ? 0 : Number(body.opening_balance);

    if (!user_id || !account_type || !account_name) {
      return Response.json({ error: 'user_id, account_type, and account_name are required' }, { status: 400 });
    }
    if (user_id.length > 200 || application_id.length > 200) {
      return Response.json({ error: 'user_id and application_id must be 200 characters or fewer' }, { status: 400 });
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

    const targetUser = await base44.asServiceRole.entities.User.get(user_id).catch(() => null);
    if (!targetUser) return Response.json({ error: 'Target member was not found' }, { status: 404 });
    if (PRIVILEGED_ROLES.has(String(targetUser.role || '').toLowerCase())) {
      return Response.json({ error: 'Administrative and operations users cannot be approved as member account holders' }, { status: 403 });
    }

    let application: any = null;
    let originalApplicationStatus = '';
    let applicationClaimed = false;
    if (application_id) {
      application = await base44.asServiceRole.entities.Application.get(application_id).catch(() => null);
      if (!application || application.user_id !== user_id || !['pending', 'approved'].includes(application.application_status)) {
        return Response.json({ error: 'Application must exist, belong to the target member, and be pending or approved' }, { status: 409 });
      }
      if (application.kyc_status !== 'approved') {
        return Response.json({ error: 'KYC must be approved before an account can be opened' }, { status: 409 });
      }
      if (application.account_type && application.account_type !== account_type) {
        return Response.json({ error: 'Account type does not match the application' }, { status: 409 });
      }
      const linkedAccounts = await base44.asServiceRole.entities.Account.filter({ application_id }, '-created_date', 10);
      if (Array.isArray(linkedAccounts) && linkedAccounts.length > 0) {
        const existing = linkedAccounts.find((row: any) => row.user_id === user_id && row.account_type === account_type);
        if (existing?.status === 'active') {
          if (application.application_status === 'pending') {
            const approvedExisting = await base44.asServiceRole.entities.Application.updateMany(
              { id: application.id, application_status: 'pending', kyc_status: 'approved' },
              { $set: { application_status: 'approved', opening_balance: 0, admin_notes } }
            );
            if (approvedExisting.updated !== 1) {
              return Response.json({ error: 'Existing active account found, but application status could not be reconciled', account_id: existing.id }, { status: 409 });
            }
          }
          return Response.json({
            success: true,
            existing_account: true,
            account_id: existing.id,
            account_number: existing.account_number,
            routing_number: existing.routing_number,
            account_type: existing.account_type,
            account_name: existing.account_name,
            balance: Number(existing.balance || 0),
          });
        }
        return Response.json({ error: 'An account already exists for this application but is not active; reconcile it before retrying', account_id: existing?.id || null }, { status: 409 });
      }

      originalApplicationStatus = application.application_status;
      const claim = await base44.asServiceRole.entities.Application.updateMany(
        { id: application.id, application_status: originalApplicationStatus, kyc_status: 'approved' },
        { $set: { application_status: 'processing' } }
      );
      if (claim.updated !== 1) {
        return Response.json({ error: 'Application changed concurrently; refresh before retrying' }, { status: 409 });
      }
      applicationClaimed = true;
    }

    // Generate a unique 10-digit account number. The entity API in this project
    // does not expose a verified database uniqueness constraint, so this remains
    // a collision check rather than a guarantee under concurrent account creation.
    const existingNumbers = new Set<string>();
    const PAGE_SIZE = 500;
    let skip = 0;
    while (true) {
      const page = await base44.asServiceRole.entities.Account.filter({}, '-created_date', PAGE_SIZE, skip);
      const rows = Array.isArray(page) ? page : [];
      for (const account of rows) {
        if (account.account_number) existingNumbers.add(String(account.account_number));
      }
      if (rows.length < PAGE_SIZE) break;
      skip += PAGE_SIZE;
    }

    let accountNumber = '';
    for (let attempts = 0; attempts < 100; attempts++) {
      const random = new Uint32Array(2);
      crypto.getRandomValues(random);
      const entropy = (BigInt(random[0]) << 32n) | BigInt(random[1]);
      accountNumber = String(1000000000n + (entropy % 9000000000n));
      if (!existingNumbers.has(accountNumber)) break;
      accountNumber = '';
    }
    if (!accountNumber) {
      if (applicationClaimed) await base44.asServiceRole.entities.Application.update(application_id, { application_status: originalApplicationStatus }).catch(() => {});
      return Response.json({ error: 'Could not allocate an unused account number; retry later' }, { status: 503 });
    }

    // Placeholder institutional routing value retained from the existing app.
    // It must be validated with the institution/processor before real-money use.
    const routingNumber = '021000021';

    let account: any;
    try {
      account = await base44.asServiceRole.entities.Account.create({
        user_id,
        account_type,
        account_name,
        account_number: accountNumber,
        routing_number: routingNumber,
        balance: 0,
        // Keep the account frozen until the application transition is confirmed.
        status: applicationClaimed ? 'frozen' : 'active',
        ...(application_id ? { application_id } : {}),
      });
    } catch (error) {
      if (applicationClaimed) await base44.asServiceRole.entities.Application.update(application_id, { application_status: originalApplicationStatus }).catch(() => {});
      throw error;
    }

    if (applicationClaimed) {
      const approved = await base44.asServiceRole.entities.Application.updateMany(
        { id: application_id, application_status: 'processing' },
        { $set: {
          application_status: 'approved',
          opening_balance: 0,
          opening_contribution_status: application.opening_contribution_status === 'approved' ? 'approved' : 'not_started',
          admin_notes,
        } }
      );
      if (approved.updated !== 1) {
        await base44.asServiceRole.entities.Application.update(application_id, { application_status: 'reconciliation_required' }).catch(() => {});
        return Response.json({ error: 'Account was created frozen, but application approval could not be confirmed; manual reconciliation required', account_id: account.id }, { status: 409 });
      }
      const activated = await base44.asServiceRole.entities.Account.updateMany(
        { id: account.id, status: 'frozen' },
        { $set: { status: 'active' } }
      );
      if (activated.updated !== 1) {
        await base44.asServiceRole.entities.Application.update(application_id, { application_status: 'reconciliation_required' }).catch(() => {});
        return Response.json({ error: 'Application was approved, but account activation failed; account remains frozen for reconciliation', account_id: account.id }, { status: 409 });
      }
    }

    await base44.asServiceRole.entities.Notification.create({
      user_id,
      title: 'Account Opened',
      message: `Your ${account_type} account has been opened. Account Number: ${accountNumber}, Routing Number: ${routingNumber}.`,
      type: 'success',
    }).catch(() => {});

    let auditLogError = '';
    await base44.asServiceRole.entities.AuditLog.create({
      action_type: 'account_created',
      description: `Account created by administrator for user ${user_id}`,
      details: JSON.stringify({ account_id: account.id, account_type, application_id: application_id || null }),
      target_user_id: user_id,
      user_id: user.id,
      admin_name: user.full_name || user.email || 'Admin',
    }).catch((error: any) => { auditLogError = error?.message || 'Audit log write failed'; });

    return Response.json({
      success: true,
      account_id: account.id,
      account_number: accountNumber,
      routing_number: routingNumber,
      account_type,
      account_name,
      balance: 0,
      ...(auditLogError ? { audit_log_error: auditLogError } : {}),
    });
  } catch (error) {
    return Response.json({ error: error?.message || 'Account creation failed' }, { status: 500 });
  }
});
