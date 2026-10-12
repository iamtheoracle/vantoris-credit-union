/**
 * Real public data only. No invented prices, listings, or bookings.
 * Rates: European Central Bank via Frankfurter.
 * Headlines: BBC Business RSS, attributed.
 */
function decode(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/>/g, '>')
    .replace(/&#39;|'/g, "'")
    .replace(/"/g, '"')
    .trim();
}

function headlines(xml) {
  const items = [];
  const blocks = String(xml).split('<item>').slice(1, 9);
  for (const block of blocks) {
    const title = decode((block.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = decode((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    if (title) items.push({ title, link, source: 'BBC Business' });
  }
  return items;
}

export default async () => {
  const [ratesRes, newsRes] = await Promise.all([
    fetch('https://api.frankfurter.app/latest?from=USD').catch(() => null),
    fetch('https://feeds.bbci.co.uk/news/business/rss.xml').catch(() => null),
  ]);
  const rates = ratesRes?.ok ? await ratesRes.json().catch(() => null) : null;
  const newsXml = newsRes?.ok ? await newsRes.text().catch(() => '') : '';
  return new Response(JSON.stringify({
    rates: rates ? { date: rates.date, base: rates.base, quotes: rates.rates, source: 'European Central Bank via Frankfurter' } : null,
    headlines: headlines(newsXml),
  }), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=900' },
  });
};
