import React from 'react';

interface SuccessViewProps {
  sessionId?: string;
  envelope?: Record<string, unknown>;
  document?: { objectUrl: string; mimeType: string };
  onReset: () => void;
}

export const SuccessView: React.FC<SuccessViewProps> = ({ sessionId, envelope, document, onReset }) => (
  <div className="glass-card">
    <div className="app-header">
      <div className="brand-badge" style={{ borderColor: 'rgba(16, 185, 129, 0.4)', background: 'rgba(16, 185, 129, 0.15)', color: '#a7f3d0' }}>
        <span className="brand-dot"></span>Accès autorisé
      </div>
      <h1>Document médical partagé</h1>
      <p className="subtitle">Le patient a confirmé. Le document a été déchiffré localement dans ce navigateur à l’aide de sa clé temporaire.</p>
    </div>

    {document?.mimeType.startsWith('image/') ? (
      <img src={document.objectUrl} alt="Document médical partagé" style={{ width: '100%', borderRadius: '12px', background: '#fff' }} />
    ) : document?.mimeType === 'application/pdf' ? (
      <iframe title="Document médical partagé" src={document.objectUrl} style={{ width: '100%', height: '520px', border: 0, borderRadius: '12px', background: '#fff' }} />
    ) : <div className="alert alert-info">Le document a été déchiffré, mais son type ne permet pas un aperçu dans le navigateur.</div>}

    <div className="form-group">
      <label>ID de session de partage</label>
      <input type="text" value={sessionId || ''} readOnly style={{ color: '#94a3b8', fontSize: '0.9rem' }} />
    </div>
    <details>
      <summary>Informations techniques chiffrées</summary>
      <pre className="json-viewer">{JSON.stringify(envelope, null, 2)}</pre>
    </details>
    <button className="btn-secondary" onClick={onReset}>🔒 Clôturer la consultation</button>
  </div>
);
