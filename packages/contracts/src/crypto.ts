export const ENVELOPE_VERSION = 1 as const;
export const ALGORITHM = 'AES-256-GCM' as const;

export type CryptoEnvelope = {
  envelopeVersion: typeof ENVELOPE_VERSION;
  algorithm: typeof ALGORITHM;
  keyId: string;
  nonce: string;
  ciphertext: string;
  tag: string;
  aadVersion: 1;
};

const bytesToBase64 = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes));

const base64ToBytes = (value: string): Uint8Array =>
  Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

const aadFor = (patientId: string, documentId: string, version: number): Uint8Array =>
  new TextEncoder().encode(`werpass:v1:${patientId}:${documentId}:${version}`);

const source = (bytes: Uint8Array): BufferSource => bytes as unknown as BufferSource;

const randomBytes = (length: number): Uint8Array => {
  const result = new Uint8Array(length);
  crypto.getRandomValues(result);
  return result;
};

export async function generateKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function encryptDocument(
  plaintext: Uint8Array,
  identity: { patientId: string; documentId: string; version: number; keyId: string },
  key: CryptoKey,
): Promise<CryptoEnvelope> {
  const nonce = randomBytes(12);
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: source(nonce), additionalData: source(aadFor(identity.patientId, identity.documentId, identity.version)), tagLength: 128 },
    key,
    source(plaintext),
  ));
  const split = encrypted.length - 16;
  return {
    envelopeVersion: ENVELOPE_VERSION,
    algorithm: ALGORITHM,
    keyId: identity.keyId,
    nonce: bytesToBase64(nonce),
    ciphertext: bytesToBase64(encrypted.slice(0, split)),
    tag: bytesToBase64(encrypted.slice(split)),
    aadVersion: 1,
  };
}

export async function decryptDocument(
  envelope: CryptoEnvelope,
  identity: { patientId: string; documentId: string; version: number },
  key: CryptoKey,
): Promise<Uint8Array> {
  if (envelope.envelopeVersion !== 1 || envelope.algorithm !== ALGORITHM || envelope.aadVersion !== 1) {
    throw new Error('Unsupported crypto envelope');
  }
  const ciphertext = new Uint8Array([...base64ToBytes(envelope.ciphertext), ...base64ToBytes(envelope.tag)]);
  return new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: source(base64ToBytes(envelope.nonce)), additionalData: source(aadFor(identity.patientId, identity.documentId, identity.version)), tagLength: 128 },
    key,
    source(ciphertext),
  ));
}
