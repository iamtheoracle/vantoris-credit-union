import React from 'react';
import { Link } from 'react-router-dom';
import ProductShell from './ProductShell';
import UnavailableState from '@/components/vantoris/UnavailableState';
import { PROVIDERS } from '@/lib/providers';
import { notifyOperators } from '@/lib/notifyOperators';
import { base44 } from '@/api/base44Client';

const AREAS = ['Everyday', 'Connect', 'Care', 'Service member', 'Digital', 'Home', 'Style', 'Mobility', 'Student', 'Giving'];

export default function HeroBoxHub() {
  return (
    <ProductShell kicker="HeroBox" title="Send · Give · Connect · Serve" subtitle="Marketplace, packages, and donations stay closed until merchant, carrier, and donation providers return real prices.">
      <div className="mb-4 flex flex-wrap gap-2">
        {AREAS.map((a) => (
          <span key={a} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium">{a}</span>
        ))}
      </div>
      <div className="space-y-3">
        <UnavailableState title="Marketplace prices" detail={PROVIDERS.marketplace.note} />
        <UnavailableState title="Shipping quotes" detail={PROVIDERS.shipping.note} />
        <UnavailableState title="Giving" detail={PROVIDERS.donations.note} />
      </div>
      <Link to="/herobox" className="mt-4 inline-block text-sm font-semibold text-navy underline">Open existing HeroBox workspace</Link>
      <button type="button" onClick={async () => {
          const me = await base44.auth.me().catch(() => null);
          await notifyOperators({ title: 'HeroBox request', message: `${me?.full_name || me?.email || 'A member'} requested marketplace, shipping, or giving.`, type: 'warning' });
        }} className="mt-3 block text-sm font-semibold text-navy underline">Request HeroBox activation</button>
    </ProductShell>
  );
}
