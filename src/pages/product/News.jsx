import React, { useEffect, useState } from 'react';
import ProductShell from './ProductShell';
import UnavailableState from '@/components/vantoris/UnavailableState';
import { notifyOperators } from '@/lib/notifyOperators';
import { base44 } from '@/api/base44Client';

export default function News() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/.netlify/functions/market')
      .then((r) => r.json())
      .then(setData)
      .catch((e) => setError(e.message || 'Feed unavailable'));
  }, []);

  async function request(kind) {
    const me = await base44.auth.me().catch(() => null);
    await notifyOperators({
      title: `${kind} request`,
      message: `${me?.full_name || me?.email || 'A member'} asked to activate ${kind}.`,
      type: 'warning',
    });
  }

  const quotes = data?.rates?.quotes || {};
  const pairs = ['GBP', 'EUR', 'NGN', 'CAD'].filter((k) => quotes[k]);

  return (
    <ProductShell kicker="News" title="News and rates" subtitle="Headlines are from BBC Business. Rates are European Central Bank via Frankfurter. Nothing here is written in-product.">
      {error && <UnavailableState title="Feed unavailable" detail={error} />}
      {data?.rates && (
        <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4">
          <p className="text-xs uppercase tracking-wider text-slate-400">USD rates · {data.rates.date}</p>
          <p className="mt-1 text-xs text-slate-500">{data.rates.source}</p>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            {pairs.map((k) => (
              <div key={k} className="rounded-xl bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-400">1 USD</p>
                <p className="font-semibold">{quotes[k]} {k}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="space-y-3">
        {(data?.headlines || []).map((item) => (
          <a key={item.link} href={item.link} target="_blank" rel="noreferrer" className="block rounded-2xl border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wider text-brass">{item.source}</p>
            <p className="mt-1 font-semibold text-navy">{item.title}</p>
          </a>
        ))}
        {!error && data && !data.headlines?.length && <UnavailableState title="No headlines returned" detail="The public feed did not return items." />}
      </div>
      <button type="button" onClick={() => request('a licensed news provider')} className="mt-4 text-sm font-semibold text-navy underline">Request a licensed provider</button>
    </ProductShell>
  );
}
