import { base44 } from '@/api/base44Client';

/**
 * Platform fulfillment. No outside network is called.
 * Operators and agents decide; the membership records are what change.
 */

export async function fulfillService(request, approved) {
  if (!approved) return { done: false };
  const type = String(request.service_type || '').toLowerCase();
  const detail = request.details || '';

  if (type === 'card') {
    const row = await base44.entities.PaymentCard.create({
      user_id: request.user_id,
      card_type: 'debit',
      brand: 'Vantoris',
      last_four: String(Date.now()).slice(-4),
      status: 'issued',
    });
    return { done: true, record: row?.id, note: 'Member card issued on the platform.' };
  }

  if (type === 'apple' || type === 'google') {
    const cards = await base44.entities.PaymentCard.filter({ user_id: request.user_id }, '-created_date').catch(() => []);
    const card = Array.isArray(cards) ? cards[0] : null;
    if (!card) return { done: false, note: 'No member card to add to a wallet.' };
    await base44.entities.PaymentCard.update(card.id, { status: `wallet-${type}` });
    return { done: true, record: card.id, note: `Card marked for ${type} wallet on the platform.` };
  }

  if (type === 'ira') {
    const row = await base44.entities.Account.create({
      user_id: request.user_id,
      account_name: /roth/i.test(detail) ? 'Roth IRA' : 'Traditional IRA',
      account_type: 'ira',
      balance: 0,
      status: 'active',
      currency: 'USD',
    });
    return { done: true, record: row?.id, note: 'IRA share opened on the platform.' };
  }

  if (type === 'zelle') {
    return { done: true, note: 'Zelle-style send stays a platform transfer. Operators approve the pending transaction.' };
  }

  return { done: true, note: 'Request approved on the platform.' };
}
