export type ImportClassification = {
  kind: 'prescription' | 'lab-result' | 'document';
  mimeType: 'application/pdf' | 'image/jpeg' | 'image/png' | 'application/octet-stream';
  title: string;
};

export function classifyImport(name: string, bytes: Uint8Array): ImportClassification {
  const pdf = bytes.length >= 5 && new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-';
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (name === 'prescription-demo.pdf' && pdf) return { kind: 'prescription', mimeType: 'application/pdf', title: 'Ordonnance synthétique' };
  if (name === 'lab-result-demo.jpg' && jpeg) return { kind: 'lab-result', mimeType: 'image/jpeg', title: 'Résultat d’analyse synthétique' };
  const safeTitle = name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 80) || 'Document importé';
  return { kind: 'document', mimeType: pdf ? 'application/pdf' : jpeg ? 'image/jpeg' : png ? 'image/png' : 'application/octet-stream', title: safeTitle };
}
