import { runSmartImport } from './core.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', requestId }, 405);
  const apiKey = Deno.env.get('OPENAI_API_KEY') ?? Deno.env.get('OPEN_AI_SECRET');
  const model = Deno.env.get('OPENAI_MODEL') ?? 'gpt-5.6';
  if (!apiKey) return json({ error: 'server_not_configured', requestId }, 503);
  try {
    const result = await runSmartImport(await request.json(), { apiKey, model, fetch });
    console.info(JSON.stringify({ event: 'smart_import_completed', requestId, model, durationMs: Date.now() - startedAt }));
    return json({ result, requestId });
  } catch (error) {
    const providerStatus = error instanceof Error && error.message.startsWith('openai_http_')
      ? Number(error.message.slice('openai_http_'.length)) : null;
    const code = error instanceof SyntaxError ? 'invalid_json'
      : providerStatus === 401 || providerStatus === 403 ? 'provider_auth'
      : providerStatus === 404 ? 'provider_model_unavailable'
      : providerStatus === 429 ? 'provider_rate_limited'
      : providerStatus ? 'provider_error'
      : error instanceof Error && error.message.includes('request') ? 'invalid_request'
      : 'invalid_response';
    console.info(JSON.stringify({ event: 'smart_import_failed', requestId, model, code, durationMs: Date.now() - startedAt }));
    return json({ error: code, requestId }, code === 'invalid_request' || code === 'invalid_json' ? 400 : 502);
  }
});
