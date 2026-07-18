import { constantTimeEqual, digestMedicalCode, generateMedicalCode, validCode, validOpaqueToken } from './core.ts';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
const pepper = Deno.env.get('MEDICAL_CODE_PEPPER')!;
const serviceHeaders = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' };

async function patientId(request: Request): Promise<string | null> {
  const authorization = request.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return null;
  const response = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: authorization } });
  if (!response.ok) return null;
  const body = await response.json() as { id?: unknown };
  return typeof body.id === 'string' ? body.id : null;
}

async function rows(path: string, init?: RequestInit): Promise<Record<string, unknown>[]> {
  const response = await fetch(`${url}/rest/v1/${path}`, { ...init, headers: { ...serviceHeaders, ...(init?.headers ?? {}) } });
  if (!response.ok) throw new Error(`database_${response.status}`);
  const text = await response.text();
  if (!text) return [];
  const body = JSON.parse(text);
  return Array.isArray(body) ? body as Record<string, unknown>[] : [];
}

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', requestId }, 405);
  if (!pepper) return json({ error: 'server_not_configured', requestId }, 503);
  try {
    const input = await request.json() as Record<string, unknown>;
    if (input.action === 'create') {
      const owner = await patientId(request);
      if (!owner || !validOpaqueToken(input.documentId)) return json({ error: 'unauthorized', requestId }, 401);
      const versions = await rows(`document_versions?select=document_id,version&document_id=eq.${input.documentId}&version=eq.1&patient_id=eq.${owner}`);
      if (versions.length !== 1) return json({ error: 'document_not_found', requestId }, 404);
      const sessionId = crypto.randomUUID();
      const opaqueToken = crypto.randomUUID();
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const code = generateMedicalCode(crypto.getRandomValues(new Uint8Array(4)));
      const codeDigest = await digestMedicalCode(pepper, sessionId, code);
      await rows('share_sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: sessionId, patient_id: owner, opaque_token: opaqueToken, state: 'approved', expires_at: expiresAt, approved_at: new Date().toISOString() }) });
      await rows('share_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: sessionId, document_id: input.documentId, version: 1 }) });
      await rows('medical_access_codes', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: sessionId, code_digest: codeDigest, expires_at: expiresAt }) });
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: sessionId, event_type: 'approved' }) });
      return json({ sessionId, opaqueToken, code, expiresAt, qrPayload: opaqueToken });
    }
    if (input.action === 'access') {
      if (!validOpaqueToken(input.opaqueToken) || !validCode(input.code)) return json({ error: 'invalid_access', requestId }, 400);
      const sessions = await rows(`share_sessions?select=id,state,expires_at&opaque_token=eq.${input.opaqueToken}`);
      const session = sessions[0];
      if (!session || session.state !== 'approved' || new Date(String(session.expires_at)).getTime() <= Date.now()) return json({ error: 'access_denied', requestId }, 403);
      const codes = await rows(`medical_access_codes?select=code_digest,attempts,consumed_at,expires_at&session_id=eq.${session.id}`);
      const stored = codes[0];
      if (!stored || stored.consumed_at || Number(stored.attempts) >= 5 || new Date(String(stored.expires_at)).getTime() <= Date.now()) return json({ error: 'access_denied', requestId }, 403);
      const digest = await digestMedicalCode(pepper, String(session.id), input.code);
      if (!constantTimeEqual(String(stored.code_digest), digest)) {
        await rows(`medical_access_codes?session_id=eq.${session.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ attempts: Number(stored.attempts) + 1 }) });
        return json({ error: 'access_denied', requestId }, 403);
      }
      const items = await rows(`share_items?select=document_id,version&session_id=eq.${session.id}`);
      if (items.length !== 1) return json({ error: 'access_denied', requestId }, 403);
      const item = items[0];
      const envelopes = await rows(`document_versions?select=document_id,version,ciphertext,ciphertext_hash,wrapped_file_key,encrypted_metadata,mime_type,size_bytes&document_id=eq.${item.document_id}&version=eq.${item.version}`);
      await rows(`medical_access_codes?session_id=eq.${session.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ consumed_at: new Date().toISOString() }) });
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: session.id, event_type: 'accessed' }) });
      return json({ sessionId: session.id, encryptedEnvelope: envelopes[0], prototype: true });
    }
    if (input.action === 'revoke') {
      const owner = await patientId(request);
      if (!owner || !validOpaqueToken(input.sessionId)) return json({ error: 'unauthorized', requestId }, 401);
      const sessions = await rows(`share_sessions?select=id&patient_id=eq.${owner}&id=eq.${input.sessionId}`);
      if (sessions.length !== 1) return json({ error: 'not_found', requestId }, 404);
      await rows(`share_sessions?id=eq.${input.sessionId}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ state: 'revoked', revoked_at: new Date().toISOString() }) });
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: input.sessionId, event_type: 'revoked' }) });
      return json({ revoked: true });
    }
    return json({ error: 'invalid_action', requestId }, 400);
  } catch {
    return json({ error: 'request_failed', requestId }, 500);
  }
});
