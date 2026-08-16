import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { decryptDocument, encryptDocument, generateKey } from '../../../packages/contracts/src/crypto.ts';
import { createLockedVault, queueDocument, transitionSyncState, unlockVault } from '../../../packages/contracts/src/vault.ts';
import { decideSmartImport, extractAndPseudonymizeFixture, normalizeDocumentType, parseSmartImportRequest, parseSmartImportResponse, simulateSmartImportLocally } from '../../../packages/contracts/src/smart-import.ts';
import { createPendingShareIntent, transitionShareIntent } from '../src/shareIntent.ts';
import { classifyImport } from '../src/importPolicy.ts';
import { decodeBase64 } from '../src/binaryEncoding.ts';
import { isUnreadableVaultDatabaseError, VaultRecoveryRequiredError } from '../src/vaultRecovery.ts';
import { isValidSenegalNationalNumber, sanitizeSenegalNationalNumber, toSenegalE164 } from '../src/senegalPhone.ts';
import { PIN_RELOCK_AFTER_MS, shouldRelockAfterBackground } from '../src/lockTimeout.ts';

assert.equal(process.env.WERPASS_DEMO ?? 'true', 'true');

const nativeVaultSource = await readFile(new URL('../src/nativeVault.ts', import.meta.url), 'utf8');
assert.match(nativeVaultSource, /SQLiteVaultDatabase/, 'the vault must use the replaceable database abstraction');
assert.doesNotMatch(nativeVaultSource, /(?:PRAGMA\s+key|useSQLCipher|DB_KEY|SQLCipher)/i, 'the hackathon vault must use standard SQLite');
assert.match(nativeVaultSource, /grant_type=refresh_token/, 'an expired remote session must be renewable without a new OTP');
assert.match(nativeVaultSource, /refreshToken: body\.refresh_token/, 'the rotated refresh token must replace the previous one');
assert.doesNotMatch(nativeVaultSource, /console\.log\([^)]*(?:accessToken|refreshToken)/, 'remote tokens must never be logged');
assert.match(nativeVaultSource, /auth\/v1\/otp/, 'patient OTP must use Supabase’s dedicated OTP endpoint');
assert.match(nativeVaultSource, /readAsStringAsync/, 'document import must support protected Android content URIs');
assert.match(nativeVaultSource, /EncodingType\.Base64/, 'the protected URI fallback must read bytes without exposing plaintext remotely');
assert.match(nativeVaultSource, /copyToCacheDirectory: false/, 'document import must retain the Android picker read grant');
assert.doesNotMatch(nativeVaultSource, /source\.delete\(\)/, 'document import must never delete the user-selected original');
assert.match(nativeVaultSource, /create_user: true/, 'patient OTP may create a phone identity without reusing the local PIN');
assert.doesNotMatch(nativeVaultSource, /requestPatientOtp\(phone: string, pin: string\)/, 'the local PIN must not be sent to Supabase');
assert.match(nativeVaultSource, /errorCode/, 'a 422 response must expose only its safe technical code for diagnosis');
assert.match(nativeVaultSource, /Demande SMS refusée par Supabase \(422\)/, 'a 422 response must be reported without assuming its cause');
const appSource = await readFile(new URL('../App.tsx', import.meta.url), 'utf8');
assert.match(appSource, /setSignupStep\('otp'\);\s+setMessage\(''\);/, 'a failed OTP send may continue without surfacing a transport error');
assert.doesNotMatch(nativeVaultSource, /demoDisplay|EXPO_PUBLIC_DEMO_MODE/, 'the direct-share flow must never retrieve or display a medical code');
assert.match(nativeVaultSource, /createPortalKeyEnvelope/, 'patient approval must create a temporary portal key envelope');
assert.match(nativeVaultSource, /nacl\.box\(/, 'the document key must be encrypted for the portal, never sent in clear text');
assert.doesNotMatch(nativeVaultSource, /inAppDemoDisplay \? null : await demoSession\(\)/, 'share status must always authenticate the patient owner');
assert.match(nativeVaultSource, /headers: restHeaders\(key, session\.accessToken\)/, 'share status must use the patient session');
assert.match(appSource, /Date\.parse\(share\.expiresAt\) - Date\.now\(\)/, 'the temporary share must expire from the mobile UI');
assert.match(appSource, /Code de partage expiré et supprimé/, 'an unused share code must be removed after expiry');
assert.match(appSource, /const created = await createDemoShare\(document\.id\)/, 'a share code is created only after the patient action');
assert.match(appSource, /Aucun code médical supplémentaire n’est demandé/, 'the app must explain that patient approval opens the portal directly');
assert.match(appSource, /expo-clipboard/, 'the patient must be able to copy the opaque share code');
assert.match(appSource, /copyShareCode\(homeQr\)/, 'the copy action must be visible next to the share code');
assert.match(appSource, /match\(\/\.\{1,4\}\/g\)/, 'the opaque share code must be displayed in short readable segments');
assert.match(appSource, /Générer un code de partage/, 'a share code must be generated only by explicit patient action');
assert.doesNotMatch(appSource, /share\?\.qrPayload \?\? shareIntents/, 'an offline intent must not display a permanent QR');
assert.match(nativeVaultSource, /documentType: result\.documentType/, 'the confirmed AI type must be stored in encrypted metadata');
assert.match(nativeVaultSource, /aiAnalysis: StoredAiAnalysis/, 'the reviewed AI result and patient decision must be stored in encrypted metadata');
assert.match(nativeVaultSource, /smartImportResultAad/, 'pending AI results must be bound to the document and request with authenticated encryption');
assert.match(nativeVaultSource, /sealPendingSmartImportResult/, 'pending AI results must be encrypted before SQLite persistence');
assert.match(nativeVaultSource, /rejectSmartImportResult/, 'the patient must be able to reject an AI result');
assert.match(appSource, /reject_analysis_button/, 'the AI review must expose an explicit reject action');
assert.match(appSource, /requestSmartImportConsent/, 'pressing AI analysis must enter an explicit consent warning');
assert.match(appSource, /Alert\.alert\([\s\S]*ai_consent_warning_title/, 'the AI warning must be shown before preparing the payload');
assert.match(appSource, /requestSmartImportConsent\(preview\.document\)/, 'the document action must not bypass the AI warning');
assert.match(appSource, /ai_unavailable_title/, 'unsupported documents must keep the AI action visible and explain the OCR limitation');
assert.doesNotMatch(appSource, /preview\.document\.smartImportEligible \? \(\s*<Button/, 'the AI action must not disappear for unsupported documents');
assert.match(appSource, /ai_consent_warning_short_message/, 'the editable anonymization preview must repeat the warning before final confirmation');
assert.match(nativeVaultSource, /updateDocumentType/, 'manual document classification must use the encrypted metadata path');
assert.match(appSource, /search_documents_placeholder/, 'the document space must expose local search');
assert.match(appSource, /groupedDocuments/, 'documents must be grouped by their user-defined type');
assert.match(nativeVaultSource, /const age = profile\.age\.trim\(\)/, 'age must be normalized before the encrypted profile is stored');

assert.equal(sanitizeSenegalNationalNumber('77 123 45 67'), '771234567');
assert.equal(sanitizeSenegalNationalNumber('+221 77 123 45 67'), '771234567');
assert.equal(isValidSenegalNationalNumber('77 123 45 67'), true);
assert.equal(isValidSenegalNationalNumber('77 123 45 6'), false);
assert.equal(toSenegalE164('77 123 45 67'), '+221771234567');
assert.throws(() => toSenegalE164('77123456'));
assert.equal(shouldRelockAfterBackground(null, 1_000), false);
assert.equal(shouldRelockAfterBackground(1_000, 1_000 + PIN_RELOCK_AFTER_MS - 1), false);
assert.equal(shouldRelockAfterBackground(1_000, 1_000 + PIN_RELOCK_AFTER_MS), true);

const key = await generateKey();
const clear = new TextEncoder().encode('synthetic prescription');
const identity = { patientId: 'patient-demo', documentId: 'doc-demo', version: 1, keyId: 'key-demo' };
const envelope = await encryptDocument(clear, identity, key);
assert.deepEqual(await decryptDocument(envelope, identity, key), clear);
await assert.rejects(() => decryptDocument(envelope, { ...identity, documentId: 'other-doc' }, key));
const wrongKey = await generateKey();
await assert.rejects(() => decryptDocument(envelope, identity, wrongKey));
const altered = { ...envelope, ciphertext: `${envelope.ciphertext.slice(0, -2)}AA` };
await assert.rejects(() => decryptDocument(altered, identity, key));
await assert.rejects(() => decryptDocument({ ...envelope, envelopeVersion: 2 }, identity, key));
const secondEnvelope = await encryptDocument(clear, { ...identity, version: 2 }, await generateKey());
assert.notEqual(secondEnvelope.nonce, envelope.nonce);
assert.notEqual(secondEnvelope.ciphertext, envelope.ciphertext);
assert.equal(envelope.ciphertext.includes('synthetic'), false);

const locked = createLockedVault();
assert.throws(() => unlockVault(locked, false));
const unlocked = unlockVault(locked, true);
const queued = queueDocument(unlocked, { id: 'doc-demo', patientId: 'patient-demo', version: 1, kind: 'prescription', envelope, syncState: 'local', createdAt: '2026-07-17T00:00:00Z' });
assert.equal(queued.outbox[0].state, 'queued');
assert.equal(transitionSyncState('queued', 'syncing'), 'syncing');
assert.equal(transitionSyncState('syncing', 'failed'), 'failed');
assert.equal(transitionSyncState('failed', 'queued'), 'queued');
assert.throws(() => transitionSyncState('queued', 'synced'));

const approvedPreview = parseSmartImportRequest({
  requestId: '00000000-0000-4000-8000-000000000001', schemaVersion: 1,
  pseudonymizedText: 'Patient: [PATIENT]. Établissement: [ETABLISSEMENT]. Document synthétique.',
  locale: 'fr', allowedDocumentTypes: ['prescription', 'lab_result'],
});
assert.equal(approvedPreview.schemaVersion, 2);
assert.equal('allowedDocumentTypes' in approvedPreview, false);
assert.deepEqual(decideSmartImport({ state: 'preview', request: approvedPreview }, 'cancel', true), { state: 'cancelled' });
assert.equal(decideSmartImport({ state: 'preview', request: approvedPreview }, 'approve', false).state, 'queued');
assert.deepEqual(decideSmartImport({ state: 'preview', request: approvedPreview }, 'approve', true), { state: 'sending', request: approvedPreview });
assert.throws(() => parseSmartImportRequest({ ...approvedPreview, file: 'original.pdf' }));
assert.throws(() => parseSmartImportRequest({ ...approvedPreview, pseudonymizedText: '' }));
assert.throws(() => parseSmartImportResponse({
  documentType: 'prescription', suggestedTitle: 'Ordonnance', documentDate: '2026-07-01', facilityType: 'clinic',
  fields: [], warnings: [], confidence: 'medium', diagnostic: 'interdit',
}));
const dynamicType = parseSmartImportResponse({
  documentType: '  Compte rendu cardiologique  ', suggestedTitle: 'Compte rendu', documentDate: '2026-07-01', facilityType: 'clinic',
  fields: [], warnings: [], confidence: 'medium',
});
assert.equal(dynamicType.documentType, 'Compte rendu cardiologique');
assert.equal(dynamicType.analysisVersion, 2);
assert.equal(dynamicType.fields.length, 0);
const exhaustiveAnalysis = parseSmartImportResponse({
  analysisVersion: 2,
  documentType: 'Bilan biologique',
  suggestedTitle: 'Bilan biologique synthétique',
  summary: 'Bilan comprenant une mesure de glycémie.',
  documentDate: '',
  facilityName: '[ETABLISSEMENT]',
  facilityType: 'Laboratoire',
  fields: [{ section: 'Biochimie', label: 'Glycémie', value: '0,92 g/L (0,70–1,10 g/L)' }],
  warnings: [],
  confidence: 'high',
});
assert.equal(exhaustiveAnalysis.fields[0].value, '0,92 g/L (0,70–1,10 g/L)');
assert.equal(normalizeDocumentType('  Imagerie   médicale  '), 'Imagerie médicale');
assert.throws(() => normalizeDocumentType(''));
assert.throws(() => normalizeDocumentType('x'.repeat(61)));
assert.throws(() => parseSmartImportResponse({
  analysisVersion: 2, documentType: 'prescription', suggestedTitle: 'Ordonnance', summary: 'Je recommande de modifier le traitement.',
  documentDate: '2026-07-01', facilityName: '', facilityType: 'Clinique',
  fields: [{ section: 'Prescription existante', label: 'Médicament', value: 'Traitement déjà inscrit sur le document' }], warnings: [], confidence: 'medium',
}));
const extracted = extractAndPseudonymizeFixture('prescription');
assert.match(extracted, /\[PATIENT\]/);
assert.match(extracted, /\[ETABLISSEMENT\]/);
assert.doesNotMatch(extracted, /PATIENT DEMO|HORIZON FICTIVE/);
const simulated = simulateSmartImportLocally({ ...approvedPreview, pseudonymizedText: extracted });
assert.equal(simulated.documentType, 'Ordonnances');
assert.equal(simulated.fields.length, 5);
assert.equal(simulated.fields.find((field) => field.label === 'Contenu')?.value, 'exemple de médicament et posologie de démonstration.');
assert.match(simulated.warnings[0], /Simulation locale/);
assert.doesNotMatch(JSON.stringify(simulated), /PATIENT DEMO|HORIZON FICTIVE/);

const shareIntent = createPendingShareIntent(
  '00000000-0000-4000-8000-000000000010',
  '00000000-0000-4000-8000-000000000011',
  '2026-07-18T00:00:00Z',
);
assert.equal(shareIntent.state, 'pending_connection');
assert.doesNotMatch(JSON.stringify(shareIntent), /key|ciphertext|patient-demo|code/i);
assert.equal(transitionShareIntent('pending_connection', 'activating'), 'activating');
assert.equal(transitionShareIntent('activating', 'failed'), 'failed');
assert.equal(transitionShareIntent('failed', 'activating'), 'activating');
assert.throws(() => transitionShareIntent('pending_connection', 'failed'));
assert.throws(() => createPendingShareIntent('invalid', shareIntent.documentId, shareIntent.createdAt));
assert.deepEqual(classifyImport('document-libre.pdf', new TextEncoder().encode('%PDF-1.7')), {
  kind: 'document', mimeType: 'application/pdf', title: 'document-libre.pdf',
});
assert.equal(classifyImport('photo.png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])).mimeType, 'image/png');
assert.equal(classifyImport('notes.docx', new Uint8Array([1, 2, 3])).mimeType, 'application/octet-stream');
assert.equal(classifyImport('prescription-demo.pdf', new Uint8Array([1, 2, 3])).kind, 'document');
assert.deepEqual(decodeBase64('AAEC/w=='), new Uint8Array([0, 1, 2, 255]));
assert.throws(() => decodeBase64('not base64'));
assert.equal(isUnreadableVaultDatabaseError(new Error('Error code: file is not a database')), true);
assert.equal(isUnreadableVaultDatabaseError("NativeDatabase.prepareAsync rejected: NOTADB"), true);
assert.equal(isUnreadableVaultDatabaseError(new Error('prepare rejected', { cause: new Error('file is not a database') })), true);
assert.equal(isUnreadableVaultDatabaseError(new Error('disk is full')), false);
assert.equal(new VaultRecoveryRequiredError().message.includes('clé sécurisée'), true);
console.log('mobile demo smoke test passed');
