export const SMART_IMPORT_SCHEMA_VERSION = 1 as const;

export type SmartImportRequest = {
  requestId: string;
  schemaVersion: typeof SMART_IMPORT_SCHEMA_VERSION;
  pseudonymizedText: string;
  locale: 'fr';
  allowedDocumentTypes: readonly ['prescription', 'lab_result'];
};

export type SmartImportResponse = {
  documentType: 'prescription' | 'lab_result';
  suggestedTitle: string;
  documentDate: string;
  facilityType: 'clinic' | 'laboratory';
  fields: Array<{ label: string; value: string }>;
  warnings: string[];
  confidence: 'low' | 'medium' | 'high';
};

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => key in value);

export function parseSmartImportRequest(value: unknown): SmartImportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid smart import request');
  const item = value as Record<string, unknown>;
  const keys = ['requestId', 'schemaVersion', 'pseudonymizedText', 'locale', 'allowedDocumentTypes'] as const;
  if (!exactKeys(item, keys)
    || typeof item.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)
    || item.schemaVersion !== SMART_IMPORT_SCHEMA_VERSION
    || typeof item.pseudonymizedText !== 'string' || item.pseudonymizedText.length < 1 || item.pseudonymizedText.length > 8_000
    || item.locale !== 'fr'
    || !Array.isArray(item.allowedDocumentTypes)
    || item.allowedDocumentTypes.length !== 2
    || item.allowedDocumentTypes[0] !== 'prescription'
    || item.allowedDocumentTypes[1] !== 'lab_result') {
    throw new Error('Invalid smart import request');
  }
  return item as SmartImportRequest;
}

export function parseSmartImportResponse(value: unknown): SmartImportResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid smart import response');
  const item = value as Record<string, unknown>;
  const keys = ['documentType', 'suggestedTitle', 'documentDate', 'facilityType', 'fields', 'warnings', 'confidence'] as const;
  if (!exactKeys(item, keys)
    || !['prescription', 'lab_result'].includes(item.documentType as string)
    || typeof item.suggestedTitle !== 'string' || item.suggestedTitle.length < 1 || item.suggestedTitle.length > 80
    || typeof item.documentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(item.documentDate)
    || !['clinic', 'laboratory'].includes(item.facilityType as string)
    || !Array.isArray(item.fields) || item.fields.length > 20 || item.fields.some((field) => !field || typeof field !== 'object' || Array.isArray(field)
      || !exactKeys(field as Record<string, unknown>, ['label', 'value'])
      || typeof (field as Record<string, unknown>).label !== 'string'
      || typeof (field as Record<string, unknown>).value !== 'string'
      || ((field as Record<string, unknown>).label as string).length > 80
      || ((field as Record<string, unknown>).value as string).length > 500)
    || !Array.isArray(item.warnings) || item.warnings.length > 10 || item.warnings.some((warning) => typeof warning !== 'string' || warning.length > 300)
    || !['low', 'medium', 'high'].includes(item.confidence as string)) {
    throw new Error('Invalid smart import response');
  }
  const prohibited = /\b(diagnostic|traitement|prescri(?:re|ption recommandée)|dose recommandée)\b/i;
  if (prohibited.test(JSON.stringify(item))) throw new Error('Clinical advice is prohibited');
  return item as SmartImportResponse;
}

export type SmartImportConsent =
  | { state: 'preview'; request: SmartImportRequest }
  | { state: 'cancelled' }
  | { state: 'queued'; request: SmartImportRequest }
  | { state: 'sending'; request: SmartImportRequest };

export function decideSmartImport(preview: SmartImportConsent, decision: 'cancel' | 'approve', online: boolean): SmartImportConsent {
  if (preview.state !== 'preview') throw new Error('Consent decision is no longer available');
  if (decision === 'cancel') return { state: 'cancelled' };
  return online ? { state: 'sending', request: preview.request } : { state: 'queued', request: preview.request };
}

const fixtureText = {
  prescription: 'Patient: PATIENT DEMO 001\nÉtablissement: CLINIQUE HORIZON FICTIVE\nDate: 2026-07-01\nDocument: ordonnance synthétique\nContenu: exemple de médicament et posologie de démonstration.',
  'lab-result': 'Patient: PATIENT DEMO 002\nÉtablissement: LABORATOIRE HORIZON FICTIF\nDate: 2026-07-02\nDocument: résultat d’analyse synthétique\nContenu: valeurs de démonstration; une zone est illisible.',
} as const;

/** Extraction volontairement bornée aux deux fixtures synthétiques du jury. */
export function extractAndPseudonymizeFixture(kind: keyof typeof fixtureText): string {
  return fixtureText[kind]
    .replace(/PATIENT DEMO 00[12]/g, '[PATIENT]')
    .replace(/(?:CLINIQUE|LABORATOIRE) HORIZON FICTI(?:VE|F)/g, '[ETABLISSEMENT]');
}

/** Repli local déterministe du prototype. Ce résultat ne provient jamais d’OpenAI. */
export function simulateSmartImportLocally(input: unknown): SmartImportResponse {
  const request = parseSmartImportRequest(input);
  const text = request.pseudonymizedText;
  const lab = /(?:analyse|laboratoire|résultat)/i.test(text);
  const date = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? '2026-07-01';
  return parseSmartImportResponse({
    documentType: lab ? 'lab_result' : 'prescription',
    suggestedTitle: lab ? 'Résultat d’analyse — synthétique' : 'Ordonnance — synthétique',
    documentDate: date,
    facilityType: lab ? 'laboratory' : 'clinic',
    fields: [
      { label: 'Patient', value: '[PATIENT]' },
      { label: 'Établissement', value: '[ETABLISSEMENT]' },
      { label: 'Qualité', value: /illisible|ambigu/i.test(text) ? 'Vérification manuelle requise' : 'Fixture reconnue' },
    ],
    warnings: ['Simulation locale déterministe : résultat non généré par GPT.'],
    confidence: /illisible|ambigu/i.test(text) ? 'low' : 'medium',
  });
}
