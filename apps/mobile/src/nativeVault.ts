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
import * as SecureStore from 'expo-secure-store';
import { deleteDatabaseAsync, openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { extractAndPseudonymizeFixture, parseSmartImportRequest, parseSmartImportResponse, simulateSmartImportLocally, type SmartImportRequest, type SmartImportResponse } from '../../../packages/contracts/src/smart-import';

const PATIENT_ID = 'patient-demo';
const DB_NAME = 'werpass-vault.db';
const DB_KEY = 'werpass.db-key.v1';
const DEVICE_KEY = 'werpass.device-key.v1';
const PIN_KEY = 'werpass.local-pin.v1';
const PIN_STATE_KEY = 'werpass.pin-state.v1';
const SUPABASE_SESSION_KEY = 'werpass.supabase-session.v1';
const MAX_ATTEMPTS = 5;
const LOCK_MS = 30_000;
const vaultDirectory = new Directory(Paths.document, 'vault');
const secureStoreOptions: SecureStore.SecureStoreOptions = { keychainService: 'werpass-vault' };

type SyncState = 'queued' | 'syncing' | 'synced' | 'failed';
type DocumentKind = 'prescription' | 'lab-result';
type Metadata = { title: string; kind: DocumentKind };
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
};

let database: SQLiteDatabase | null = null;

const utf8 = (value: string) => new TextEncoder().encode(value);
const bytesToHex = (value: Uint8Array) => Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
const arrayBufferToHex = (value: ArrayBuffer) => bytesToHex(new Uint8Array(value));
const fileAad = (documentId: string, version: number) => utf8(`werpass:file:v1:${PATIENT_ID}:${documentId}:${version}`);
const metadataAad = (documentId: string, version: number) => utf8(`werpass:metadata:v1:${PATIENT_ID}:${documentId}:${version}`);
const keyAad = (documentId: string, version: number) => utf8(`werpass:file-key:v1:${PATIENT_ID}:${documentId}:${version}`);
const patientKeyAad = () => utf8(`werpass:patient-key:v1:${PATIENT_ID}`);

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

async function db(): Promise<SQLiteDatabase> {
  if (database) return database;
  const key = await secureValue(DB_KEY);
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error('Invalid local database key');
  const opened = await openDatabaseAsync(DB_NAME);
  await opened.execAsync(`PRAGMA key = "x'${key}'"; PRAGMA foreign_keys = ON;`);
  await opened.execAsync(`
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
  `);
  database = opened;
  return opened;
}

async function patientKey(): Promise<AESEncryptionKey> {
  const localDb = await db();
  const row = await localDb.getFirstAsync<{ value: string }>('SELECT value FROM config WHERE key = ?', 'wrapped_patient_key');
  const deviceKeyHex = await secureValue(DEVICE_KEY);
  const deviceKey = await AESEncryptionKey.import(deviceKeyHex, 'hex') as unknown as AESEncryptionKey;
  if (row) {
    const sealed = AESSealedData.fromCombined(row.value, { ivLength: 12, tagLength: 16 });
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
  if (!/^\d{4,8}$/.test(pin)) throw new Error('Le PIN doit contenir 4 à 8 chiffres.');
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
  if (!/^\d{4,8}$/.test(pin) || !equalPin(pin, expected)) {
    const attempts = state.attempts + 1;
    const next = attempts >= MAX_ATTEMPTS ? { attempts: 0, lockedUntil: now + LOCK_MS } : { attempts, lockedUntil: 0 };
    await SecureStore.setItemAsync(PIN_STATE_KEY, JSON.stringify(next), secureStoreOptions);
    throw new Error('PIN incorrect.');
  }
  await SecureStore.setItemAsync(PIN_STATE_KEY, JSON.stringify({ attempts: 0, lockedUntil: 0 } satisfies PinState), secureStoreOptions);
}

const allowedFixture = (name: string) => {
  if (name === 'prescription-demo.pdf') return { kind: 'prescription' as const, mimeType: 'application/pdf', title: 'Ordonnance synthétique' };
  if (name === 'lab-result-demo.jpg') return { kind: 'lab-result' as const, mimeType: 'image/jpeg', title: 'Résultat d’analyse synthétique' };
  return null;
};

export async function importSyntheticDocument(): Promise<string | null> {
  const selection = await DocumentPicker.getDocumentAsync({
    type: ['application/pdf', 'image/jpeg'],
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (selection.canceled) return null;
  const asset = selection.assets[0];
  const source = new File(asset.uri);
  try {
    const fixture = allowedFixture(asset.name);
    if (!fixture) throw new Error('Import refusé : choisissez uniquement une des deux fixtures synthétiques.');
    if (asset.size && asset.size > 5_000_000) throw new Error('Import refusé : fichier trop volumineux.');
    const plaintext = await source.bytes();
    if (plaintext.length === 0 || plaintext.length > 5_000_000) throw new Error('Import refusé : taille invalide.');
    source.delete();
    if (source.exists) throw new Error('Suppression de la copie temporaire impossible.');
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
    const metadata = utf8(JSON.stringify({ title: fixture.title, kind: fixture.kind } satisfies Metadata));
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
      await localDb.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync(
          `INSERT INTO documents(id, patient_id, version, mime_type, size_bytes, blob_name, ciphertext_hash,
            wrapped_file_key, encrypted_metadata, created_at, sync_state) VALUES(?,?,?,?,?,?,?,?,?,?,?)`,
          id, PATIENT_ID, version, fixture.mimeType, plaintext.length, blobName, ciphertextHash,
          await wrappedKey.combined('base64'), await encryptedMetadata.combined('base64'), createdAt, 'queued',
        );
        await transaction.runAsync(
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
  } finally {
    try {
      if (source.exists) source.delete();
    } catch {
      // Cache-scoped picker copies are also cleaned by the OS; never expose a path in an error.
    }
  }
}

async function unwrapFileKey(row: DocumentRow): Promise<AESEncryptionKey> {
  const masterKey = await patientKey();
  const wrapped = AESSealedData.fromCombined(row.wrapped_file_key, { ivLength: 12, tagLength: 16 });
  const clear = await aesDecryptAsync(wrapped, masterKey, { additionalData: keyAad(row.id, row.version) });
  return AESEncryptionKey.import(clear) as unknown as Promise<AESEncryptionKey>;
}

async function decryptMetadata(row: DocumentRow, key: AESEncryptionKey): Promise<Metadata> {
  const sealed = AESSealedData.fromCombined(row.encrypted_metadata, { ivLength: 12, tagLength: 16 });
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
    return { id: row.id, title: metadata.title, kind: metadata.kind, createdAt: row.created_at, syncState: row.sync_state, outboxState: row.outbox_state ?? 'complete' };
  }));
}

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
};

