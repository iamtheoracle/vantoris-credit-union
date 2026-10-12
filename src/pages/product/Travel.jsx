import React, { useState } from 'react';
import ProductShell from './ProductShell';
import UnavailableState from '@/components/vantoris/UnavailableState';
import { PROVIDERS } from '@/lib/providers';
import { notifyOperators } from '@/lib/notifyOperators';
import { base44 } from '@/api/base44Client';

export default function Travel() {
  const [note, setNote] = useState('');

  async function request(label) {
    const me = await base44.auth.me().catch(() => null);
    await notifyOperators({
      title: 'Travel request',
      message: `${me?.full_name || me?.email || 'A member'} requested ${label}.`,
      type: 'warning',
    });
    setNote(`Operators were notified for ${label}. Nothing is booked.`);
  }

  return (
    <ProductShell
      kicker="Travel"
      title="Travel"
      subtitle="Flights, hotels, cars, and tracking appear here only after a licensed provider is connected. No sample itineraries."
    >
      <div className="space-y-3">
        {['flights', 'hotels', 'cars', 'flightTracking'].map((key) => (
          <div key={key}>
            <UnavailableState title={PROVIDERS[key].label} detail={PROVIDERS[key].note} />
            <button type="button" onClick={() => request(PROVIDERS[key].label)} className="mt-2 text-sm font-semibold text-navy underline">Request {PROVIDERS[key].label}</button>
          </div>
        ))}
      </div>
      {note && <p className="mt-4 text-sm text-slate-600">{note}</p>}
    </ProductShell>
  );
}
