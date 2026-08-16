import React, { useEffect, useState } from 'react';
import { InputScreen } from './components/InputScreen';
import { SuccessView } from './components/SuccessView';
import { checkMedicalAccessStatus, requestMedicalAccess, retrieveApprovedAccess } from './api';
import { createPortalKeyPair, decryptSharedDocument } from './shareKeyEnvelope';

type Step = 'PATIENT_CODE' | 'WAITING_PATIENT' | 'SUCCESS';

export const App: React.FC = () => {
  const [step, setStep] = useState<Step>('PATIENT_CODE');
  const [patientCode, setPatientCode] = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [requesterFacility, setRequesterFacility] = useState('');
  const [portalRequestId, setPortalRequestId] = useState<string | null>(null);
  const [portalSecretKey, setPortalSecretKey] = useState<Uint8Array | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSessionId, setResultSessionId] = useState<string | undefined>();
  const [resultEnvelope, setResultEnvelope] = useState<Record<string, unknown> | undefined>();
  const [resultDocument, setResultDocument] = useState<{ objectUrl: string; mimeType: string } | undefined>();

  const retrieveAccess = async (requestId: string) => {
    if (!portalSecretKey) return setError('La clé temporaire de ce navigateur a été perdue. Relancez la demande.');
    setLoading(true);
    const res = await retrieveApprovedAccess(patientCode.trim().replace(/\s/g, ''), requestId);
    if (res.error || !res.encryptedEnvelope || !res.keyEnvelope || !res.fileAad) {
      setLoading(false);
      return setError(res.error || 'Enveloppe chiffrée incomplète.');
    }
    try {
      const document = await decryptSharedDocument(res.encryptedEnvelope, res.keyEnvelope, portalSecretKey, res.fileAad);
      setResultSessionId(res.sessionId);
      setResultEnvelope(res.encryptedEnvelope);
      setResultDocument(document);
      setStep('SUCCESS');
    } catch {
      setError('Impossible de déchiffrer le document partagé.');
    } finally {
      setLoading(false);
    }
  };

  const refreshPatientDecision = async () => {
    if (!portalRequestId) return;
    const res = await checkMedicalAccessStatus(patientCode.trim().replace(/\s/g, ''), portalRequestId);
    if (res.error) return setError(res.error);
    if (res.state === 'approved') return retrieveAccess(portalRequestId);
    if (res.state === 'declined' || res.state === 'revoked' || res.state === 'expired' || res.state === 'accessed') {
      setError('La demande a été refusée, révoquée, expirée ou déjà utilisée.');
      setStep('PATIENT_CODE');
      setPortalRequestId(null);
    }
  };

  useEffect(() => {
    if (step !== 'WAITING_PATIENT') return;
    const timer = window.setInterval(() => void refreshPatientDecision(), 3000);
    return () => window.clearInterval(timer);
  }, [step, patientCode, portalRequestId]);

  const handleRequestAccess = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!patientCode.trim()) return;
    setLoading(true);
    setError(null);
    const portalKeys = createPortalKeyPair();
    const res = await requestMedicalAccess(patientCode.trim().replace(/\s/g, ''), requesterName.trim(), requesterFacility.trim(), portalKeys.publicKey);
    setLoading(false);
    if (res.error) return setError(res.error);
    if (!res.portalRequestId) return setError('La demande n’a pas reçu d’identifiant de portail. Réessayez.');
    setPortalRequestId(res.portalRequestId);
    setPortalSecretKey(portalKeys.secretKey);
    setStep('WAITING_PATIENT');
  };

  const handleReset = () => {
    setStep('PATIENT_CODE');
    setPatientCode('');
    setRequesterName('');
    setRequesterFacility('');
    setPortalRequestId(null);
    setPortalSecretKey(null);
    setError(null);
    setResultSessionId(undefined);
    setResultEnvelope(undefined);
    if (resultDocument) URL.revokeObjectURL(resultDocument.objectUrl);
    setResultDocument(undefined);
  };

  return step === 'SUCCESS' ? (
    <SuccessView sessionId={resultSessionId} envelope={resultEnvelope} document={resultDocument} onReset={handleReset} />
  ) : (
    <InputScreen
      step={step}
      patientCode={patientCode}
      requesterName={requesterName}
      requesterFacility={requesterFacility}
      loading={loading}
      error={error}
      onPatientCodeChange={setPatientCode}
      onRequesterNameChange={setRequesterName}
      onRequesterFacilityChange={setRequesterFacility}
      onRequestAccess={handleRequestAccess}
      onCheckStatus={() => void refreshPatientDecision()}
      onBack={handleReset}
    />
  );
};

export default App;
