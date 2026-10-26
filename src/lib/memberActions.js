import { base44 } from '@/api/base44Client';
import { notifyOperators } from '@/lib/notifyOperators';
import { formatCurrency } from '@/lib/formatCurrency';

/**
 * Member assistant executor.
 * Rules only. No language model. Every assignment writes a real record
 * or returns a real backend read. It never invents a completed payment or booking.
 */

function money(text) {
  const m = String(text).match(/\$?\s*(\d+(?:\.\d{1,2})?)/);
  return m ? Number(m[1]) : null;
}

function named(text) {
  return (String(text).match(/\bto\s+([A-Za-z0-9 .@_+-]{2,60})/i) || [])[1]?.trim() || '';
}

function route(text) {
  const m = String(text).match(/([A-Za-z]{3})\s*(?:to|-)\s*([A-Za-z]{3})/i);
  return m ? { from: m[1].toUpperCase(), to: m[2].toUpperCase() } : { from: '', to: '' };
}

export function parseCommand(text) {
  const q = String(text || '').trim();
  const lower = q.toLowerCase();
  const amount = money(q);
  if (!q) return { type: 'empty' };
  if (/\bbalance\b|how much|my shares|available/.test(lower)) return { type: 'balance' };
  if (/\bfreeze\b/.test(lower)) return { type: 'freeze' };
  if (/\b(send|transfer|pay)\b/.test(lower) && amount) return { type: 'send', amount, to: named(q) };
  if (/\b(add|deposit|fund)\b/.test(lower) && amount) return { type: 'deposit', amount };
  if (/\brequest\b/.test(lower) && amount) return { type: 'request', amount, from: named(q) };
  if (/\bflight\b|\bbook\b/.test(lower)) return { type: 'flight', ...route(q) };
  if (/\bhome\b|\bhouse\b|\bproperty\b/.test(lower)) return { type: 'home', detail: q };
  if (/\bherobox\b|care package|\bdonate\b|\bgiving\b/.test(lower)) return { type: 'community', detail: q };
  if (/\bcheck\b|\bdeposit check\b/.test(lower) && amount) return { type: 'check', amount, detail: q };
  if (/\bwire\b/.test(lower) && amount) return { type: 'wire', amount, to: named(q) || q };
  if (/\bzelle\b/.test(lower) && amount) return { type: 'zelle', amount, to: named(q) || q };
  if (/\bapple\b|\bgoogle\b|\bwallet\b/.test(lower)) return { type: 'wallet', detail: /google/.test(lower) ? 'google' : 'apple' };
  if (/\bira\b|\broth\b|\btraditional\b/.test(lower)) return { type: 'ira', detail: q };
  if (/\bqr\b/.test(lower)) return { type: 'qr' };
  if (/\bcard\b/.test(lower)) return { type: 'cards' };
  if (/\bhelp\b|\bsupport\b|\bcontact\b/.test(lower)) return { type: 'support' };
  return { type: 'help' };
}

async function memberContext() {
  const me = await base44.auth.me();
  const accounts = await base44.entities.Account.filter({ user_id: me.id }, '-created_date').catch(() => []);
  return { me, accounts: Array.isArray(accounts) ? accounts : [] };
}

async function queueService(me, service_type, details) {
  const row = await base44.entities.ServiceRequest.create({
    user_id: me.id,
    service_type,
    details,
    status: 'pending',
  });
  await notifyOperators({
    title: `${service_type} requested`,
    message: `${me.full_name || me.email || 'A member'} requested ${service_type}. ${details}`,
    type: 'warning',
  });
  return row;
}

