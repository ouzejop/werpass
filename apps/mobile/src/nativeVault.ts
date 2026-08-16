import * as DocumentPicker from 'expo-document-picker';
import {
  AESEncryptionKey,
  AESKeySize,
  AESSealedData,
  aesDecryptAsync,
  aesEncryptAsync,
  CryptoDigestAlgorithm,
  digest,
  getRandomBytes,
  randomUUID,
} from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import { EncodingType, readAsStringAsync } from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync } from 'expo-sqlite';
import nacl from 'tweetnacl';
import { extractAndPseudonymizeFixture, normalizeDocumentType, parseSmartImportRequest, parseSmartImportResponse, simulateSmartImportLocally, type SmartImportRequest, type SmartImportResponse } from '../../../packages/contracts/src/smart-import';
import { createPendingShareIntent, type ShareIntent } from './shareIntent';
import { classifyImport } from './importPolicy';
import { decodeBase64 } from './binaryEncoding';
import { isUnreadableVaultDatabaseError, VaultRecoveryRequiredError } from './vaultRecovery';
import { SQLiteVaultDatabase, type VaultDatabase } from './vaultDatabase';

export { VaultRecoveryRequiredError } from './vaultRecovery';

const PATIENT_ID = 'patient-demo';
const DB_NAME = 'werpass-vault.db';
const DEVICE_KEY = 'werpass.device-key.v1';
const PIN_KEY = 'werpass.local-pin.v1';
const PIN_STATE_KEY = 'werpass.pin-state.v1';
const SUPABASE_SESSION_KEY = 'werpass.supabase-session.v1';
const ENCRYPTED_PROFILE_KEY = 'werpass.encrypted-profile.v1';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const vaultDirectory = new Directory(Paths.document, 'vault');
const secureStoreOptions: SecureStore.SecureStoreOptions = { keychainService: 'werpass-vault' };

async function readPickedFileBytes(uri: string, source: File): Promise<Uint8Array> {
  try {
    // Keep Android's temporary SAF permission by reading the original URI
    // first. This avoids Expo Go's inaccessible host.exp.exponent cache copy
    // for some providers (WhatsApp, Drive, and Downloads).
    const base64 = await readAsStringAsync(uri, { encoding: EncodingType.Base64 });
    return decodeBase64(base64);
  } catch {
    // Fallback for providers that return a regular file:// URI.
    return await source.bytes();
  }
}

type SyncState = 'queued' | 'syncing' | 'synced' | 'failed';
type DocumentKind = 'prescription' | 'lab-result' | 'document';
export type StoredAiAnalysis = {
  status: 'confirmed' | 'rejected';
  reviewedAt: string;
  source: 'groq' | 'openai_legacy' | 'local_demo_simulation';
  model?: string;
  result: SmartImportResponse;
};
type Metadata = {
  title: string;
  kind: DocumentKind;
  documentType?: string;
  smartImportEligible?: boolean;
  aiAnalysis?: StoredAiAnalysis;
};
export type PatientProfile = { displayName: string; age: string; bloodType: string; conditions: string };
type DocumentRow = {
  id: string;
  patient_id: string;
  version: number;
  mime_type: string;
  size_bytes: number;
  blob_name: string;
  ciphertext_hash: string;
  wrapped_file_key: string;
  encrypted_metadata: string;
  created_at: string;
  sync_state: SyncState;
};
type TimelineRow = DocumentRow & { outbox_state: 'queued' | 'failed' | null };
type PinState = { attempts: number; lockedUntil: number };

export type TimelineDocument = {
  id: string;
  title: string;
  kind: DocumentKind;
  createdAt: string;
  syncState: SyncState;
  outboxState: 'queued' | 'failed' | 'complete';
  documentType: string;
  smartImportEligible: boolean;
  aiAnalysis?: StoredAiAnalysis;
};

let database: VaultDatabase | null = null;

const utf8 = (value: string) => new TextEncoder().encode(value);
const bytesToHex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
const arrayBufferToHex = (value: ArrayBuffer) => bytesToHex(new Uint8Array(value));
const fileAad = (documentId: string, version: number) => utf8(`werpass:file:v1:${PATIENT_ID}:${documentId}:${version}`);
const metadataAad = (documentId: string, version: number) => utf8(`werpass:metadata:v1:${PATIENT_ID}:${documentId}:${version}`);
const smartImportResultAad = (documentId: string, requestId: string) => utf8(`werpass:smart-import-result:v1:${PATIENT_ID}:${documentId}:${requestId}`);
const keyAad = (documentId: string, version: number) => utf8(`werpass:file-key:v1:${PATIENT_ID}:${documentId}:${version}`);
const patientKeyAad = () => utf8(`werpass:patient-key:v1:${PATIENT_ID}`);
const profileAad = () => utf8(`werpass:profile:v1:${PATIENT_ID}`);

const importAesKey = async (encoded: string) =>
  AESEncryptionKey.import(encoded, 'base64') as unknown as Promise<AESEncryptionKey>;

const generateAesKey = async () =>
  AESEncryptionKey.generate(AESKeySize.AES256) as unknown as Promise<AESEncryptionKey>;

async function secureValue(key: string, bytes = 32): Promise<string> {
  const existing = await SecureStore.getItemAsync(key, secureStoreOptions);
  if (existing) return existing;
  const value = bytesToHex(getRandomBytes(bytes));
  await SecureStore.setItemAsync(key, value, secureStoreOptions);
  return value;
}

