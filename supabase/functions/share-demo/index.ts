import { canPatientDecide, canRequestSession, generateNumericShareCode, normalizeOpaqueToken, validUuid } from './core.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...corsHeaders, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});
const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
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

const validRequesterText = (value: unknown, min: number, max: number): value is string =>
  typeof value === 'string' && value.trim().length >= min && value.trim().length <= max;

const fixedBase64 = (value: unknown, expectedLength: number): string | null => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) return null;
  try {
    return atob(value).length === expectedLength ? value : null;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  const requestId = crypto.randomUUID();
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'method_not_allowed', requestId }, 405);
  try {
    const input = await request.json() as Record<string, unknown>;
    if (input.action === 'create') {
      const owner = await patientId(request);
      if (!owner || !validUuid(input.documentId)) return json({ error: 'unauthorized', requestId }, 401);
      const versions = await rows(`document_versions?select=document_id,version&document_id=eq.${input.documentId}&version=eq.1&patient_id=eq.${owner}`);
      if (versions.length !== 1) return json({ error: 'document_not_found', requestId }, 404);
      const hasOfflineIntent = input.intentId !== undefined;
      if (hasOfflineIntent && !validUuid(input.intentId)) return json({ error: 'invalid_intent', requestId }, 400);
      const sessionId = hasOfflineIntent ? String(input.intentId) : crypto.randomUUID();
      const existing = await rows(`share_sessions?select=id,opaque_token,expires_at,patient_id&id=eq.${sessionId}`);
      if (existing.length > 0) {
        const storedSession = existing[0];
        const items = await rows(`share_items?select=document_id&session_id=eq.${sessionId}`);
        if (storedSession.patient_id !== owner || items[0]?.document_id !== input.documentId) {
          return json({ error: 'intent_conflict', requestId }, 409);
        }
        return json({ sessionId, opaqueToken: storedSession.opaque_token, expiresAt: storedSession.expires_at, qrPayload: storedSession.opaque_token });
      }
      let opaqueToken: string | null = null;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const candidate = generateNumericShareCode();
        const collision = await rows(`share_sessions?select=id&opaque_token=eq.${candidate}`);
        if (collision.length === 0) {
          opaqueToken = candidate;
          break;
        }
      }
      if (!opaqueToken) return json({ error: 'share_code_unavailable', requestId }, 503);
      const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
      await rows('share_sessions', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ id: sessionId, patient_id: owner, opaque_token: opaqueToken, state: 'pending', expires_at: expiresAt }) });
      await rows('share_items', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: sessionId, document_id: input.documentId, version: 1 }) });
      return json({ sessionId, opaqueToken, expiresAt, qrPayload: opaqueToken });
    }
    if (input.action === 'request') {
      const opaqueToken = normalizeOpaqueToken(input.opaqueToken);
      if (!opaqueToken) return json({ error: 'invalid_request', requestId }, 400);
      if (!validRequesterText(input.requesterName, 2, 80) || !validRequesterText(input.requesterFacility, 2, 120)) {
        return json({ error: 'requester_identity_required', requestId }, 400);
      }
      const portalPublicKey = fixedBase64(input.portalPublicKey, 32);
      if (!portalPublicKey) return json({ error: 'invalid_portal_key', requestId }, 400);
      const requesterName = input.requesterName.trim();
      const requesterFacility = input.requesterFacility.trim();
      const suppliedPortalRequestId = validUuid(input.portalRequestId) ? input.portalRequestId : null;
      const sessions = await rows(`share_sessions?select=id,state,expires_at,portal_request_id&opaque_token=eq.${opaqueToken}`);
      const session = sessions[0];
      if (!session) return json({ error: 'request_denied', requestId }, 403);
      if (session.state === 'requested') {
        if (!suppliedPortalRequestId || suppliedPortalRequestId !== session.portal_request_id) return json({ error: 'request_denied', requestId }, 403);
        return json({ requested: true, state: 'requested', confirmationRequired: true, portalRequestId: suppliedPortalRequestId, expiresAt: session.expires_at });
      }
      if (!canRequestSession(session.state, session.expires_at)) return json({ error: 'request_denied', requestId }, 403);
      const portalRequestId = crypto.randomUUID();
      await rows(`share_sessions?id=eq.${session.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        state: 'requested', requester_name: requesterName, requester_facility: requesterFacility, portal_request_id: portalRequestId, portal_public_key: portalPublicKey, requested_at: new Date().toISOString(),
      }) });
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: session.id, event_type: 'requested' }) });
      return json({ requested: true, state: 'requested', confirmationRequired: true, portalRequestId, expiresAt: session.expires_at });
    }
    if (input.action === 'approve' || input.action === 'decline') {
      const owner = await patientId(request);
      if (!owner || !validUuid(input.sessionId)) return json({ error: 'unauthorized', requestId }, 401);
      const sessions = await rows(`share_sessions?select=id,state,expires_at,patient_id,portal_public_key&id=eq.${input.sessionId}&patient_id=eq.${owner}`);
      const session = sessions[0];
      if (!session || !canPatientDecide(session.state, session.expires_at)) return json({ error: 'decision_denied', requestId }, 403);
      if (input.action === 'decline') {
        await rows(`share_sessions?id=eq.${session.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ state: 'declined', declined_at: new Date().toISOString() }) });
        await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: session.id, event_type: 'declined' }) });
        return json({ declined: true, state: 'declined' });
      }
      const patientEphemeralPublicKey = fixedBase64(input.patientEphemeralPublicKey, 32);
      const encryptedFileKey = fixedBase64(input.encryptedFileKey, 48);
      const portalKeyNonce = fixedBase64(input.nonce, 24);
      if (!session.portal_public_key || !patientEphemeralPublicKey || !encryptedFileKey || !portalKeyNonce) {
        return json({ error: 'key_envelope_required', requestId }, 400);
      }
      await rows(`share_sessions?id=eq.${session.id}`, { method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({
        state: 'approved', approved_at: new Date().toISOString(), patient_ephemeral_public_key: patientEphemeralPublicKey,
        encrypted_file_key_for_portal: encryptedFileKey, portal_key_nonce: portalKeyNonce,
      }) });
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: session.id, event_type: 'approved' }) });
      return json({ approved: true, state: 'approved', directAccess: true, expiresAt: session.expires_at });
    }
    if (input.action === 'portal_status') {
      const opaqueToken = normalizeOpaqueToken(input.opaqueToken);
      if (!opaqueToken || !validUuid(input.portalRequestId)) return json({ error: 'invalid_request', requestId }, 400);
      const sessions = await rows(`share_sessions?select=state,expires_at,portal_request_id&opaque_token=eq.${opaqueToken}`);
      const session = sessions[0];
      if (!session || input.portalRequestId !== session.portal_request_id) return json({ error: 'request_denied', requestId }, 403);
      const expired = new Date(String(session.expires_at)).getTime() <= Date.now();
      const state = expired && (session.state === 'pending' || session.state === 'requested') ? 'expired' : session.state;
      return json({ state, approved: state === 'approved', expiresAt: session.expires_at });
    }
    if (input.action === 'status') {
      if (!validUuid(input.sessionId)) return json({ error: 'unauthorized', requestId }, 401);
      const owner = await patientId(request);
      if (!owner) return json({ error: 'unauthorized', requestId }, 401);
      const sessions = await rows(`share_sessions?select=id,state,expires_at,requester_name,requester_facility,portal_public_key&id=eq.${input.sessionId}&patient_id=eq.${owner}`);
      const session = sessions[0];
      if (!session) return json({ error: 'not_found', requestId }, 404);
      const approved = session.state === 'approved' && new Date(String(session.expires_at)).getTime() > Date.now();
      return json({ requested: session.state === 'requested' || approved, state: approved ? 'approved' : session.state, requesterName: session.requester_name, requesterFacility: session.requester_facility, ...(session.state === 'requested' ? { portalPublicKey: session.portal_public_key } : {}), expiresAt: session.expires_at });
    }
    if (input.action === 'access') {
      const opaqueToken = normalizeOpaqueToken(input.opaqueToken);
      if (!opaqueToken || !validUuid(input.portalRequestId)) return json({ error: 'invalid_access', requestId }, 400);
      const sessions = await rows(`share_sessions?select=id,state,expires_at,portal_request_id,patient_ephemeral_public_key,encrypted_file_key_for_portal,portal_key_nonce&opaque_token=eq.${opaqueToken}`);
      const session = sessions[0];
      if (!session || input.portalRequestId !== session.portal_request_id || session.state !== 'approved' || !session.patient_ephemeral_public_key || !session.encrypted_file_key_for_portal || !session.portal_key_nonce || new Date(String(session.expires_at)).getTime() <= Date.now()) return json({ error: 'access_denied', requestId }, 403);
      const items = await rows(`share_items?select=document_id,version&session_id=eq.${session.id}`);
      if (items.length !== 1) return json({ error: 'access_denied', requestId }, 403);
      const item = items[0];
      const claimed = await rows(`share_sessions?id=eq.${session.id}&state=eq.approved&portal_request_id=eq.${input.portalRequestId}`, {
        method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ state: 'accessed' }),
      });
      if (claimed.length !== 1) return json({ error: 'access_denied', requestId }, 403);
      const envelopes = await rows(`document_versions?select=document_id,version,ciphertext,ciphertext_hash,mime_type,size_bytes&document_id=eq.${item.document_id}&version=eq.${item.version}`);
      if (envelopes.length !== 1) return json({ error: 'access_denied', requestId }, 403);
      await rows('access_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ session_id: session.id, event_type: 'accessed' }) });
      return json({
        sessionId: session.id, encryptedEnvelope: envelopes[0],
        keyEnvelope: { algorithm: 'nacl-box-v1', patientEphemeralPublicKey: session.patient_ephemeral_public_key, encryptedFileKey: session.encrypted_file_key_for_portal, nonce: session.portal_key_nonce },
        // The encrypted files in the Hackathon MVP are bound to this fixed synthetic owner in AAD.
        fileAad: `werpass:file:v1:patient-demo:${item.document_id}:${item.version}`,
        prototype: true,
      });
    }
    if (input.action === 'revoke') {
      const owner = await patientId(request);
      if (!owner || !validUuid(input.sessionId)) return json({ error: 'unauthorized', requestId }, 401);
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