export async function runAssignment(command) {
  const { me, accounts } = await memberContext();
  const account = accounts[0] || null;
  const who = me.full_name || me.email || 'A member';

  if (command.type === 'balance') {
    if (!accounts.length) return { ok: false, text: 'No share account is on this membership yet.' };
    const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0);
    const lines = accounts.map((a) => `${a.account_name || a.account_type || 'Share'}: ${formatCurrency(a.balance || 0)}`).join(' · ');
    return { ok: true, text: `Available shares ${formatCurrency(total)}. ${lines}` };
  }

  if (command.type === 'send') {
    if (!account) return { ok: false, text: 'No share account to send from.' };
    if (!command.to) return { ok: false, text: 'Name the member to send to.' };
    if (command.amount > (account.balance || 0)) return { ok: false, text: 'Insufficient shares for that amount.' };
    const txn = await base44.entities.Transaction.create({
      account_id: account.id,
      user_id: me.id,
      type: 'send',
      amount: -Math.abs(command.amount),
      description: `Assistant transfer to ${command.to}`,
      status: 'pending',
      counterparty: command.to,
    });
    await notifyOperators({
      title: 'Transaction requested',
      message: `${who} requested to send ${formatCurrency(command.amount)} to ${command.to}. txn:${txn?.id || ''}`,
      type: 'warning',
    });
    return { ok: true, text: `Queued. ${formatCurrency(command.amount)} to ${command.to} is pending operator approval. Transaction ${txn?.id || 'created'}. Balance is unchanged until approved.` };
  }

  if (command.type === 'deposit') {
    if (!account) return { ok: false, text: 'No share account to add funds to.' };
    const txn = await base44.entities.Transaction.create({
      account_id: account.id,
      user_id: me.id,
      type: 'deposit',
      amount: Math.abs(command.amount),
      description: 'Assistant add funds',
      status: 'pending',
    });
    await notifyOperators({
      title: 'Deposit requested',
      message: `${who} requested to add ${formatCurrency(command.amount)}. txn:${txn?.id || ''}`,
      type: 'warning',
    });
    return { ok: true, text: `Queued. ${formatCurrency(command.amount)} is pending operator approval. Transaction ${txn?.id || 'created'}.` };
  }

  if (command.type === 'request') {
    await notifyOperators({
      title: 'Payment request',
      message: `${who} requested ${formatCurrency(command.amount)}${command.from ? ` from ${command.from}` : ''}.`,
      type: 'warning',
    });
    return { ok: true, text: `Request recorded. Operators were notified about ${formatCurrency(command.amount)}.` };
  }

  if (command.type === 'freeze') {
    if (!account) return { ok: false, text: 'No account to freeze.' };
    const row = await queueService(
      me,
      'freeze',
      `Member requested a freeze for ${account.account_name || account.account_type || 'their account'} (account reference: ${account.id}).`
    );
    return {
      ok: true,
      text: `Freeze request queued for operator review. ${account.account_name || 'Account'} has not been frozen yet. Request ${row?.id || 'created'}.`,
    };
  }

  if (command.type === 'flight') {
    const detail = command.from && command.to ? `${command.from} to ${command.to}` : 'route not specified';
    const row = await queueService(me, 'flight', detail);
    return { ok: true, text: `Flight assignment queued for operators (${detail}). Request ${row?.id || 'created'}. Nothing is booked until a provider accepts it.` };
  }

  if (command.type === 'home') {
    const row = await queueService(me, 'home', command.detail || 'housing help');
    return { ok: true, text: `Housing assignment queued. Request ${row?.id || 'created'}. No listing was invented.` };
  }

  if (command.type === 'community') {
    const row = await queueService(me, 'community', command.detail || 'community request');
    return { ok: true, text: `Community assignment queued. Request ${row?.id || 'created'}.` };
  }

  if (command.type === 'check' || command.type === 'wire' || command.type === 'zelle') {
    if (!account) return { ok: false, text: 'No share account is on this membership yet.' };
    if (!command.amount) return { ok: false, text: 'Include an amount.' };
    const txn = await base44.entities.Transaction.create({
      account_id: account.id,
      user_id: me.id,
      type: command.type === 'check' ? 'deposit' : command.type,
      amount: command.type === 'check' ? Math.abs(command.amount) : -Math.abs(command.amount),
      description: `${command.type} ${command.to || command.detail || ''}`.trim(),
      status: 'pending',
      counterparty: command.to || '',
    });
    await notifyOperators({
      title: `${command.type} requested`,
      message: `${who} requested ${formatCurrency(command.amount)} via ${command.type}. txn:${txn?.id || ''}`,
      type: 'warning',
    });
    return { ok: true, text: `Queued on the platform. ${formatCurrency(command.amount)} ${command.type} is pending operator approval. Transaction ${txn?.id || 'created'}.` };
  }

  if (command.type === 'wallet' || command.type === 'ira') {
    const row = await queueService(me, command.type === 'ira' ? 'ira' : command.detail, command.detail || command.type);
    return { ok: true, text: `${command.type === 'ira' ? 'IRA' : 'Wallet'} assignment queued for operators. Request ${row?.id || 'created'}. The platform opens it only after approval.` };
  }

  if (command.type === 'qr') {
    return { ok: true, text: 'QR payments run on the membership. Open QR Pay to send or receive another member.' };
  }

  if (command.type === 'cards') {
    const cards = await base44.entities.PaymentCard.filter({ user_id: me.id }, '-created_date').catch(() => []);
    if (!Array.isArray(cards) || !cards.length) return { ok: true, text: 'No issued card is on this membership. Card requests can be made from Cards.' };
    return { ok: true, text: `${cards.length} card record${cards.length === 1 ? '' : 's'} on file.` };
  }

  if (command.type === 'support') {
    await notifyOperators({
      title: 'Member support requested',
      message: `${who} asked the assistant for support.`,
      type: 'info',
    });
    return { ok: true, text: 'Support assignment sent to operators. Member services: +1 (205) 568-8741 or +44 7404 767964.' };
  }

  return {
    ok: true,
    text: 'I run on this platform. Say “balance”, “send $25 to Ada”, “check $100”, “wire $200 to Ada”, “zelle $40 to Ada”, “apple wallet”, “open IRA”, or “support”. Operators approve before money posts.',
  };
}
