import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }

  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'A JSON object is required' }, { status: 400 });
    }
    const { code, instructions, language } = body;

    if (typeof code !== 'string' || !code.trim() || typeof instructions !== 'string' || !instructions.trim()) {
      return Response.json({ error: 'Both code and instructions are required as text' }, { status: 400 });
    }
    if (code.length > 30000 || instructions.length > 8000) {
      return Response.json({ error: 'Code is limited to 30,000 characters and instructions to 8,000 characters' }, { status: 413 });
    }
    if (language != null && (typeof language !== 'string' || language.length > 60)) {
      return Response.json({ error: 'Language must be text and no longer than 60 characters' }, { status: 400 });
    }

    const prompt = `You are an expert software engineer. Rewrite the following ${language || 'code'} according to these instructions:

INSTRUCTIONS:
${instructions}

ORIGINAL CODE:
\`\`\`
${code}
\`\`\`

Requirements:
1. Preserve all existing functionality unless instructed otherwise.
2. Follow best practices and clean code principles.
3. Keep the code production-ready and well-structured.
4. Do NOT add unnecessary dependencies.
5. If the code is React/JSX, ensure all imports resolve and hooks are used correctly.
6. Return ONLY the rewritten code — no explanations, no markdown fences, no commentary.

OUTPUT FORMAT:
Return a JSON object with:
- "rewritten_code": the full rewritten code as a string
- "summary": a brief 1-2 sentence summary of what changed`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          rewritten_code: { type: 'string' },
          summary: { type: 'string' }
        },
        required: ['rewritten_code', 'summary']
      },
      model: 'claude_sonnet_4_6'
    });

    const data = result.response || result.result || result;
    const rewritten_code = data.rewritten_code || (typeof data === 'string' ? data : '');
    const summary = data.summary || '';
    return Response.json({ rewritten_code, summary });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});