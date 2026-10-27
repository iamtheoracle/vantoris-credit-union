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
    const { description, type, context } = body;

    if (typeof description !== 'string' || !description.trim()) {
      return Response.json({ error: 'A description of what to build is required' }, { status: 400 });
    }
    if (description.length > 12000) {
      return Response.json({ error: 'Description exceeds the 12,000-character limit' }, { status: 413 });
    }
    if (context != null && (typeof context !== 'string' || context.length > 8000)) {
      return Response.json({ error: 'Context must be text and no longer than 8,000 characters' }, { status: 400 });
    }
    if (type != null && (typeof type !== 'string' || type.length > 60)) {
      return Response.json({ error: 'Artifact type must be text and no longer than 60 characters' }, { status: 400 });
    }

    const artifactType = type?.trim() || 'component';

    const prompt = `You are an expert full-stack engineer building apps on a React + Tailwind CSS + Vite stack with shadcn/ui components and lucide-react icons.

TASK: Generate a complete, production-ready ${artifactType} based on the following description.

DESCRIPTION:
${description}

${context ? `ADDITIONAL CONTEXT:\n${context}\n` : ''}
REQUIREMENTS:
1. Export the ${artifactType} as default, named the same as its file (PascalCase).
2. Use ONLY these installed packages: React, tailwind css, shadcn/ui (@/components/ui/*), lucide-react, moment, recharts, react-quill-new, react-hook-form, react-router-dom, date-fns, lodash, react-markdown, framer-motion, three.js, react-leaflet, @hello-pangea/dnd, @tanstack/react-query.
3. Use the @/ alias for all internal imports (e.g., @/components/ui/button, @/lib/utils).
4. Import { cn } from "@/lib/utils" — never from @/utils.
5. Use Tailwind CSS for all styling with literal class strings (no dynamic class concatenation).
6. Ensure all imports resolve to real files or installed packages.
7. Call hooks only at the top level of components — never conditionally or in loops.
8. Handle loading and empty states.
9. Make the UI responsive (mobile + desktop) and accessible.
10. Return ONLY code — no explanations, no markdown fences, no commentary.

OUTPUT FORMAT:
Return a JSON object with:
- "code": the full generated code as a string
- "filename": a suggested file path (e.g., src/components/MyComponent.jsx)
- "summary": a brief 1-2 sentence summary of what was built
- "dependencies": an array of any npm packages the code uses (empty array if none)`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          filename: { type: 'string' },
          summary: { type: 'string' },
          dependencies: { type: 'array', items: { type: 'string' } }
        },
        required: ['code', 'filename', 'summary', 'dependencies']
      },
      model: 'claude_sonnet_4_6'
    });

    const data = result.response || result.result || result;
    const code = data.code || (typeof data === 'string' ? data : '');
    const filename = data.filename || `src/components/Generated${artifactType}.jsx`;
    const summary = data.summary || '';
    const dependencies = data.dependencies || [];

    return Response.json({ code, filename, summary, dependencies });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});