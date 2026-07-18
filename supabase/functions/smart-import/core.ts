import { parseSmartImportRequest, parseSmartImportResponse, type SmartImportResponse } from '../../../packages/contracts/src/smart-import.ts';

export type SmartImportRuntime = { apiKey: string; model: string; fetch: typeof fetch };

export const smartImportJsonSchema = {
  type: 'object', additionalProperties: false,
  required: ['documentType', 'suggestedTitle', 'documentDate', 'facilityType', 'fields', 'warnings', 'confidence'],
  properties: {
    documentType: { type: 'string', enum: ['prescription', 'lab_result'] },
    suggestedTitle: { type: 'string', minLength: 1, maxLength: 80 },
    documentDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    facilityType: { type: 'string', enum: ['clinic', 'laboratory'] },
    fields: { type: 'array', maxItems: 20, items: {
      type: 'object', additionalProperties: false, required: ['label', 'value'],
      properties: { label: { type: 'string', maxLength: 80 }, value: { type: 'string', maxLength: 500 } },
    } },
    warnings: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 300 } },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
  },
} as const;

function outputText(response: unknown): string {
  if (!response || typeof response !== 'object') throw new Error('invalid_openai_response');
  const output = (response as { output?: unknown }).output;
  if (!Array.isArray(output)) throw new Error('invalid_openai_response');
  for (const item of output) {
    if (!item || typeof item !== 'object' || !Array.isArray((item as { content?: unknown }).content)) continue;
    for (const content of (item as { content: unknown[] }).content) {
      if (content && typeof content === 'object' && (content as { type?: unknown }).type === 'refusal') throw new Error('openai_refusal');
      if (content && typeof content === 'object' && (content as { type?: unknown }).type === 'output_text'
        && typeof (content as { text?: unknown }).text === 'string') return (content as { text: string }).text;
    }
  }
  throw new Error('missing_openai_output');
}

export async function runSmartImport(input: unknown, runtime: SmartImportRuntime): Promise<SmartImportResponse> {
  const request = parseSmartImportRequest(input);
  const response = await runtime.fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${runtime.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': request.requestId },
    body: JSON.stringify({
      model: runtime.model, store: false,
      input: [
        { role: 'system', content: 'Extrais uniquement des métadonnées factuelles du texte synthétique. Ne produis jamais de diagnostic, conseil, traitement ou modification de prescription. Signale toute ambiguïté dans warnings.' },
        { role: 'user', content: request.pseudonymizedText },
      ],
      text: { format: { type: 'json_schema', name: 'werpass_smart_import', strict: true, schema: smartImportJsonSchema } },
    }),
  });
  if (!response.ok) throw new Error(`openai_http_${response.status}`);
  return parseSmartImportResponse(JSON.parse(outputText(await response.json())));
}
