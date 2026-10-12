/**
 * Private ask proxy.
 * If PRIVATE_LLM_URL is set, prompts go only to that server.
 * If it is not set, this returns a local private reply. It never calls Base44 or a public model.
 */
function localReply(prompt) {
  const q = String(prompt || '').trim();
  if (/send|transfer|pay/i.test(q)) {
    return 'I can prepare a Pay, but I have not sent anything. Open Pay, choose the account, and confirm. An operator is notified when a transaction is requested.';
  }
  if (/flight|book/i.test(q)) {
    return 'Flight booking is not connected. I can take a travel request and notify an operator. I will not invent a booking.';
  }
  if (/card/i.test(q)) {
    return 'No card issuer is connected. Existing card records show if the backend returns them. I can notify an operator to connect issuance.';
  }
  if (/home|house|rent|property/i.test(q)) {
    return 'Homes needs a licensed listing provider. I will not invent listings. An operator can connect one.';
  }
  if (/news|rate|dollar|fx|currency/i.test(q)) {
    return 'Open News for attributed headlines and Money for live USD rates. Those come from public sources, not invented stories.';
  }
  return 'Private model URL is not set on this host. I can still prepare Pay and notify an operator. Set PRIVATE_LLM_URL to your own Qwen server to replace this local reply.';
}

export default async (request) => {
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), { status: 405 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }
  const prompt = String(body.prompt || '').slice(0, 4000);
  if (!prompt) {
    return new Response(JSON.stringify({ error: 'empty prompt' }), { status: 400 });
  }
  const url = process.env.PRIVATE_LLM_URL;
  if (!url) {
    return new Response(JSON.stringify({ text: localReply(prompt), source: 'local' }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  }
  const upstream = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(process.env.PRIVATE_LLM_KEY ? { authorization: `Bearer ${process.env.PRIVATE_LLM_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: process.env.PRIVATE_LLM_MODEL || 'qwen2.5:7b',
      messages: [{ role: 'user', content: prompt }],
      stream: false,
    }),
  });
  if (!upstream.ok) {
    return new Response(JSON.stringify({
      text: localReply(prompt),
      error: `private model ${upstream.status}`,
      source: 'local',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  const data = await upstream.json();
  const text = data?.choices?.[0]?.message?.content || data?.response || data?.message?.content || data?.text || '';
  return new Response(JSON.stringify({ text: String(text || '').trim(), source: 'private' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
};
