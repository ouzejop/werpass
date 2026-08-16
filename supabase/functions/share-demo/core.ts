export const validUuid = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export const validOpaqueToken = (value: unknown): value is string =>
  validUuid(value) || (typeof value === 'string' && /^[A-Za-z0-9_-]{8}$/.test(value));

export const normalizeOpaqueToken = (value: unknown): string | null => {
  if (!validOpaqueToken(value)) return null;
  // Legacy UUID tokens are case-insensitive. New compact Base64 URL tokens
  // preserve their case to retain 48 bits of entropy.
  return validUuid(value) ? value.toLowerCase() : value;
};

export const compactOpaqueToken = (uuid: string): string => {
  if (!validUuid(uuid)) throw new Error('invalid_uuid');
  const firstSixBytes = uuid.replaceAll('-', '').slice(0, 12).match(/.{2}/g)!;
  return btoa(String.fromCharCode(...firstSixBytes.map((byte) => Number.parseInt(byte, 16))))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
};

export const SHARE_CODE_LENGTH = 8;
const SHARE_CODE_SPACE = 10 ** SHARE_CODE_LENGTH;
const UINT32_SPACE = 2 ** 32;
const SHARE_CODE_LIMIT = Math.floor(UINT32_SPACE / SHARE_CODE_SPACE) * SHARE_CODE_SPACE;

export function numericShareCodeFromUint32(value: number): string | null {
  if (!Number.isInteger(value) || value < 0 || value >= SHARE_CODE_LIMIT) return null;
  return String(value % SHARE_CODE_SPACE).padStart(SHARE_CODE_LENGTH, '0');
}

export function generateNumericShareCode(): string {
  const random = new Uint32Array(1);
  do crypto.getRandomValues(random); while (random[0] >= SHARE_CODE_LIMIT);
  return numericShareCodeFromUint32(random[0])!;
}

export function canRequestSession(state: unknown, expiresAt: unknown, now = Date.now()): boolean {
  return state === 'pending'
    && typeof expiresAt === 'string'
    && new Date(expiresAt).getTime() > now;
}

export function canPatientDecide(state: unknown, expiresAt: unknown, now = Date.now()): boolean {
  return state === 'requested'
    && typeof expiresAt === 'string'
    && new Date(expiresAt).getTime() > now;
}
