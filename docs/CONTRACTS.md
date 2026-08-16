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

## Import local

- taille autorisée : 1 à 5 000 000 octets ;
- PDF, JPEG et PNG conservent leur type reconnu ;
- tout autre fichier non vide est stocké comme `application/octet-stream` ;
- l’acceptation locale d’un fichier ne le rend pas automatiquement éligible à l’import intelligent.

## Import intelligent

Requête autorisée :

\`\`\`json
{
  "requestId": "uuid",
  "schemaVersion": 2,
  "pseudonymizedText": "texte approuvé",
  "locale": "fr"
}
\`\`\`

La requête ne possède volontairement aucun champ \`file\`, \`image\`, \`pdf\`, \`uri\`, nom, téléphone, adresse ou identifiant patient. L’Edge Function transmet uniquement ce contrat à Groq, jamais le blob chiffré ou déchiffré.

Réponse :

\`\`\`json
{
  "analysisVersion": 2,
  "documentType": "Compte rendu cardiologique",
  "suggestedTitle": "Compte rendu",
  "summary": "Compte rendu cardiologique synthétique.",
  "documentDate": "2026-07-01",
  "facilityName": "[ETABLISSEMENT]",
  "facilityType": "Clinique",
  "fields": [
    {
      "section": "Mesures",
      "label": "Fréquence cardiaque",
      "value": "72 bpm (référence 60–100 bpm)"
    }
  ],
  "warnings": [],
  "confidence": "medium"
}
\`\`\`

Le type de document est une chaîne descriptive libre de 1 à 60 caractères, pas un enum prédéfini. L’analyse version 2 ne se limite pas au type : elle contient un résumé factuel, l’établissement et jusqu’à 100 informations structurées par section, en conservant dans chaque valeur les unités, intervalles de référence, posologies, durées ou précisions explicitement présents. Une date, un nom ou un type d’établissement absent reste vide et ne doit jamais être inventé. La réponse ne contient aucun diagnostic, recommandation ou modification de prescription. Une prescription déjà inscrite peut être retranscrite comme un fait. Le patient peut modifier le type puis confirmer ou infirmer l’analyse complète avant son enregistrement chiffré.

Les requêtes version 1 déjà présentes dans l’outbox sont acceptées puis normalisées localement en version 2. Aucune taxonomie personnelle n’est ajoutée au payload Groq.

## Classement documentaire

- Le type est une métadonnée médicale sensible chiffrée dans l’enveloppe du document.
- Un document nouvellement importé commence sans catégorie et apparaît sous « Non classé ».
- L’utilisateur peut créer ou remplacer librement son type depuis la vue du document, y compris sans analyse IA.
- La recherche, les filtres et le regroupement utilisent uniquement les métadonnées déchiffrées en mémoire sur l’appareil.
- La liste des types créés par l’utilisateur n’est jamais envoyée à Groq.

## Profil patient

Le profil local contient le nom affiché, l’âge, le groupe sanguin et les maladies chroniques synthétiques. Le profil complet est chiffré sous une seule enveloppe avant SQLite et avant synchronisation ; aucun de ces champs n’est une colonne Supabase en clair.

## Partage

L’intention locale hors ligne possède sa propre machine d’état :

\`\`\`text
pending_connection -> activating -> supprimée après activation
activating -> failed -> activating
\`\`\`

La session serveur suit `pending -> requested -> approved -> accessed`, avec les branches `requested -> declined`, `approved -> revoked` et l’expiration de `pending`/`requested`. `requested` ne donne aucun accès : il attend la décision du patient. `approved` signifie que le patient a confirmé ; le portail demandeur récupère alors directement l’enveloppe chiffrée, une seule fois.

Champs publics du QR/code de partage : identifiant opaque de session uniquement. Le Hackathon MVP génère à la demande un code numérique de huit chiffres, valide cinq minutes ; les valeurs Base64 URL et UUID héritées restent acceptées jusqu’à expiration. Les documents sélectionnés, clés, numéro de téléphone et informations patient restent absents.

Actions de l’Edge Function :

- `create` : crée à la demande une session de cinq minutes pour un document synchronisé ;
- `request` : déclenchée par le médecin, enregistre son identité déclarée et sa clé publique Curve25519 éphémère, puis passe la session à `requested` ;
- `status` : permet au patient propriétaire de voir l’identité de la demande et de décider ;
- `approve` / `decline` : actions authentifiées du patient ; `approve` envoie uniquement la clé AES du document emballée pour le portail ;
- `portal_status` : permet au portail demandeur de détecter l’approbation sans lire les tables patient ; il exige aussi `portalRequestId` ;
- `access` : valide et consomme la demande, puis renvoie le ciphertext et l’enveloppe de clé éphémère ;
- `revoke` : bloque tout accès futur.

L’application n’affiche aucun QR sans action explicite du patient. À l’expiration, elle supprime le QR et le code ; le patient peut ensuite générer une nouvelle session. La révocation manuelle bloque immédiatement tout accès futur.

Le code clair n’apparaît dans aucune réponse de `create`, `request`, `status` ou `access`. Le portail reçoit le code oralement du patient.

Exception strictement illustrative : avec le secret serveur `DEMO_IN_APP_CODE_DISPLAY=true`, `status` peut renvoyer le code dérivé uniquement à l’application en mode démo. Cette voie est étiquetée prototype, ne concerne que les fixtures synthétiques et ne doit jamais être activée hors démo.

## Concepts d’authentification distincts

- OTP Supabase à six chiffres : vérification du numéro et création de session patient ;
- PIN local à quatre chiffres : verrouillage de l’application sur l’appareil ;
- identifiant de demande de portail : UUID privé du navigateur demandeur, jamais affiché dans le QR ni dans l’application.

## Événements d’audit

Le schéma autorise `requested`, `approved`, `declined`, `code_failed`, `accessed`, `revoked` et `expired`. Les événements de demande, décision, accès et révocation sont écrits côté serveur.

Les événements sont ajoutés côté serveur pour les actions distantes et mis en file localement pour les actions hors ligne. Ils ne stockent aucun contenu médical.
