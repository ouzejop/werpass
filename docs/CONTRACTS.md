# Contrats MVP

Ces contrats précèdent l’implémentation. Les schémas Zod de \`packages/contracts\` devront les refléter sans ajouter de champs médicaux non nécessaires.

## États de synchronisation

\`\`\`text
local -> queued -> syncing -> synced
                    \-> failed -> queued
\`\`\`

Une transition non listée est invalide. \`failed\` conserve une erreur redigée et un compteur, jamais le payload.

## Version de document

Champs minimaux :

- \`id\`, \`documentId\`, \`patientId\`, \`version\` ;
- \`mimeType\`, \`sizeBytes\`, \`ciphertextHash\` ;
- \`storagePath\` après synchronisation ;
- \`wrappedFileKey\`, \`keyNonce\`, \`fileNonce\`, \`cryptoFormatVersion\` ;
- \`encryptedMetadata\`, \`metadataNonce\` ;
- \`createdAt\`, \`createdByDeviceId\`, \`syncStatus\`.

Le fichier clair et la clé claire ne font jamais partie du contrat serveur.

## Import intelligent

Requête autorisée :

\`\`\`json
{
  "requestId": "uuid",
  "schemaVersion": 1,
  "pseudonymizedText": "texte approuvé",
  "locale": "fr",
  "allowedDocumentTypes": ["prescription", "lab_result"]
}
\`\`\`

La requête ne possède volontairement aucun champ \`file\`, \`image\`, \`pdf\`, \`uri\`, nom, téléphone, adresse ou identifiant patient.

Réponse :

\`\`\`json
{
  "documentType": "prescription",
  "suggestedTitle": "Ordonnance",
  "documentDate": "2026-07-01",
  "facilityType": "clinic",
  "fields": [],
  "warnings": [],
  "confidence": "medium"
}
\`\`\`

Les enums sont fermés. La réponse ne contient aucun diagnostic, recommandation ou modification de prescription. Le patient doit confirmer avant enregistrement.

## Partage

États :

\`\`\`text
draft -> pending_connection -> pending_request -> pending_patient
pending_patient -> approved -> expired
pending_patient -> rejected
approved -> revoked
\`\`\`

Champs publics du QR/code : identifiant opaque de session et expiration. Les documents sélectionnés, clés et informations patient restent absents.

## Événements d’audit

\`share_created\`, \`access_requested\`, \`access_approved\`, \`access_rejected\`, \`document_viewed\`, \`share_revoked\`, \`share_expired\`, \`code_attempt_rejected\`.

Les événements sont ajoutés côté serveur pour les actions distantes et mis en file localement pour les actions hors ligne. Ils ne stockent aucun contenu médical.