async function db(): Promise<VaultDatabase> {
  if (database) return database;
  const opened = new SQLiteVaultDatabase(DB_NAME);
  try {
    await opened.open();
    await opened.execute(`
    CREATE TABLE IF NOT EXISTS config (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      patient_id TEXT NOT NULL,
      version INTEGER NOT NULL CHECK(version > 0),
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
      blob_name TEXT NOT NULL UNIQUE,
      ciphertext_hash TEXT NOT NULL,
      wrapped_file_key TEXT NOT NULL,
      encrypted_metadata TEXT NOT NULL,
      created_at TEXT NOT NULL,
      sync_state TEXT NOT NULL CHECK(sync_state IN ('queued','syncing','synced','failed')),
      UNIQUE(id, version)
    );
    CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      expected_version INTEGER NOT NULL,
      operation TEXT NOT NULL CHECK(operation = 'upload_ciphertext'),
      attempts INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT,
      state TEXT NOT NULL CHECK(state IN ('queued','failed')),
      error_code TEXT,
      UNIQUE(document_id, expected_version, operation)
    );
    CREATE TABLE IF NOT EXISTS smart_import_outbox (
      request_id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      approved_payload TEXT NOT NULL,
      state TEXT NOT NULL CHECK(state = 'queued'),
      created_at TEXT NOT NULL,
      UNIQUE(document_id)
    );
    CREATE TABLE IF NOT EXISTS smart_import_results (
      request_id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      response_payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(document_id)
    );
    CREATE TABLE IF NOT EXISTS share_request_outbox (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL REFERENCES documents(id),
      state TEXT NOT NULL CHECK(state IN ('pending_connection','activating','failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      UNIQUE(document_id)
    );
    `);
    database = opened;
    return opened;
  } catch (error) {
    await opened.close().catch(() => undefined);
    if (isUnreadableVaultDatabaseError(error)) throw new VaultRecoveryRequiredError();
    throw error;
  }
}

async function patientKey(): Promise<AESEncryptionKey> {
  const localDb = await db();
  const row = await localDb.getFirstAsync<{ value: string }>('SELECT value FROM config WHERE key = ?', 'wrapped_patient_key');
  const deviceKeyHex = await secureValue(DEVICE_KEY);
  const deviceKey = await AESEncryptionKey.import(deviceKeyHex, 'hex') as unknown as AESEncryptionKey;
  if (row) {
    const sealed = AESSealedData.fromCombined(decodeBase64(row.value), { ivLength: 12, tagLength: 16 });
    const clear = await aesDecryptAsync(sealed, deviceKey, { additionalData: patientKeyAad() });
    return AESEncryptionKey.import(clear) as unknown as Promise<AESEncryptionKey>;
  }
  const created = await generateAesKey();
  const wrapped = await aesEncryptAsync(await created.bytes(), deviceKey, {
    nonce: { length: 12 },
    tagLength: 16,
    additionalData: patientKeyAad(),
  });
  await localDb.runAsync('INSERT INTO config(key, value) VALUES(?, ?)', 'wrapped_patient_key', await wrapped.combined('base64'));
  return created;
}

export async function initializeVault(): Promise<void> {
  vaultDirectory.create({ idempotent: true, intermediates: true });
  await db();
}

export const hasLocalPin = async () => (await SecureStore.getItemAsync(PIN_KEY, secureStoreOptions)) !== null;

export async function createLocalPin(pin: string): Promise<void> {
  if (!/^\d{4}$/.test(pin)) throw new Error('Le PIN local doit contenir exactement 4 chiffres.');
  if (await hasLocalPin()) throw new Error('Un PIN local existe déjà.');
  await SecureStore.setItemAsync(PIN_KEY, pin, secureStoreOptions);
  await SecureStore.setItemAsync(PIN_STATE_KEY, JSON.stringify({ attempts: 0, lockedUntil: 0 } satisfies PinState), secureStoreOptions);
}

const equalPin = (left: string, right: string) => {
  let difference = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  return difference === 0;
};

export async function verifyLocalPin(pin: string): Promise<void> {
  const expected = await SecureStore.getItemAsync(PIN_KEY, secureStoreOptions);
  if (!expected) throw new Error('Aucun PIN local configuré.');
  const rawState = await SecureStore.getItemAsync(PIN_STATE_KEY, secureStoreOptions);
  const state: PinState = rawState ? JSON.parse(rawState) as PinState : { attempts: 0, lockedUntil: 0 };
  const now = Date.now();
  if (state.lockedUntil > now) throw new Error(`Trop de tentatives. Réessayez dans ${Math.ceil((state.lockedUntil - now) / 1000)} s.`);
  if (!/^\d{4}$/.test(pin) || !equalPin(pin, expected)) {
    const attempts = state.attempts + 1;
    const next = attempts >= MAX_ATTEMPTS ? { attempts: 0, lockedUntil: now + LOCK_MS } : { attempts, lockedUntil: 0 };
    await SecureStore.setItemAsync(PIN_STATE_KEY, JSON.stringify(next), secureStoreOptions);
    throw new Error('PIN incorrect.');
  }
  await SecureStore.setItemAsync(PIN_STATE_KEY, JSON.stringify({ attempts: 0, lockedUntil: 0 } satisfies PinState), secureStoreOptions);
}

