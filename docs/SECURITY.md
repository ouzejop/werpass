# Sécurité du MVP

Ce document distingue les garanties réelles, les éléments illustratifs et les risques volontairement différés. WérPass utilise uniquement des données synthétiques pendant le hackathon.

## Statut des décisions

| Décision | Statut |
|---|---|
| Coffre patient réellement utilisable hors ligne | Approuvé |
| Consultation locale temporaire réellement hors ligne | Approuvé |
| Partage distant hors ligne présenté comme intention en attente | Approuvé |
| Réduction agressive du périmètre non essentiel | Approuvé |
| Hiérarchie AES-256-GCM décrite dans l’ADR | Approuvée |
| Partage navigateur avec clés éphémères | Spike limité, puis décision go/no-go |
| Récupération et transfert d’appareil | Différé |

## Invariants

1. Le document original ne quitte jamais le téléphone vers OpenAI.
2. Aucun appel OpenAI ne précède l’aperçu et le consentement.
3. Supabase ne reçoit jamais une clé principale en clair.
4. Fichiers et métadonnées sensibles sont chiffrés avant persistance distante.
5. QR et codes ne contiennent ni document, ni clé, ni donnée personnelle lisible.
6. OTP, PIN et code médical sont trois concepts distincts.
7. Le code médical est temporaire, à usage unique et limité en tentatives.
8. La portée du partage est exactement la sélection approuvée.
9. Révocation et expiration empêchent les accès futurs.
10. Aucune clé ou donnée médicale n’apparaît dans les logs ou erreurs.

## Authentification

- OTP Supabase : authentifie le compte patient ; jamais communiqué au professionnel.
- PIN local : verrouille l’expérience et impose délai/compteur ; ce n’est pas seul un secret cryptographique suffisant.
- Code médical : autorise une session précise après validation serveur ; il ne remplace ni OTP ni PIN.
- Comptes professionnels : données et identité de démonstration clairement étiquetées.

## Chiffrement proposé

Voir [decisions/ADR-0001-crypto-mvp.md](decisions/ADR-0001-crypto-mvp.md).

- clé principale patient aléatoire de 32 octets ;
- clé aléatoire de 32 octets par version de document ;
- AES-256-GCM, nonce unique de 12 octets, tag de 16 octets ;
- AAD incluant version du format, patient, document et version ;
- clé de document enveloppée par la clé patient ;
- secret appareil protégé par SecureStore/Keystore/Keychain ;
- format d’enveloppe versionné.

## OpenAI

La Edge Function reçoit uniquement \`pseudonymizedText\` et un contexte non identifiant. Elle utilise GPT-5.6 avec Structured Output strict et \`store: false\`.

- Clé OpenAI uniquement côté serveur.
- Pas d’image, PDF, outil web, conversation persistante ou fichier OpenAI.
- Pas de diagnostic, traitement ou décision médicale dans le schéma.
- Logs : identifiant technique, durée, modèle, statut et usage ; jamais le texte.
- Données synthétiques uniquement, car \`store: false\` ne constitue pas à lui seul une garantie Zero Data Retention.

## Partage

Le QR contient seulement un identifiant opaque de session, une expiration, un nonce et une preuve d’intégrité si nécessaire. Le code à six chiffres est stocké sous forme de valeur protégée côté serveur avec un secret serveur, jamais en clair.

Le portail doit refuser :

- session inconnue, expirée, révoquée ou non approuvée ;
- code consommé ou nombre de tentatives dépassé ;
- version non incluse dans \`share_items\` ;
- accès direct aux tables patient.

Le partage à clés éphémères fera l’objet d’un spike court. S’il ne peut pas être validé sans primitive maison, la démo du portail restera limitée à des fixtures synthétiques et sera étiquetée prototype ; le coffre patient ne sera pas affaibli.

## Logs et secrets

- Aucun \`console.log\` de payload, token, URL signée, ciphertext complet ou clé.
- Redacter les erreurs réseau avant journalisation.
- Ne jamais mettre un secret dans une variable \`EXPO_PUBLIC_*\` ou \`VITE_*\`.
- Ajouter un scan de secrets avant soumission.

## Risques acceptés

- Appareil rooté/jailbreaké ou OS compromis non couvert.
- Une photo ou copie déjà réalisée par un professionnel ne peut pas être effacée.
- Révocation uniquement prospective.
- Comptes et OTP professionnels de démonstration.
- Pas de récupération, multi-appareil ou conformité production.
- OCR et pseudonymisation bornés aux fixtures, non généralisés à tous les documents médicaux.
