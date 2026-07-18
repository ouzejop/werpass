import assert from 'node:assert/strict';
import { decryptDocument, encryptDocument, generateKey } from '../../../packages/contracts/src/crypto.ts';
import { createLockedVault, queueDocument, transitionSyncState, unlockVault } from '../../../packages/contracts/src/vault.ts';
import { decideSmartImport, extractAndPseudonymizeFixture, parseSmartImportRequest, parseSmartImportResponse, simulateSmartImportLocally } from '../../../packages/contracts/src/smart-import.ts';

assert.equal(process.env.WERPASS_DEMO ?? 'true', 'true');

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
assert.deepEqual(decideSmartImport({ state: 'preview', request: approvedPreview }, 'cancel', true), { state: 'cancelled' });
assert.equal(decideSmartImport({ state: 'preview', request: approvedPreview }, 'approve', false).state, 'queued');
assert.deepEqual(decideSmartImport({ state: 'preview', request: approvedPreview }, 'approve', true), { state: 'sending', request: approvedPreview });
assert.throws(() => parseSmartImportRequest({ ...approvedPreview, file: 'original.pdf' }));
assert.throws(() => parseSmartImportRequest({ ...approvedPreview, pseudonymizedText: '' }));
assert.throws(() => parseSmartImportResponse({
  documentType: 'prescription', suggestedTitle: 'Ordonnance', documentDate: '2026-07-01', facilityType: 'clinic',
  fields: [], warnings: [], confidence: 'medium', diagnostic: 'interdit',
}));
assert.throws(() => parseSmartImportResponse({
  documentType: 'prescription', suggestedTitle: 'Ordonnance', documentDate: '2026-07-01', facilityType: 'clinic',
  fields: [{ label: 'Conseil', value: 'traitement recommandé' }], warnings: [], confidence: 'medium',
}));
const extracted = extractAndPseudonymizeFixture('prescription');
assert.match(extracted, /\[PATIENT\]/);
assert.match(extracted, /\[ETABLISSEMENT\]/);
assert.doesNotMatch(extracted, /PATIENT DEMO|HORIZON FICTIVE/);
const simulated = simulateSmartImportLocally({ ...approvedPreview, pseudonymizedText: extracted });
assert.equal(simulated.documentType, 'prescription');
assert.match(simulated.warnings[0], /Simulation locale/);
assert.doesNotMatch(JSON.stringify(simulated), /PATIENT DEMO|HORIZON FICTIVE/);
console.log('mobile demo smoke test passed');