export async function importSyntheticDocument(): Promise<string | null> {
  const selection = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: false,
    multiple: false,
  });
  if (selection.canceled) return null;
  const asset = selection.assets[0];
  const source = new File(asset.uri);

    if (asset.size && asset.size > 5_000_000) throw new Error('Import refusé : fichier trop volumineux.');
    const plaintext = await readPickedFileBytes(asset.uri, source);
    if (plaintext.length === 0 || plaintext.length > 5_000_000) throw new Error('Import refusé : taille invalide.');
    const fixture = classifyImport(asset.name, plaintext);
    const id = randomUUID();
    const version = 1;
    const fileKey = await generateAesKey();
    const fileSealed = await aesEncryptAsync(plaintext, fileKey, {
      nonce: { length: 12 },
      tagLength: 16,
      additionalData: fileAad(id, version),
    });
    const verification = await aesDecryptAsync(fileSealed, fileKey, { additionalData: fileAad(id, version) });
    if (verification.length !== plaintext.length || verification.some((byte, index) => byte !== plaintext[index])) {
      throw new Error('Vérification du chiffrement impossible.');
    }

    const masterKey = await patientKey();
    const wrappedKey = await aesEncryptAsync(await fileKey.bytes(), masterKey, {
      nonce: { length: 12 }, tagLength: 16, additionalData: keyAad(id, version),
    });
    const metadata = utf8(JSON.stringify({ title: fixture.title, kind: fixture.kind, documentType: '', smartImportEligible: fixture.kind !== 'document' } satisfies Metadata));
    const encryptedMetadata = await aesEncryptAsync(metadata, fileKey, {
      nonce: { length: 12 }, tagLength: 16, additionalData: metadataAad(id, version),
    });
    const ciphertext = await fileSealed.combined();
    const blobName = `${id}.wvp`;
    const destination = new File(vaultDirectory, blobName);
    destination.create();
    destination.write(ciphertext);
    const ciphertextHash = arrayBufferToHex(await digest(CryptoDigestAlgorithm.SHA256, ciphertext as unknown as BufferSource));
    const createdAt = new Date().toISOString();
    const localDb = await db();
    try {
      await localDb.transaction(async () => {
        await localDb.runAsync(
          `INSERT INTO documents(id, patient_id, version, mime_type, size_bytes, blob_name, ciphertext_hash,
            wrapped_file_key, encrypted_metadata, created_at, sync_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          id, PATIENT_ID, version, fixture.mimeType, plaintext.length, blobName, ciphertextHash,
          await wrappedKey.combined('base64'), await encryptedMetadata.combined('base64'), createdAt, 'queued',
        );
        await localDb.runAsync(
          `INSERT INTO outbox(id, document_id, expected_version, operation, attempts, state)
           VALUES(?,?,?,?,0,'queued')`,
          `upload:${id}:${version}`, id, version, 'upload_ciphertext',
        );
      });
    } catch (error) {
      destination.delete();
      throw error;
    }
  return id;
}

async function unwrapFileKey(row: DocumentRow): Promise<AESEncryptionKey> {
  const masterKey = await patientKey();
  const wrapped = AESSealedData.fromCombined(decodeBase64(row.wrapped_file_key), { ivLength: 12, tagLength: 16 });
  const clear = await aesDecryptAsync(wrapped, masterKey, { additionalData: keyAad(row.id, row.version) });
  return AESEncryptionKey.import(clear) as unknown as Promise<AESEncryptionKey>;
}

async function decryptMetadata(row: DocumentRow, key: AESEncryptionKey): Promise<Metadata> {
  const sealed = AESSealedData.fromCombined(decodeBase64(row.encrypted_metadata), { ivLength: 12, tagLength: 16 });
  const clear = await aesDecryptAsync(sealed, key, { additionalData: metadataAad(row.id, row.version) });
  return JSON.parse(new TextDecoder().decode(clear)) as Metadata;
}

export async function listTimeline(): Promise<TimelineDocument[]> {
  const rows = await (await db()).getAllAsync<TimelineRow>(
    `SELECT d.*, o.state AS outbox_state FROM documents d
     LEFT JOIN outbox o ON o.document_id = d.id AND o.expected_version = d.version
     WHERE d.patient_id = ? ORDER BY d.created_at DESC`,
    PATIENT_ID,
  );
  return Promise.all(rows.map(async (row) => {
    const key = await unwrapFileKey(row);
    const metadata = await decryptMetadata(row, key);
    return {
      id: row.id,
      title: metadata.title,
      kind: metadata.kind,
      documentType: typeof metadata.documentType === 'string' ? metadata.documentType : '',
      createdAt: row.created_at,
      syncState: row.sync_state,
      outboxState: row.outbox_state ?? 'complete',
      smartImportEligible: metadata.smartImportEligible === true,
      aiAnalysis: metadata.aiAnalysis,
    };
  }));
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

type DemoSession = { accessToken: string; refreshToken: string; userId: string; expiresAt: number };

const supabaseConfig = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Connexion Supabase non configurée.');
  return { url, key };
};

async function demoSession(): Promise<DemoSession> {
  const existing = await SecureStore.getItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions);
  if (!existing) throw new Error('Connexion OTP patient requise avant la synchronisation.');
  const session = JSON.parse(existing) as Partial<DemoSession>;
  if (typeof session.accessToken !== 'string' || typeof session.refreshToken !== 'string' || typeof session.userId !== 'string') {
    await SecureStore.deleteItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions);
    throw new Error('Connexion OTP patient requise avant la synchronisation.');
  }
  if (typeof session.expiresAt === 'number' && session.expiresAt > Date.now() + 60_000) return session as DemoSession;

  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST', headers: restHeaders(key, key), body: JSON.stringify({ refresh_token: session.refreshToken }),
  });
  if (!response.ok) {
    await SecureStore.deleteItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions);
    throw new Error('Session distante expirée. Reconnectez-vous une fois par SMS.');
  }
  const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown }; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || typeof body.user?.id !== 'string') {
    await SecureStore.deleteItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions);
    throw new Error('Renouvellement de session invalide.');
  }
  const refreshed: DemoSession = {
    accessToken: body.access_token, refreshToken: body.refresh_token, userId: body.user.id,
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in * 1000 : 0),
  };
  await SecureStore.setItemAsync(SUPABASE_SESSION_KEY, JSON.stringify(refreshed), secureStoreOptions);
  return refreshed;
}

export const hasRemoteSession = async () => (await SecureStore.getItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions)) !== null;

export async function requestPatientOtp(phone: string): Promise<void> {
  const normalized = phone.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) throw new Error('Utilisez un numéro international, par exemple +221771234567.');
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST', headers: restHeaders(key, key),
    body: JSON.stringify({ phone: normalized, create_user: true }),
  });
  if (response.status === 422) {
    let errorCode = '';
    try {
      const body = await response.json() as { code?: unknown };
      if (typeof body.code === 'string' && /^[a-z0-9_-]{1,80}$/i.test(body.code)) errorCode = ` : ${body.code}`;
    } catch {
      // The server response is intentionally not logged or displayed.
    }
    throw new Error(`Demande SMS refusée par Supabase (422)${errorCode}. Vérifiez le numéro, les limites d’envoi et les restrictions du fournisseur.`);
  }
  if (!response.ok) throw new Error('Création du compte ou envoi du SMS indisponible.');
}

export async function signInWithRemotePin(phone: string, pin: string): Promise<void> {
  const normalized = phone.replace(/[\s()-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(normalized) || !/^\d{6}$/.test(pin)) throw new Error('Numéro ou code secret invalide.');
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: restHeaders(key, key), body: JSON.stringify({ phone: normalized, password: pin }),
  });
  if (!response.ok) throw new Error('Numéro ou code secret incorrect.');
  const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown }; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || typeof body.user?.id !== 'string') throw new Error('Session distante invalide.');
  await SecureStore.setItemAsync(SUPABASE_SESSION_KEY, JSON.stringify({
    accessToken: body.access_token, refreshToken: body.refresh_token, userId: body.user.id,
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in * 1000 : 0),
  } satisfies DemoSession), secureStoreOptions);
}

export async function verifyPatientOtp(phone: string, token: string): Promise<void> {
  const normalized = phone.replace(/[\s()-]/g, '');
  if (!/^\d{6}$/.test(token)) throw new Error('L’OTP doit contenir 6 chiffres.');
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST', headers: restHeaders(key, key),
    body: JSON.stringify({ phone: normalized, token, type: 'sms' }),
  });
  if (!response.ok) throw new Error('OTP expiré ou incorrect.');
  const body = await response.json() as { access_token?: unknown; refresh_token?: unknown; user?: { id?: unknown }; expires_in?: unknown };
  if (typeof body.access_token !== 'string' || typeof body.refresh_token !== 'string' || typeof body.user?.id !== 'string') throw new Error('Session OTP invalide.');
  await SecureStore.setItemAsync(SUPABASE_SESSION_KEY, JSON.stringify({
    accessToken: body.access_token, refreshToken: body.refresh_token, userId: body.user.id,
    expiresAt: Date.now() + (typeof body.expires_in === 'number' ? body.expires_in * 1000 : 0),
  } satisfies DemoSession), secureStoreOptions);
}

const restHeaders = (key: string, accessToken: string, prefer?: string) => ({
  apikey: key,
  Authorization: `Bearer ${accessToken}`,
  'Content-Type': 'application/json',
  ...(prefer ? { Prefer: prefer } : {}),
});

export async function processDocumentOutbox(): Promise<{ completed: number; pending: number }> {
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const localDb = await db();
  const profile = await fetch(`${url}/rest/v1/rpc/create_demo_profile`, {
    method: 'POST', headers: restHeaders(key, session.accessToken), body: JSON.stringify({ label: 'Patient Démo — données synthétiques' }),
  });
  if (!profile.ok) throw new Error('Profil patient de démonstration indisponible.');
  const rows = await localDb.getAllAsync<DocumentRow & { outbox_id: string }>(
    `SELECT d.*, o.id AS outbox_id FROM documents d JOIN outbox o ON o.document_id=d.id
     WHERE o.state IN ('queued','failed') ORDER BY d.created_at`,
  );
  let completed = 0;
  for (const row of rows) {
    try {
      await localDb.runAsync('UPDATE documents SET sync_state=? WHERE id=?', 'syncing', row.id);
      const encryptedFile = new File(vaultDirectory, row.blob_name);
      const ciphertext = toBase64(await encryptedFile.bytes());
      const documentResponse = await fetch(`${url}/rest/v1/documents?on_conflict=id`, {
        method: 'POST', headers: restHeaders(key, session.accessToken, 'resolution=ignore-duplicates'),
        body: JSON.stringify({ id: row.id, patient_id: session.userId, created_at: row.created_at }),
      });
      if (!documentResponse.ok) throw new Error('sync_document');
      const versionResponse = await fetch(`${url}/rest/v1/document_versions?on_conflict=document_id,version`, {
        method: 'POST', headers: restHeaders(key, session.accessToken, 'resolution=ignore-duplicates'),
        body: JSON.stringify({
          document_id: row.id, version: row.version, patient_id: session.userId, ciphertext,
          ciphertext_hash: row.ciphertext_hash, wrapped_file_key: row.wrapped_file_key,
          encrypted_metadata: row.encrypted_metadata, mime_type: row.mime_type,
          size_bytes: row.size_bytes, created_at: row.created_at,
        }),
      });
      if (!versionResponse.ok) throw new Error('sync_version');
      const mutationResponse = await fetch(`${url}/rest/v1/sync_mutations?on_conflict=patient_id,document_id,version`, {
        method: 'POST', headers: restHeaders(key, session.accessToken, 'resolution=ignore-duplicates'),
        body: JSON.stringify({ id: randomUUID(), patient_id: session.userId, document_id: row.id, version: row.version }),
      });
      if (!mutationResponse.ok) throw new Error('sync_mutation');
      await localDb.transaction(async () => {
        await localDb.runAsync('UPDATE documents SET sync_state=? WHERE id=?', 'synced', row.id);
        await localDb.runAsync('DELETE FROM outbox WHERE id=?', row.outbox_id);
      });
      completed += 1;
    } catch {
      await localDb.runAsync('UPDATE documents SET sync_state=? WHERE id=?', 'failed', row.id);
      await localDb.runAsync('UPDATE outbox SET state=?, attempts=attempts+1, error_code=? WHERE id=?', 'failed', 'sync_failed', row.outbox_id);
    }
  }
  const pending = await localDb.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM outbox');
  return { completed, pending: pending?.count ?? 0 };
}

export async function loadPatientProfile(): Promise<PatientProfile> {
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM config WHERE key = ?', ENCRYPTED_PROFILE_KEY);
  if (!row) return { displayName: '', age: '', bloodType: '', conditions: '' };
  const sealed = AESSealedData.fromCombined(decodeBase64(row.value), { ivLength: 12, tagLength: 16 });
  const clear = await aesDecryptAsync(sealed, await patientKey(), { additionalData: profileAad() });
  const stored = JSON.parse(new TextDecoder().decode(clear)) as Partial<PatientProfile> & { age?: string | number };
  return {
    displayName: typeof stored.displayName === 'string' ? stored.displayName : '',
    age: typeof stored.age === 'number' ? String(stored.age) : typeof stored.age === 'string' ? stored.age : '',
    bloodType: typeof stored.bloodType === 'string' ? stored.bloodType : '',
    conditions: typeof stored.conditions === 'string' ? stored.conditions : '',
  };
}

export async function savePatientProfile(profile: PatientProfile): Promise<void> {
  const age = profile.age.trim();
  if (age && (!/^\d{1,3}$/.test(age) || Number(age) < 1 || Number(age) > 130)) throw new Error('Âge invalide.');
  const normalized: PatientProfile = {
    displayName: profile.displayName.trim().slice(0, 80),
    age,
    bloodType: profile.bloodType.trim().slice(0, 8),
    conditions: profile.conditions.trim().slice(0, 500),
  };
  const encrypted = await aesEncryptAsync(utf8(JSON.stringify(normalized)), await patientKey(), {
    nonce: { length: 12 }, tagLength: 16, additionalData: profileAad(),
  });
  await (await db()).runAsync(
    `INSERT INTO config(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`,
    ENCRYPTED_PROFILE_KEY, await encrypted.combined('base64'),
  );
}

export async function syncPatientProfile(): Promise<void> {
  const session = await demoSession();
  const { url, key } = supabaseConfig();
  const row = await (await db()).getFirstAsync<{ value: string }>('SELECT value FROM config WHERE key = ?', ENCRYPTED_PROFILE_KEY);
  if (!row) return;
  const ciphertextHash = await digest(CryptoDigestAlgorithm.SHA256, utf8(row.value));
  const response = await fetch(`${url}/rest/v1/patient_profiles?on_conflict=patient_id`, {
    method: 'POST', headers: restHeaders(key, session.accessToken, 'resolution=merge-duplicates'),
    body: JSON.stringify({ patient_id: session.userId, ciphertext: row.value, ciphertext_hash: arrayBufferToHex(ciphertextHash) }),
  });
  if (!response.ok) throw new Error('Synchronisation du profil impossible.');
}

export type DemoShareSession = { sessionId: string; opaqueToken: string; expiresAt: string; qrPayload: string };
export type DemoShareStatus = {
  state: 'pending' | 'requested' | 'approved' | 'accessed' | 'declined' | 'revoked' | 'expired';
  requested: boolean;
  requesterName?: string;
  requesterFacility?: string;
  portalPublicKey?: string;
  expiresAt?: string;
};

export type PortalKeyEnvelope = {
  algorithm: 'nacl-box-v1';
  patientEphemeralPublicKey: string;
  encryptedFileKey: string;
  nonce: string;
};

export async function queueOfflineShareIntent(documentId: string): Promise<ShareIntent> {
  const localDb = await db();
  const document = await localDb.getFirstAsync<{ id: string }>('SELECT id FROM documents WHERE id = ? AND patient_id = ?', documentId, PATIENT_ID);
  if (!document) throw new Error('Document inconnu.');
  const intent = createPendingShareIntent(
    randomUUID(),
    documentId,
    new Date().toISOString(),
  );
  await localDb.runAsync(
    `INSERT INTO share_request_outbox(id, document_id, state, created_at)
     VALUES(?,?,'pending_connection',?) ON CONFLICT(document_id) DO UPDATE SET
     id=excluded.id, state='pending_connection', attempts=0, created_at=excluded.created_at`,
    intent.id, intent.documentId, intent.createdAt,
  );
  return intent;
}

export async function listPendingShareIntents(): Promise<ShareIntent[]> {
  const rows = await (await db()).getAllAsync<{ id: string; document_id: string; state: ShareIntent['state']; created_at: string }>(
    'SELECT id, document_id, state, created_at FROM share_request_outbox ORDER BY created_at',
  );
  return rows.map((row) => ({ id: row.id, documentId: row.document_id, state: row.state, createdAt: row.created_at }));
}

export async function processShareIntentOutbox(): Promise<{ completed: DemoShareSession[]; pending: number }> {
  const localDb = await db();
  const intents = await listPendingShareIntents();
  const completed: DemoShareSession[] = [];
  for (const intent of intents) {
    const document = await localDb.getFirstAsync<{ sync_state: SyncState }>('SELECT sync_state FROM documents WHERE id = ?', intent.documentId);
    if (document?.sync_state !== 'synced') continue;
    try {
      await localDb.runAsync('UPDATE share_request_outbox SET state = ? WHERE id = ?', 'activating', intent.id);
      const session = await createDemoShare(intent.documentId, { intentId: intent.id });
      await localDb.runAsync('DELETE FROM share_request_outbox WHERE id = ?', intent.id);
      completed.push(session);
    } catch {
      await localDb.runAsync('UPDATE share_request_outbox SET state = ?, attempts = attempts + 1 WHERE id = ?', 'failed', intent.id);
    }
  }
  const pending = await localDb.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM share_request_outbox');
  return { completed, pending: pending?.count ?? 0 };
}

export async function createDemoShare(documentId: string, offlineIntent?: { intentId: string }): Promise<DemoShareSession> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error('Document invalide.');
  if (offlineIntent && !/^[0-9a-f-]{36}$/i.test(offlineIntent.intentId)) throw new Error('Intention de partage invalide.');
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const response = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST', headers: restHeaders(key, session.accessToken),
    body: JSON.stringify({ action: 'create', documentId, ...(offlineIntent ?? {}) }),
  });
  if (!response.ok) throw new Error('Création du partage impossible. Synchronisez d’abord le document.');
  const body = await response.json() as Partial<DemoShareSession>;
  if (!body.sessionId || !body.opaqueToken || !body.expiresAt || !body.qrPayload) throw new Error('Session de partage invalide.');
  return body as DemoShareSession;
}

export async function revokeDemoShare(sessionId: string): Promise<void> {
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const response = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST', headers: restHeaders(key, session.accessToken),
    body: JSON.stringify({ action: 'revoke', sessionId }),
  });
  if (!response.ok) throw new Error('Révocation impossible.');
}

export async function checkDemoShareRequest(sessionId: string): Promise<DemoShareStatus> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('Session de partage invalide.');
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const response = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST', headers: restHeaders(key, session.accessToken),
    body: JSON.stringify({ action: 'status', sessionId }),
  });
  if (!response.ok) throw new Error('Vérification de la demande impossible.');
  const body = await response.json() as Partial<DemoShareStatus>;
  return {
    state: body.state ?? 'pending',
    requested: body.requested === true,
    requesterName: body.requesterName,
    requesterFacility: body.requesterFacility,
    portalPublicKey: body.portalPublicKey,
    expiresAt: body.expiresAt,
  };
}

export async function createPortalKeyEnvelope(documentId: string, portalPublicKey: string): Promise<PortalKeyEnvelope> {
  const portalKey = decodeBase64(portalPublicKey);
  if (portalKey.length !== nacl.box.publicKeyLength) throw new Error('Clé temporaire du portail invalide.');
  const row = await (await db()).getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', documentId, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const fileKey = await unwrapFileKey(row);
  const patientSecret = getRandomBytes(nacl.box.secretKeyLength);
  const patientKeys = nacl.box.keyPair.fromSecretKey(patientSecret);
  const nonce = getRandomBytes(nacl.box.nonceLength);
  const encryptedFileKey = nacl.box(new Uint8Array(await fileKey.bytes()), nonce, portalKey, patientKeys.secretKey);
  return {
    algorithm: 'nacl-box-v1',
    patientEphemeralPublicKey: toBase64(patientKeys.publicKey),
    encryptedFileKey: toBase64(encryptedFileKey),
    nonce: toBase64(nonce),
  };
}

async function decideDemoShare(sessionId: string, action: 'approve' | 'decline', keyEnvelope?: PortalKeyEnvelope): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(sessionId)) throw new Error('Session de partage invalide.');
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const response = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST', headers: restHeaders(key, session.accessToken), body: JSON.stringify({ action, sessionId, ...(keyEnvelope ?? {}) }),
  });
  if (!response.ok) throw new Error(action === 'approve' ? 'Accord impossible.' : 'Refus impossible.');
  await response.json();
}

export const approveDemoShare = (sessionId: string, keyEnvelope: PortalKeyEnvelope) => decideDemoShare(sessionId, 'approve', keyEnvelope);
export const declineDemoShare = (sessionId: string) => decideDemoShare(sessionId, 'decline');

export async function openLocalDocument(id: string): Promise<{ title: string; mimeType: string; sizeBytes: number; imageDataUri?: string }> {
  const row = await (await db()).getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', id, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const key = await unwrapFileKey(row);
  const metadata = await decryptMetadata(row, key);
  const encryptedFile = new File(vaultDirectory, row.blob_name);
  const ciphertext = await encryptedFile.bytes();
  const storedHash = arrayBufferToHex(await digest(CryptoDigestAlgorithm.SHA256, ciphertext as unknown as BufferSource));
  const hashRow = await (await db()).getFirstAsync<{ ciphertext_hash: string }>('SELECT ciphertext_hash FROM documents WHERE id = ?', id);
  if (!hashRow || hashRow.ciphertext_hash !== storedHash) throw new Error('Ciphertext altéré.');
  const sealed = AESSealedData.fromCombined(ciphertext, { ivLength: 12, tagLength: 16 });
  const plaintext = await aesDecryptAsync(sealed, key, { additionalData: fileAad(row.id, row.version) });
  return {
    title: metadata.title,
    mimeType: row.mime_type,
    sizeBytes: plaintext.length,
    imageDataUri: row.mime_type === 'image/jpeg' || row.mime_type === 'image/png' ? `data:${row.mime_type};base64,${toBase64(plaintext)}` : undefined,
  };
}

export async function prepareSmartImport(id: string): Promise<SmartImportRequest> {
  const row = await (await db()).getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', id, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const key = await unwrapFileKey(row);
  const metadata = await decryptMetadata(row, key);
  if (!metadata.smartImportEligible || metadata.kind === 'document') throw new Error('Analyse intelligente indisponible pour ce fichier.');
  return parseSmartImportRequest({
    requestId: randomUUID(),
    schemaVersion: 2,
    pseudonymizedText: extractAndPseudonymizeFixture(metadata.kind),
    locale: 'fr',
  });
}

export async function updateDocumentType(id: string, value: string): Promise<string> {
  const documentType = normalizeDocumentType(value);
  const localDb = await db();
  const row = await localDb.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', id, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const key = await unwrapFileKey(row);
  const current = await decryptMetadata(row, key);
  const encrypted = await aesEncryptAsync(utf8(JSON.stringify({ ...current, documentType } satisfies Metadata)), key, {
    nonce: { length: 12 }, tagLength: 16, additionalData: metadataAad(row.id, row.version),
  });
  await localDb.runAsync('UPDATE documents SET encrypted_metadata = ? WHERE id = ? AND patient_id = ?', await encrypted.combined('base64'), row.id, PATIENT_ID);
  return documentType;
}

export async function queueApprovedSmartImport(documentId: string, request: SmartImportRequest): Promise<void> {
  const approved = parseSmartImportRequest(request);
  await (await db()).runAsync(
    `INSERT INTO smart_import_outbox(request_id, document_id, approved_payload, state, created_at)
     VALUES(?,?,?,'queued',?) ON CONFLICT(document_id) DO UPDATE SET
     request_id=excluded.request_id, approved_payload=excluded.approved_payload, state='queued', created_at=excluded.created_at`,
    approved.requestId, documentId, JSON.stringify(approved), new Date().toISOString(),
  );
}

export type PendingSmartImportResult = {
  requestId: string;
  documentId: string;
  result: SmartImportResponse;
  source: 'groq' | 'openai_legacy' | 'local_demo_simulation';
  model?: string;
};

type StoredSmartImportResult = {
  source?: unknown;
  model?: unknown;
  result?: unknown;
};

async function sealPendingSmartImportResult(documentId: string, requestId: string, value: StoredSmartImportResult): Promise<string> {
  const localDb = await db();
  const document = await localDb.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', documentId, PATIENT_ID);
  if (!document) throw new Error('Document inconnu.');
  const sealed = await aesEncryptAsync(utf8(JSON.stringify(value)), await unwrapFileKey(document), {
    nonce: { length: 12 }, tagLength: 16, additionalData: smartImportResultAad(documentId, requestId),
  });
  return sealed.combined('base64');
}

async function openPendingSmartImportResult(row: { request_id: string; document_id: string; response_payload: string }): Promise<StoredSmartImportResult> {
  // Compatibilité : les résultats créés avant le chiffrement local restent lisibles puis sont supprimés après décision.
  if (row.response_payload.trimStart().startsWith('{')) return JSON.parse(row.response_payload) as StoredSmartImportResult;
  const localDb = await db();
  const document = await localDb.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', row.document_id, PATIENT_ID);
  if (!document) throw new Error('Document inconnu.');
  const sealed = AESSealedData.fromCombined(decodeBase64(row.response_payload), { ivLength: 12, tagLength: 16 });
  const clear = await aesDecryptAsync(sealed, await unwrapFileKey(document), { additionalData: smartImportResultAad(row.document_id, row.request_id) });
  return JSON.parse(new TextDecoder().decode(clear)) as StoredSmartImportResult;
}

let processingSmartImports = false;

export async function processSmartImportOutbox(): Promise<{ completed: number; pending: number }> {
  if (processingSmartImports) return { completed: 0, pending: 0 };
  const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) throw new Error('Connexion Supabase non configurée.');
  processingSmartImports = true;
  let completed = 0;
  try {
    const localDb = await db();
    const rows = await localDb.getAllAsync<{ request_id: string; document_id: string; approved_payload: string }>(
      'SELECT request_id, document_id, approved_payload FROM smart_import_outbox ORDER BY created_at',
    );
    for (const row of rows) {
      try {
        const approved = parseSmartImportRequest(JSON.parse(row.approved_payload));
        const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/functions/v1/smart-import`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${publishableKey}`, apikey: publishableKey, 'Content-Type': 'application/json' },
          body: JSON.stringify(approved),
        });
        if (!response.ok) throw new Error(`smart_import_http_${response.status}`);
        const body = await response.json() as { result?: unknown; provider?: unknown; model?: unknown };
        const result = parseSmartImportResponse(body.result);
        const source = body.provider === 'groq' ? 'groq' : 'openai_legacy';
        const model = typeof body.model === 'string' && body.model.length <= 100 ? body.model : undefined;
        const encryptedResult = await sealPendingSmartImportResult(row.document_id, row.request_id, { source, model, result });
        await localDb.transaction(async () => {
          await localDb.runAsync(
            `INSERT INTO smart_import_results(request_id, document_id, response_payload, created_at) VALUES(?,?,?,?)
             ON CONFLICT(document_id) DO UPDATE SET request_id=excluded.request_id, response_payload=excluded.response_payload, created_at=excluded.created_at`,
            row.request_id, row.document_id, encryptedResult, new Date().toISOString(),
          );
          await localDb.runAsync('DELETE FROM smart_import_outbox WHERE request_id = ?', row.request_id);
        });
        completed += 1;
      } catch {
        // Le payload et les erreurs réseau ne sont jamais journalisés. La ligne reste réessayable.
      }
    }
    const pending = await localDb.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM smart_import_outbox');
    return { completed, pending: pending?.count ?? 0 };
  } finally {
    processingSmartImports = false;
  }
}

export async function listPendingSmartImportResults(): Promise<PendingSmartImportResult[]> {
  const rows = await (await db()).getAllAsync<{ request_id: string; document_id: string; response_payload: string }>(
    'SELECT request_id, document_id, response_payload FROM smart_import_results ORDER BY created_at',
  );
  return Promise.all(rows.map(async (row) => {
    const stored = await openPendingSmartImportResult(row);
    if (stored.source === 'groq' || stored.source === 'openai_legacy' || stored.source === 'local_demo_simulation') {
      return {
        requestId: row.request_id,
        documentId: row.document_id,
        source: stored.source,
        model: typeof stored.model === 'string' && stored.model.length <= 100 ? stored.model : undefined,
        result: parseSmartImportResponse(stored.result),
      };
    }
    if (stored.source === 'gpt-5.6') {
      return { requestId: row.request_id, documentId: row.document_id, source: 'openai_legacy' as const, model: 'gpt-5.6', result: parseSmartImportResponse(stored.result) };
    }
    return { requestId: row.request_id, documentId: row.document_id, source: 'openai_legacy' as const, model: 'gpt-5.6', result: parseSmartImportResponse(stored) };
  }));
}

export async function simulatePendingSmartImports(): Promise<number> {
  const localDb = await db();
  const rows = await localDb.getAllAsync<{ request_id: string; document_id: string; approved_payload: string }>(
    'SELECT request_id, document_id, approved_payload FROM smart_import_outbox ORDER BY created_at',
  );
  for (const row of rows) {
    const request = parseSmartImportRequest(JSON.parse(row.approved_payload));
    const result = simulateSmartImportLocally(request);
    const encryptedResult = await sealPendingSmartImportResult(row.document_id, row.request_id, { source: 'local_demo_simulation', result });
    await localDb.transaction(async () => {
      await localDb.runAsync(
        `INSERT INTO smart_import_results(request_id, document_id, response_payload, created_at) VALUES(?,?,?,?)
         ON CONFLICT(document_id) DO UPDATE SET request_id=excluded.request_id, response_payload=excluded.response_payload, created_at=excluded.created_at`,
        row.request_id, row.document_id, encryptedResult, new Date().toISOString(),
      );
      await localDb.runAsync('DELETE FROM smart_import_outbox WHERE request_id = ?', row.request_id);
    });
  }
  return rows.length;
}

async function reviewSmartImportResult(item: PendingSmartImportResult, status: StoredAiAnalysis['status']): Promise<void> {
  const localDb = await db();
  const row = await localDb.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', item.documentId, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const result = parseSmartImportResponse(item.result);
  const key = await unwrapFileKey(row);
  const current = await decryptMetadata(row, key);
  const aiAnalysis: StoredAiAnalysis = {
    status,
    reviewedAt: new Date().toISOString(),
    source: item.source,
    ...(item.model ? { model: item.model } : {}),
    result,
  };
  const next: Metadata = status === 'confirmed'
    ? { ...current, title: result.suggestedTitle, documentType: result.documentType, aiAnalysis }
    : { ...current, aiAnalysis };
  const encrypted = await aesEncryptAsync(utf8(JSON.stringify(next)), key, {
    nonce: { length: 12 }, tagLength: 16, additionalData: metadataAad(row.id, row.version),
  });
  await localDb.transaction(async () => {
    await localDb.runAsync('UPDATE documents SET encrypted_metadata = ? WHERE id = ? AND patient_id = ?', await encrypted.combined('base64'), row.id, PATIENT_ID);
    await localDb.runAsync('DELETE FROM smart_import_results WHERE request_id = ?', item.requestId);
  });
}

export const confirmSmartImportResult = (item: PendingSmartImportResult) => reviewSmartImportResult(item, 'confirmed');
export const rejectSmartImportResult = (item: PendingSmartImportResult) => reviewSmartImportResult(item, 'rejected');

export async function resetLocalDemo(): Promise<void> {
  const opened = database;
  database = null;
  if (opened) await opened.close().catch(() => undefined);
  await deleteDatabaseAsync(DB_NAME);
  if (vaultDirectory.exists) vaultDirectory.delete();
  await Promise.all([DEVICE_KEY, PIN_KEY, PIN_STATE_KEY, SUPABASE_SESSION_KEY].map((key) => SecureStore.deleteItemAsync(key, secureStoreOptions)));
}
