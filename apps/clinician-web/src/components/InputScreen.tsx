import React from 'react';

interface InputScreenProps {
  step: 'PATIENT_CODE' | 'WAITING_PATIENT';
  patientCode: string;
  requesterName: string;
  requesterFacility: string;
  loading: boolean;
  error: string | null;
  onPatientCodeChange: (value: string) => void;
  onRequesterNameChange: (value: string) => void;
  onRequesterFacilityChange: (value: string) => void;
  onRequestAccess: (event: React.FormEvent) => void;
  onCheckStatus: () => void;
  onBack: () => void;
}

export const InputScreen: React.FC<InputScreenProps> = ({
  step, patientCode, requesterName, requesterFacility, loading, error,
  onPatientCodeChange, onRequesterNameChange, onRequesterFacilityChange,
  onRequestAccess, onCheckStatus, onBack,
}) => (
  <div className="glass-card">
    <div className="app-header">
      <div className="brand-badge"><span className="brand-dot"></span>WérPass Santé</div>
      <h1>Portail Praticien</h1>
      <p className="subtitle">{step === 'PATIENT_CODE'
        ? 'Scannez le QR ou saisissez le code temporaire à huit chiffres du patient.'
        : 'La demande est envoyée. L’accès s’ouvrira automatiquement après confirmation.'}</p>
    </div>
    {error && <div className="alert alert-error"><span>⚠️</span><span>{error}</span></div>}
    {step === 'PATIENT_CODE' ? (
      <form onSubmit={onRequestAccess}>
        <div className="form-group">
          <label htmlFor="patient-code">Code de partage (8 chiffres)</label>
          <input id="patient-code" inputMode="numeric" type="text" maxLength={8} placeholder="ex : 12345678" value={patientCode} onChange={(event) => onPatientCodeChange(event.target.value.replace(/\D/g, ''))} disabled={loading} autoFocus required />
        </div>
        <div className="form-group">
          <label htmlFor="requester-name">Votre nom</label>
          <input id="requester-name" type="text" placeholder="ex: Dr. Awa Diop" value={requesterName} onChange={(event) => onRequesterNameChange(event.target.value)} disabled={loading} required />
        </div>
        <div className="form-group">
          <label htmlFor="requester-facility">Établissement</label>
          <input id="requester-facility" type="text" placeholder="ex: Clinique Horizon" value={requesterFacility} onChange={(event) => onRequesterFacilityChange(event.target.value)} disabled={loading} required />
        </div>
        <div className="alert alert-info" style={{ fontSize: '0.82rem', marginBottom: '1.2rem' }}>
          💡 Le patient voit votre demande. Après son accord, ce portail s’ouvre directement : aucun code médical supplémentaire.
        </div>
        <button type="submit" className="btn-primary" disabled={loading || !patientCode.trim() || !requesterName.trim() || !requesterFacility.trim()}>
          {loading ? <span className="spinner"></span> : 'Demander l’accès'}
        </button>
      </form>
    ) : (
      <>
        <div className="alert alert-info">⏳ Demande envoyée au patient. Gardez cette page ouverte : son accord ouvrira l’accès automatiquement.</div>
        <button type="button" className="btn-primary" onClick={onCheckStatus} disabled={loading}>
          {loading ? <span className="spinner"></span> : 'Vérifier la confirmation'}
        </button>
        <button type="button" className="btn-secondary" onClick={onBack} disabled={loading}>← Annuler</button>
      </>
    )}
  </div>
);
