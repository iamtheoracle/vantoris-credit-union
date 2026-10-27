import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

/**
 * submitApplication — server-side gate for all account application requests.
 *
 * Decision flow:
 *   1. Query the caller's approved Applications.
 *   2. None found → first-time customer: create Application normally.
 *   3. Already holds the requested type → reject ("You already have this account type").
 *   4. Holds other approved type(s) but not this one → create AccountEnquiry (not Application).
 *      De-duplicate: if a pending/in_review enquiry for the same type already exists, surface it.
 */
export default async function(req: Request): Promise<Response> {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return Response.json({ error: 'A JSON object is required' }, { status: 400 });

    const {
      account_type,
      full_name,
      email,
      phone,
      address,
      business_name,
      reason,
    } = body;

    const allowedAccountTypes = new Set(['Checking', 'Savings', 'Money Market', 'CD', 'Joint', 'Business']);
    if (typeof account_type !== 'string' || !allowedAccountTypes.has(account_type)) {
      return Response.json({ error: 'A supported account_type is required' }, { status: 400 });
    }

    const boundedTextFields = [
      ['full_name', full_name, 120], ['email', email, 254], ['phone', phone, 40],
      ['address', address, 500], ['business_name', business_name, 160], ['reason', reason, 2000],
    ];
    for (const [field, value, maxLength] of boundedTextFields) {
      if (value != null && (typeof value !== 'string' || value.length > maxLength)) {
        return Response.json({ error: 'Invalid or oversized field: ' + field }, { status: 400 });
      }
    }
    if (full_name != null && !full_name.trim()) return Response.json({ error: 'full_name cannot be blank' }, { status: 400 });
    if (email != null && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return Response.json({ error: 'A valid email address is required' }, { status: 400 });

    // Identify the caller
    const me = await base44.auth.me();
    if (!me?.id) {
      return Response.json({ error: 'Authentication required' }, { status: 401 });
    }

    // Fetch all approved Applications for this user
    const approvedApps: any[] = await base44.asServiceRole.entities.Application.filter({
      user_id: me.id,
      application_status: 'approved',
    });

    const heldTypes: string[] = approvedApps.map((a: any) => a.account_type);

    // --- Case 1: Zero approved accounts — allow first Application ---
    if (heldTypes.length === 0) {
      if (!full_name?.trim() || !email?.trim()) {
        return Response.json(
          { error: 'full_name and email are required to create an Application' },
          { status: 400 },
        );
      }
      const app = await base44.entities.Application.create({
        user_id: me.id,
        full_name: full_name.trim(),
        email: email.trim().toLowerCase(),
        phone,
        address,
        business_name,
        account_type,
        kyc_status: 'not_started',
        application_status: 'pending',
      });
      return Response.json({ outcome: 'application_created', application: app });
    }

    // --- Case 2: Already holds this type ---
    if (heldTypes.includes(account_type)) {
      return Response.json(
        { error: 'You already have this account type' },
        { status: 409 },
      );
    }

    // --- Case 3: Holds other type(s) — route to AccountEnquiry ---

    // De-duplicate: check for an existing open enquiry
    const existing: any[] = await base44.asServiceRole.entities.AccountEnquiry.filter({
      created_by_id: me.id,
      requested_product_type: account_type,
    });

    const openEnquiry = existing.find(
      (e: any) => e.status === 'pending' || e.status === 'in_review',
    );

    if (openEnquiry) {
      return Response.json({
        outcome: 'enquiry_exists',
        enquiry: openEnquiry,
        message: 'An enquiry for this account type is already under review.',
      });
    }

    const enquiry = await base44.entities.AccountEnquiry.create({
      requested_product_type: account_type,
      reason: reason?.trim() || '',
      status: 'pending',
    });

    await base44.asServiceRole.entities.Notification.create({
      user_id: me.id,
      title: 'Enquiry Submitted',
      message: `Your enquiry for a ${account_type} account has been received and is under review.`,
      type: 'info',
      read: false,
    });

    return Response.json({ outcome: 'enquiry_created', enquiry });
  } catch (error: any) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
