const encoder = new TextEncoder();

export const validCode = (value: unknown): value is string => typeof value === 'string' && /^\d{6}$/.test(value);
export const validOpaqueToken = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

export function generateMedicalCode(random: Uint8Array): string {
  if (random.length < 4) throw new Error('insufficient_randomness');
  const value = ((random[0] << 24) | (random[1] << 16) | (random[2] << 8) | random[3]) >>> 0;
  return String(value % 1_000_000).padStart(6, '0');
}

export async function digestMedicalCode(pepper: string, sessionId: string, code: string): Promise<string> {
  if (!pepper || !validOpaqueToken(sessionId) || !validCode(code)) throw new Error('invalid_code_material');
  const key = await crypto.subtle.importKey('raw', encoder.encode(pepper), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(`${sessionId}:${code}`));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function constantTimeEqual(left: string, right: string): boolean {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
}
