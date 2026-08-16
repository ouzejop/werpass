import nacl from 'tweetnacl';

export type PortalKeyPair = { publicKey: string; secretKey: Uint8Array };
export type PortalKeyEnvelope = {
  algorithm: 'nacl-box-v1';
  patientEphemeralPublicKey: string;
  encryptedFileKey: string;
  nonce: string;
};

const fromBase64 = (value: string): Uint8Array => {
  const binary = atob(value);
  const result = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) result[index] = binary.charCodeAt(index);
  return result;
};

const toBase64 = (value: Uint8Array): string => {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
};

export function createPortalKeyPair(): PortalKeyPair {
  const pair = nacl.box.keyPair();
  return { publicKey: toBase64(pair.publicKey), secretKey: pair.secretKey };
}

export async function decryptSharedDocument(
  envelope: Record<string, unknown>,
  keyEnvelope: PortalKeyEnvelope,
  portalSecretKey: Uint8Array,
  fileAad: string,
): Promise<{ objectUrl: string; mimeType: string }> {
  if (keyEnvelope.algorithm !== 'nacl-box-v1' || portalSecretKey.length !== nacl.box.secretKeyLength) throw new Error('Enveloppe de clé temporaire invalide.');
  const fileKey = nacl.box.open(
    fromBase64(keyEnvelope.encryptedFileKey),
    fromBase64(keyEnvelope.nonce),
    fromBase64(keyEnvelope.patientEphemeralPublicKey),
    portalSecretKey,
  );
  if (!fileKey || fileKey.length !== 32) throw new Error('Impossible d’ouvrir la clé temporaire.');
  if (typeof envelope.ciphertext !== 'string' || typeof envelope.mime_type !== 'string') throw new Error('Document chiffré invalide.');
  const combined = fromBase64(envelope.ciphertext);
  if (combined.length <= 12 + 16) throw new Error('Document chiffré incomplet.');
  const aesKey = await crypto.subtle.importKey('raw', fileKey as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
  const plaintext = await crypto.subtle.decrypt({
    name: 'AES-GCM', iv: combined.slice(0, 12) as unknown as BufferSource, additionalData: new TextEncoder().encode(fileAad) as unknown as BufferSource, tagLength: 128,
  }, aesKey, combined.slice(12) as unknown as BufferSource);
  const blob = new Blob([plaintext], { type: envelope.mime_type });
  return { objectUrl: URL.createObjectURL(blob), mimeType: envelope.mime_type };
}
