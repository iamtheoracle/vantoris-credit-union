import { base44 } from '@/api/base44Client';

const OPERATOR_ROLES = new Set([
  'super_administrator',
  'admin',
  'administrator',
  'executive',
  'operations_manager',
  'operations_officer',
  'operator',
  'support',
]);

const SUPER_ADMIN_EMAIL = 'itsandrewjack@gmail.com';

/** Notify every operator account when a member requests or posts a transaction. */
export async function notifyOperators({ title, message, type = 'info' }) {
  const seen = new Set();
  async function send(userId) {
    if (!userId || seen.has(userId)) return;
    seen.add(userId);
    await base44.entities.Notification.create({
      user_id: userId,
      title,
      message,
      type,
    }).catch(() => {});
  }
  try {
    const users = await base44.entities.User.list('-created_date', 200);
    const list = Array.isArray(users) ? users : [];
    for (const user of list) {
      const role = String(user.role || '').toLowerCase();
      const email = String(user.email || '').toLowerCase();
      if (OPERATOR_ROLES.has(role) || email === SUPER_ADMIN_EMAIL) await send(user.id);
    }
  } catch (_) { /* list may be restricted; email lookup still runs */ }
  try {
    const rows = await base44.entities.User.filter({ email: SUPER_ADMIN_EMAIL });
    const admin = Array.isArray(rows) ? rows[0] : null;
    if (admin) await send(admin.id);
  } catch (_) { /* no operator list available */ }
}
