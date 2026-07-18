import assert from 'node:assert/strict';
import { runSmartImport } from './core.ts';

const approved = { requestId: '00000000-0000-4000-8000-000000000001', schemaVersion: 1,
  pseudonymizedText: 'Patient: [PATIENT]. Établissement: [ETABLISSEMENT]. Document synthétique.',
  locale: 'fr', allowedDocumentTypes: ['prescription', 'lab_result'] };
let sentBody;
let sentHeaders;
const result = await runSmartImport(approved, { apiKey: 'test-only-not-a-secret', model: 'gpt-5.6',
  fetch: async (_url, init) => {
    sentBody = JSON.parse(init.body); sentHeaders = init.headers;
    return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({
      documentType: 'prescription', suggestedTitle: 'Ordonnance', documentDate: '2026-07-01',
      facilityType: 'clinic', fields: [], warnings: [], confidence: 'medium',
    }) }] }] }), { status: 200 });
  } });
assert.equal(sentBody.store, false);
assert.equal(sentBody.input[1].content, approved.pseudonymizedText);
assert.equal(sentHeaders['Idempotency-Key'], approved.requestId);
assert.equal(result.documentType, 'prescription');
await assert.rejects(() => runSmartImport({ ...approved, file: 'original.pdf' }, { apiKey: 'x', model: 'gpt-5.6', fetch }));
await assert.rejects(() => runSmartImport(approved, { apiKey: 'x', model: 'gpt-5.6', fetch: async () =>
  new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: '{"diagnostic":"interdit"}' }] }] }), { status: 200 }) }));
await assert.rejects(() => runSmartImport(approved, { apiKey: 'x', model: 'gpt-5.6', fetch: async () =>
  new Response(JSON.stringify({ output: [{ content: [{ type: 'refusal', refusal: 'cannot comply' }] }] }), { status: 200 }) }));
