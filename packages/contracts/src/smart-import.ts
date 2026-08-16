export const SMART_IMPORT_SCHEMA_VERSION = 2 as const;

export type SmartImportRequest = {
  requestId: string;
  schemaVersion: typeof SMART_IMPORT_SCHEMA_VERSION;
  pseudonymizedText: string;
  locale: 'fr';
};

export type SmartImportResponse = {
  analysisVersion: 2;
  documentType: string;
  suggestedTitle: string;
  summary: string;
  documentDate: string;
  facilityName: string;
  facilityType: string;
  fields: Array<{ section: string; label: string; value: string }>;
  warnings: string[];
  confidence: 'low' | 'medium' | 'high';
};

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]) =>
  Object.keys(value).length === expected.length && expected.every((key) => key in value);

export function normalizeDocumentType(value: unknown): string {
  if (typeof value !== 'string') throw new Error('Invalid document type');
  const normalized = value.replace(/[\u0000-\u001f\u007f]/g, '').trim().replace(/\s+/g, ' ');
  if (normalized.length < 1 || normalized.length > 60) throw new Error('Invalid document type');
  return normalized;
}

export function parseSmartImportRequest(value: unknown): SmartImportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid smart import request');
  const item = value as Record<string, unknown>;
  const currentKeys = ['requestId', 'schemaVersion', 'pseudonymizedText', 'locale'] as const;
  const legacyKeys = [...currentKeys, 'allowedDocumentTypes'] as const;
  const legacy = item.schemaVersion === 1;
  if (!(legacy ? exactKeys(item, legacyKeys) : exactKeys(item, currentKeys))
    || typeof item.requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(item.requestId)
    || (!legacy && item.schemaVersion !== SMART_IMPORT_SCHEMA_VERSION)
    || typeof item.pseudonymizedText !== 'string' || item.pseudonymizedText.length < 1 || item.pseudonymizedText.length > 8_000
    || item.locale !== 'fr'
    || (legacy && (!Array.isArray(item.allowedDocumentTypes)
      || item.allowedDocumentTypes.length !== 2
      || item.allowedDocumentTypes[0] !== 'prescription'
      || item.allowedDocumentTypes[1] !== 'lab_result'))) {
    throw new Error('Invalid smart import request');
  }
  return {
    requestId: item.requestId,
    schemaVersion: SMART_IMPORT_SCHEMA_VERSION,
    pseudonymizedText: item.pseudonymizedText,
    locale: 'fr',
  };
}

export function parseSmartImportResponse(value: unknown): SmartImportResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid smart import response');
  const item = value as Record<string, unknown>;
  const keys = ['analysisVersion', 'documentType', 'suggestedTitle', 'summary', 'documentDate', 'facilityName', 'facilityType', 'fields', 'warnings', 'confidence'] as const;
  const legacyKeys = ['documentType', 'suggestedTitle', 'documentDate', 'facilityType', 'fields', 'warnings', 'confidence'] as const;
  const legacy = exactKeys(item, legacyKeys);
  let documentType: string;
  try {
    documentType = normalizeDocumentType(item.documentType);
  } catch {
    throw new Error('Invalid smart import response');
  }
  const normalized = legacy ? {
    ...item,
    analysisVersion: 2,
    summary: 'Informations factuelles extraites du document.',
    facilityName: '',
    fields: Array.isArray(item.fields)
      ? item.fields.map((field) => ({ section: 'Informations', ...(field as Record<string, unknown>) }))
      : item.fields,
  } : item;
  if ((!legacy && !exactKeys(item, keys))
    || normalized.analysisVersion !== 2
    || typeof normalized.suggestedTitle !== 'string' || normalized.suggestedTitle.length < 1 || normalized.suggestedTitle.length > 80
    || typeof normalized.summary !== 'string' || normalized.summary.length < 1 || normalized.summary.length > 1_500
    || typeof normalized.documentDate !== 'string' || !/^(?:\d{4}-\d{2}-\d{2})?$/.test(normalized.documentDate)
    || typeof normalized.facilityName !== 'string' || normalized.facilityName.length > 120
    || typeof normalized.facilityType !== 'string' || normalized.facilityType.length > 80
    || !Array.isArray(normalized.fields) || normalized.fields.length > 100 || normalized.fields.some((field) => !field || typeof field !== 'object' || Array.isArray(field)
      || !exactKeys(field as Record<string, unknown>, ['section', 'label', 'value'])
      || typeof (field as Record<string, unknown>).section !== 'string'
      || typeof (field as Record<string, unknown>).label !== 'string'
      || typeof (field as Record<string, unknown>).value !== 'string'
      || ((field as Record<string, unknown>).section as string).length < 1
      || ((field as Record<string, unknown>).section as string).length > 80
      || ((field as Record<string, unknown>).label as string).length < 1
      || ((field as Record<string, unknown>).label as string).length > 120
      || ((field as Record<string, unknown>).value as string).length < 1
      || ((field as Record<string, unknown>).value as string).length > 500)
    || !Array.isArray(item.warnings) || item.warnings.length > 10 || item.warnings.some((warning) => typeof warning !== 'string' || warning.length > 300)
    || !['low', 'medium', 'high'].includes(item.confidence as string)) {
    throw new Error('Invalid smart import response');
  }
  const prohibited = /(?:je recommande|nous recommandons|vous devriez|l['’]ia recommande|il faut (?:commencer|arrêter|modifier)|dose que vous devriez)/i;
  if (prohibited.test(JSON.stringify(normalized))) throw new Error('Clinical advice is prohibited');
  return { ...normalized, documentType } as SmartImportResponse;
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

/** Repli local déterministe du prototype. Ce résultat ne provient jamais de Groq ni d’un autre fournisseur IA. */
export function simulateSmartImportLocally(input: unknown): SmartImportResponse {
  const request = parseSmartImportRequest(input);
  const text = request.pseudonymizedText;
  const lab = /(?:analyse|laboratoire|résultat)/i.test(text);
  const date = text.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ?? '2026-07-01';
  return parseSmartImportResponse({
    analysisVersion: 2,
    documentType: lab ? 'Résultats de laboratoire' : 'Ordonnances',
    suggestedTitle: lab ? 'Résultat d’analyse — synthétique' : 'Ordonnance — synthétique',
    summary: lab ? 'Résultat d’analyse synthétique avec une zone à vérifier.' : 'Ordonnance synthétique avec médicament et posologie de démonstration.',
    documentDate: date,
    facilityName: '[ETABLISSEMENT]',
    facilityType: lab ? 'Laboratoire' : 'Clinique',
    fields: text.split('\n').map((line) => {
      const separator = line.indexOf(':');
      return separator > 0
        ? { section: 'Contenu du document', label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() }
        : { section: 'Contenu du document', label: 'Information', value: line.trim() };
    }).filter((field) => field.value.length > 0),
    warnings: ['Simulation locale déterministe : résultat non généré par GPT.'],
    confidence: /illisible|ambigu/i.test(text) ? 'low' : 'medium',
  });
}