type DemoSession = { accessToken: string; userId: string };

const supabaseConfig = () => {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Connexion Supabase non configurée.');
  return { url, key };
};

async function demoSession(): Promise<DemoSession> {
  const existing = await SecureStore.getItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions);
  if (existing) return JSON.parse(existing) as DemoSession;
  throw new Error('Connexion OTP patient requise avant la synchronisation.');
}

export const hasRemoteSession = async () => (await SecureStore.getItemAsync(SUPABASE_SESSION_KEY, secureStoreOptions)) !== null;

export async function requestPatientOtp(email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Adresse e-mail de démonstration invalide.');
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/otp`, {
    method: 'POST', headers: restHeaders(key, key),
    body: JSON.stringify({ email: normalized, create_user: true }),
  });
  if (!response.ok) throw new Error('Envoi OTP indisponible.');
}

export async function verifyPatientOtp(email: string, token: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!/^\d{6}$/.test(token)) throw new Error('L’OTP doit contenir 6 chiffres.');
  const { url, key } = supabaseConfig();
  const response = await fetch(`${url}/auth/v1/verify`, {
    method: 'POST', headers: restHeaders(key, key),
    body: JSON.stringify({ email: normalized, token, type: 'email' }),
  });
  if (!response.ok) throw new Error('OTP expiré ou incorrect.');
  const body = await response.json() as { access_token?: unknown; user?: { id?: unknown } };
  if (typeof body.access_token !== 'string' || typeof body.user?.id !== 'string') throw new Error('Session OTP invalide.');
  await SecureStore.setItemAsync(SUPABASE_SESSION_KEY, JSON.stringify({ accessToken: body.access_token, userId: body.user.id } satisfies DemoSession), secureStoreOptions);
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
      await localDb.withExclusiveTransactionAsync(async (transaction) => {
        await transaction.runAsync('UPDATE documents SET sync_state=? WHERE id=?', 'synced', row.id);
        await transaction.runAsync('DELETE FROM outbox WHERE id=?', row.outbox_id);
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

export type DemoShareSession = { sessionId: string; opaqueToken: string; code: string; expiresAt: string; qrPayload: string };

export async function createDemoShare(documentId: string): Promise<DemoShareSession> {
  if (!/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error('Document invalide.');
  const { url, key } = supabaseConfig();
  const session = await demoSession();
  const response = await fetch(`${url}/functions/v1/share-demo`, {
    method: 'POST', headers: restHeaders(key, session.accessToken),
    body: JSON.stringify({ action: 'create', documentId }),
  });
  if (!response.ok) throw new Error('Création du partage impossible. Synchronisez d’abord le document.');
  const body = await response.json() as Partial<DemoShareSession>;
  if (!body.sessionId || !body.opaqueToken || !body.code || !body.expiresAt || !body.qrPayload) throw new Error('Session de partage invalide.');
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
    imageDataUri: row.mime_type === 'image/jpeg' ? `data:image/jpeg;base64,${toBase64(plaintext)}` : undefined,
  };
}

export async function prepareSmartImport(id: string): Promise<SmartImportRequest> {
  const row = await (await db()).getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', id, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const key = await unwrapFileKey(row);
  const metadata = await decryptMetadata(row, key);
  return parseSmartImportRequest({
    requestId: randomUUID(),
    schemaVersion: 1,
    pseudonymizedText: extractAndPseudonymizeFixture(metadata.kind),
    locale: 'fr',
    allowedDocumentTypes: ['prescription', 'lab_result'],
  });
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

export type PendingSmartImportResult = { requestId: string; documentId: string; result: SmartImportResponse; source: 'gpt-5.6' | 'local_demo_simulation' };

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
        const body = await response.json() as { result?: unknown };
        const result = parseSmartImportResponse(body.result);
        await localDb.withExclusiveTransactionAsync(async (transaction) => {
          await transaction.runAsync(
            `INSERT INTO smart_import_results(request_id, document_id, response_payload, created_at) VALUES(?,?,?,?)
             ON CONFLICT(document_id) DO UPDATE SET request_id=excluded.request_id, response_payload=excluded.response_payload, created_at=excluded.created_at`,
            row.request_id, row.document_id, JSON.stringify({ source: 'gpt-5.6', result }), new Date().toISOString(),
          );
          await transaction.runAsync('DELETE FROM smart_import_outbox WHERE request_id = ?', row.request_id);
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
  return rows.map((row) => {
    const stored = JSON.parse(row.response_payload) as { source?: unknown; result?: unknown };
    if (stored.source === 'gpt-5.6' || stored.source === 'local_demo_simulation') {
      return { requestId: row.request_id, documentId: row.document_id, source: stored.source, result: parseSmartImportResponse(stored.result) };
    }
    return { requestId: row.request_id, documentId: row.document_id, source: 'gpt-5.6' as const, result: parseSmartImportResponse(stored) };
  });
}

export async function simulatePendingSmartImports(): Promise<number> {
  const localDb = await db();
  const rows = await localDb.getAllAsync<{ request_id: string; document_id: string; approved_payload: string }>(
    'SELECT request_id, document_id, approved_payload FROM smart_import_outbox ORDER BY created_at',
  );
  for (const row of rows) {
    const request = parseSmartImportRequest(JSON.parse(row.approved_payload));
    const result = simulateSmartImportLocally(request);
    await localDb.withExclusiveTransactionAsync(async (transaction) => {
      await transaction.runAsync(
        `INSERT INTO smart_import_results(request_id, document_id, response_payload, created_at) VALUES(?,?,?,?)
         ON CONFLICT(document_id) DO UPDATE SET request_id=excluded.request_id, response_payload=excluded.response_payload, created_at=excluded.created_at`,
        row.request_id, row.document_id, JSON.stringify({ source: 'local_demo_simulation', result }), new Date().toISOString(),
      );
      await transaction.runAsync('DELETE FROM smart_import_outbox WHERE request_id = ?', row.request_id);
    });
  }
  return rows.length;
}

export async function confirmSmartImportResult(item: PendingSmartImportResult): Promise<void> {
  const localDb = await db();
  const row = await localDb.getFirstAsync<DocumentRow>('SELECT * FROM documents WHERE id = ? AND patient_id = ?', item.documentId, PATIENT_ID);
  if (!row) throw new Error('Document inconnu.');
  const result = parseSmartImportResponse(item.result);
  const key = await unwrapFileKey(row);
  const current = await decryptMetadata(row, key);
  const encrypted = await aesEncryptAsync(utf8(JSON.stringify({ ...current, title: result.suggestedTitle } satisfies Metadata)), key, {
    nonce: { length: 12 }, tagLength: 16, additionalData: metadataAad(row.id, row.version),
  });
  await localDb.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync('UPDATE documents SET encrypted_metadata = ? WHERE id = ? AND patient_id = ?', await encrypted.combined('base64'), row.id, PATIENT_ID);
    await transaction.runAsync('DELETE FROM smart_import_results WHERE request_id = ?', item.requestId);
  });
}

export async function resetLocalDemo(): Promise<void> {
  if (database) {
    await database.closeAsync();
    database = null;
  }
  await deleteDatabaseAsync(DB_NAME);
  if (vaultDirectory.exists) vaultDirectory.delete();
  await Promise.all([DB_KEY, DEVICE_KEY, PIN_KEY, PIN_STATE_KEY, SUPABASE_SESSION_KEY].map((key) => SecureStore.deleteItemAsync(key, secureStoreOptions)));
}
