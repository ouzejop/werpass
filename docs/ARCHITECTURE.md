# Architecture MVP

## Principe

WérPass suit une architecture local-first : le téléphone patient est la source prioritaire, le backend synchronise uniquement des objets déjà chiffrés et le portail professionnel ne reçoit que les versions explicitement autorisées.

## Composants

\`\`\`text
apps/mobile
  Application patient Expo : inscription téléphone/OTP, PIN à quatre chiffres,
  coffre, accueil QR, import, documents, consentement et synchronisation.

apps/clinician-web
  Portail statique de démonstration : identité déclarée, demande, attente de la
  confirmation patient, saisie du code et affichage du paquet chiffré autorisé.

packages/contracts
  Seul package partagé initial : schémas Zod, enums et types réseau.

supabase
  Auth, PostgreSQL/RLS, Storage privé, migrations, tests SQL et Edge Functions.

fixtures/synthetic
  Une ordonnance et un résultat d’analyse, sans personne réelle.
\`\`\`

Ne pas créer de package \`crypto\`, \`domain\`, \`sync\` ou \`ui\` avant qu’au moins deux consommateurs réels justifient l’extraction.

## Flux principal

1. Vérifier le numéro patient par OTP Supabase, puis créer le PIN local de quatre chiffres.
2. Importer un fichier non vide de 5 Mo maximum dans une zone temporaire.
3. Générer une clé de fichier, chiffrer, vérifier le ciphertext puis supprimer la copie temporaire.
4. Enregistrer la version immuable et une opération d’outbox dans la base locale chiffrée.
5. Afficher immédiatement le document dans la page Documents et le QR/intention sur l’accueil.
6. Au retour du réseau, envoyer uniquement ciphertext, enveloppe de clé et métadonnées chiffrées.
7. Classer localement les documents avec un type libre, chiffré avec les autres métadonnées ; rechercher, filtrer et regrouper uniquement après déchiffrement en mémoire.
8. Pour l’import intelligent des deux fixtures, extraire et pseudonymiser localement, afficher le payload puis attendre le consentement.
9. Envoyer le texte approuvé à une Edge Function ; elle seule possède la clé Groq et retourne un type libre, un résumé factuel, l’établissement et toutes les informations explicites structurées par section. Le patient peut modifier le type puis confirmer ou infirmer l’analyse complète.
9. Pour le partage, activer une session de dix minutes pour un document synchronisé.
10. Le médecin déclare son identité ; la session passe à `requested` sans accès.
11. Le patient confirme ou refuse ; seulement après confirmation, le serveur génère le code et envoie le SMS.
12. Le portail consomme le code une fois et reçoit uniquement l’enveloppe sélectionnée.

## Stockage local

- SQLite standard derrière `VaultDatabase` pour métadonnées techniques, outbox, journal et enveloppes déjà chiffrées.
- Système de fichiers privé pour les blobs chiffrés.
- SecureStore/Keystore/Keychain pour le secret lié à l’appareil.
- Aucun secret dans AsyncStorage.
- Les fichiers temporaires en clair ont une durée de vie minimale et sont supprimés après chiffrement ou erreur.

## Modèle serveur minimal

| Table | Rôle |
|---|---|
| \`profiles\` | Profil minimal relié à \`auth.users\` |
| \`documents\` | Identité logique appartenant à un patient |
| \`document_versions\` | Version immuable, ciphertext, hash et enveloppe de clé |
| \`share_sessions\` | Portée, état, création et expiration |
| \`share_items\` | Versions autorisées dans une session |
| \`medical_access_codes\` | HMAC serveur, expiration, tentatives, consommation |
| \`access_events\` | Journal append-only créé côté serveur |
| \`sync_mutations\` | Idempotence et version attendue |

## Autorisation

- Toutes les tables exposées ont RLS activé.
- Le patient accède uniquement aux lignes dont il est propriétaire.
- Le professionnel ne lit jamais directement les tables patient.
- Les transitions de partage passent par des fonctions serveur validant portée, état et expiration.
- Le rôle client ne peut ni inventer ni modifier un événement d’audit.
- La verticale actuelle persiste le ciphertext dans `document_versions` ; aucun original ni clé claire n’est stocké côté serveur. `SQLCipherVaultDatabase` reste une évolution future derrière la même abstraction.

## Synchronisation

L’outbox locale contient un identifiant d’idempotence, le type d’opération, la cible, la version attendue, le nombre de tentatives et la prochaine date d’essai.

États UI : \`local\`, \`queued\`, \`syncing\`, \`synced\`, \`failed\`.

- Un document est immuable ; une modification du fichier crée une nouvelle version.
- Une modification de métadonnées incrémente sa version.
- Une ancienne version ne remplace jamais silencieusement une nouvelle.
- Un conflit bloque l’opération et reste visible ; aucun merge complexe n’est requis pour le MVP.

## Choix d’efficacité

- React/Vite pour le portail statique ; logique privilégiée dans Supabase.
- Deux fixtures pour GPT‑OSS et un seul scénario nominal ; l’import local général reste disponible.
- Pas de temps réel, push ou worker tant qu’un polling court suffit à la démo.
- Pas d’ORM partagé avant que les requêtes réelles soient connues.
- Pas d’E2E mobile lourd avant stabilité du parcours ; les invariants critiques sont testés plus bas dans la pyramide.
