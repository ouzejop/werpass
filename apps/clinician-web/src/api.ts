const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || import.meta.env.EXPO_PUBLIC_SUPABASE_URL || 'https://rvpsnmegvjjopujgntqj.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_kMo78Sl-m5d-Of82Uw1dYA_SbZnt_2a';

export interface RequestAccessResult {
  requested?: boolean;
  state?: 'requested' | 'approved';
  confirmationRequired?: boolean;
  portalRequestId?: string;
  expiresAt?: string;
  error?: string;
}

export interface AccessResult {
  sessionId?: string;
  encryptedEnvelope?: Record<string, unknown>;
  keyEnvelope?: {
    algorithm: 'nacl-box-v1';
    patientEphemeralPublicKey: string;
    encryptedFileKey: string;
    nonce: string;
  };
  fileAad?: string;
  prototype?: boolean;
  error?: string;
}

export interface PortalStatusResult {
  state?: 'pending' | 'requested' | 'approved' | 'accessed' | 'declined' | 'revoked' | 'expired';
  approved?: boolean;
  expiresAt?: string;
  error?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  request_denied: "Session non trouvée, expirée, déjà utilisée ou liée à un autre navigateur. Le patient doit générer un code de partage valide depuis son application WérPass.",
  requester_identity_required: "Indiquez votre nom et votre établissement avant d’envoyer la demande au patient.",
  decision_denied: "Cette demande n’est plus ouverte à la décision du patient.",
  invalid_request: "Format de code de partage ou identifiant de demande invalide.",
  access_denied: "Accès indisponible : la demande doit être approuvée par le patient et ouverte depuis ce navigateur.",
  invalid_access: "Identifiant de demande invalide.",
};

async function callShareDemo<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/share-demo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify(body),
    });
    const data = await response.json() as T & { error?: string };
    if (!response.ok) {
      const error = data.error || '';
      return { error: ERROR_MESSAGES[error] || `Erreur serveur (${response.status}) : ${error || 'demande refusée'}` } as T & { error: string };
    }
    return data;
  } catch (error) {
    return { error: (error as Error).message || 'Erreur de connexion serveur Supabase.' } as T & { error: string };
  }
}

export function requestMedicalAccess(opaqueToken: string, requesterName: string, requesterFacility: string, portalPublicKey: string): Promise<RequestAccessResult> {
  return callShareDemo<RequestAccessResult>({ action: 'request', opaqueToken, requesterName, requesterFacility, portalPublicKey });
}

export function checkMedicalAccessStatus(opaqueToken: string, portalRequestId: string): Promise<PortalStatusResult> {
  return callShareDemo<PortalStatusResult>({ action: 'portal_status', opaqueToken, portalRequestId });
}

export function retrieveApprovedAccess(opaqueToken: string, portalRequestId: string): Promise<AccessResult> {
  return callShareDemo<AccessResult>({ action: 'access', opaqueToken, portalRequestId });
}
