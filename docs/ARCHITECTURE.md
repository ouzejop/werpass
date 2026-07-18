# Architecture MVP

## Principe

WérPass suit une architecture local-first : le téléphone patient est la source prioritaire, le backend synchronise uniquement des objets déjà chiffrés et le portail professionnel ne reçoit que les versions explicitement autorisées.

## Composants

\`\`\`text
apps/mobile
  Application patient Expo : PIN, coffre, import, chronologie, consentement,
  synchronisation, partage et journal.

apps/clinician-web
  Portail React/Vite : compte de démonstration, saisie de code/scan QR,
  demande et consultation temporaire.

packages/contracts
  Seul package partagé initial : schémas Zod, enums et types réseau.

supabase
  Auth, PostgreSQL/RLS, Storage privé, migrations, tests SQL et Edge Functions.

fixtures/synthetic
  Une ordonnance et un résultat d’analyse, sans personne réelle.
\`\`\`

Ne pas créer de package \`crypto\`, \`domain\`, \`sync\` ou \`ui\` avant qu’au moins deux consommateurs réels justifient l’extraction.

## Flux principal

1. Importer un fichier dans une zone temporaire.
2. Générer une clé de fichier, chiffrer, vérifier le ciphertext puis supprimer la copie temporaire.
3. Enregistrer la version immuable et une opération d’outbox dans la base locale chiffrée.
4. Afficher immédiatement le document dans la chronologie locale.
5. Au retour du réseau, envoyer uniquement ciphertext, enveloppe de clé et métadonnées chiffrées.
6. Pour l’import intelligent, extraire et pseudonymiser localement, afficher le payload puis attendre le consentement.
7. Envoyer le texte approuvé à une Edge Function ; elle seule possède la clé OpenAI.
8. Pour le partage, créer une session limitée, obtenir l’approbation du patient et délivrer seulement les versions sélectionnées.

## Stockage local

- SQLCipher pour métadonnées, outbox, journal et enveloppes.
- Système de fichiers privé pour les blobs chiffrés.
- SecureStore/Keystore/Keychain pour le secret lié à l’appareil.
- Aucun secret dans AsyncStorage.
- Les fichiers temporaires en clair ont une durée de vie minimale et sont supprimés après chiffrement ou erreur.

## Modèle serveur minimal

| Table | Rôle |
|---|---|
| \`profiles\` | Profil minimal relié à \`auth.users\` |
| \`devices\` | Appareils autorisés et clé publique, si nécessaire au partage |
| \`documents\` | Identité logique appartenant à un patient |
| \`document_versions\` | Version immuable, chemin Storage, hash et enveloppe de clé |
| \`share_sessions\` | Portée, état, création et expiration |
| \`share_items\` | Versions autorisées dans une session |
| \`share_requests\` | Demande du professionnel et décision patient |
| \`medical_access_codes\` | Hash serveur, expiration, tentatives, consommation |
| \`access_events\` | Journal append-only créé côté serveur |
| \`sync_mutations\` | Idempotence et version attendue |

## Autorisation

- Toutes les tables exposées ont RLS activé.
- Le patient accède uniquement aux lignes dont il est propriétaire.
- Le professionnel ne lit jamais directement les tables patient.
- Les transitions de partage passent par des fonctions serveur validant portée, état et expiration.
- Le rôle client ne peut ni inventer ni modifier un événement d’audit.
- Le bucket Storage est privé ; ses objets sont également chiffrés par le client.

## Synchronisation

L’outbox locale contient un identifiant d’idempotence, le type d’opération, la cible, la version attendue, le nombre de tentatives et la prochaine date d’essai.

États UI : \`local\`, \`queued\`, \`syncing\`, \`synced\`, \`failed\`.

- Un document est immuable ; une modification du fichier crée une nouvelle version.
- Une modification de métadonnées incrémente sa version.
- Une ancienne version ne remplace jamais silencieusement une nouvelle.
- Un conflit bloque l’opération et reste visible ; aucun merge complexe n’est requis pour le MVP.

## Choix d’efficacité

- React/Vite pour le portail statique ; logique privilégiée dans Supabase.
- Deux fixtures et un seul scénario nominal.
- Pas de temps réel, push ou worker tant qu’un polling court suffit à la démo.
- Pas d’ORM partagé avant que les requêtes réelles soient connues.
- Pas d’E2E mobile lourd avant stabilité du parcours ; les invariants critiques sont testés plus bas dans la pyramide.
