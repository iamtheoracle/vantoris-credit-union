import React, { useState } from 'react';
import ProductShell from './ProductShell';
import UnavailableState from '@/components/vantoris/UnavailableState';
import { PROVIDERS } from '@/lib/providers';
import { notifyOperators } from '@/lib/notifyOperators';
import { base44 } from '@/api/base44Client';

export default function Homes() {
  const [note, setNote] = useState('');

  async function request() {
    const me = await base44.auth.me().catch(() => null);
    await notifyOperators({
      title: 'Homes request',
      message: `${me?.full_name || me?.email || 'A member'} requested the listing provider.`,
      type: 'warning',
    });
    setNote('Operators were notified. No listings were invented.');
  }

  return (
    <ProductShell kicker="Homes" title="Homes" subtitle="Search, map, and saved homes require a licensed listing provider. Listings are not fabricated.">
      <UnavailableState title="Listing provider" detail={PROVIDERS.homes.note} />
      <button type="button" onClick={request} className="mt-3 text-sm font-semibold text-navy underline">Request listings</button>
      {note && <p className="mt-3 text-sm text-slate-600">{note}</p>}
    </ProductShell>
  );
}
