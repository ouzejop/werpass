import assert from 'node:assert/strict';
import { runSmartImport } from './core.ts';

const approved = { requestId: '00000000-0000-4000-8000-000000000001', schemaVersion: 2,
  pseudonymizedText: 'Patient: [PATIENT]. Établissement: [ETABLISSEMENT]. Document synthétique.',
  locale: 'fr' };
let sentBody;
let sentHeaders;
let sentUrl;
const result = await runSmartImport(approved, { apiKey: 'test-only-not-a-secret', model: 'openai/gpt-oss-120b',
  fetch: async (url, init) => {
    sentUrl = url;
    sentBody = JSON.parse(init.body); sentHeaders = init.headers;
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      analysisVersion: 2,
      documentType: 'Compte rendu cardiologique', suggestedTitle: 'Compte rendu', documentDate: '2026-07-01',
      summary: 'Compte rendu cardiologique synthétique.', facilityName: '[ETABLISSEMENT]', facilityType: 'Clinique',
      fields: [{ section: 'Mesures', label: 'Fréquence', value: '72 bpm (référence 60–100 bpm)' }], warnings: [], confidence: 'medium',
    }) } }] }), { status: 200 });
  } });
assert.equal(sentUrl, 'https://api.groq.com/openai/v1/chat/completions');
assert.equal(sentBody.model, 'openai/gpt-oss-120b');
assert.equal(sentBody.messages[1].content, approved.pseudonymizedText);
assert.equal(sentBody.response_format.type, 'json_schema');
assert.equal(sentBody.response_format.json_schema.strict, true);
assert.equal(sentBody.response_format.json_schema.schema.properties.fields.maxItems, 100);
assert.match(sentBody.messages[0].content, /toutes les informations factuelles/i);
assert.match(sentBody.messages[0].content, /unités, intervalles de référence/i);
assert.equal(sentHeaders['X-Client-Request-Id'], approved.requestId);
assert.equal(result.documentType, 'Compte rendu cardiologique');
assert.equal(result.fields[0].section, 'Mesures');
await assert.rejects(() => runSmartImport({ ...approved, file: 'original.pdf' }, { apiKey: 'x', model: 'openai/gpt-oss-120b', fetch }));
await assert.rejects(() => runSmartImport(approved, { apiKey: 'x', model: 'openai/gpt-oss-120b', fetch: async () =>
  new Response(JSON.stringify({ choices: [{ message: { content: '{"diagnostic":"interdit"}' } }] }), { status: 200 }) }));
await assert.rejects(() => runSmartImport(approved, { apiKey: 'x', model: 'openai/gpt-oss-120b', fetch: async () =>
  new Response(JSON.stringify({ choices: [{ message: { refusal: 'cannot comply', content: '' } }] }), { status: 200 }) }));
