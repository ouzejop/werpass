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
| SQLite standard pour le Hackathon MVP, données médicales chiffrées avant persistance | Approuvée avec limites |
| Partage navigateur avec clés éphémères | Approuvé avec limites Hackathon MVP |
| Récupération et transfert d’appareil | Différé |
| Récupération d’une base locale incompatible | Suppression locale explicite uniquement |

## Invariants

1. Le document original ne quitte jamais le téléphone vers Groq ni vers aucun fournisseur IA.
2. Aucun appel IA ne précède l’aperçu et le consentement.
3. Supabase ne reçoit jamais une clé principale en clair.
4. Fichiers et métadonnées sensibles sont chiffrés avant persistance distante.
5. QR et codes ne contiennent ni document, ni clé, ni donnée personnelle lisible.
6. OTP et PIN sont deux concepts distincts ; aucun code médical n’est requis pour le partage Hackathon MVP.
7. L’accès portail est lié à une demande UUID privée du navigateur, est temporaire et à usage unique.
8. La portée du partage est exactement la sélection approuvée.
9. Révocation et expiration empêchent les accès futurs.
10. Aucune clé ou donnée médicale n’apparaît dans les logs ou erreurs.
11. Les types de documents, l’âge et les maladies chroniques restent dans des enveloppes chiffrées ; la recherche ne crée aucun index médical en clair.

## Authentification

- OTP Supabase reçu à l’inscription : vérifie le numéro et authentifie le compte patient ; jamais communiqué au professionnel.
- PIN local à quatre chiffres : verrouille l’expérience et impose délai/compteur ; après un passage en arrière-plan, il est redemandé au retour après une minute. Ce n’est pas seul un secret cryptographique suffisant.
- Identifiant de demande portail : lie une session précise au navigateur qui l’a demandée ; il ne remplace ni OTP ni PIN et n’est jamais affiché au patient.
- Comptes professionnels : données et identité de démonstration clairement étiquetées.
- Numéro de téléphone : numéro de test contrôlé, conservé dans Supabase Auth ; absent des QR, contrats de document, logs applicatifs et variables publiques.

Un seul SMS est requis par le MVP : Supabase Auth envoie l’OTP d’inscription au patient. Le partage ne dépend pas de SMS.

Les secrets du second canal restent dans les secrets Edge Function. Configurer Twilio dans Supabase Auth ne configure pas automatiquement `share-demo`, et inversement.

## Chiffrement proposé

Voir [decisions/ADR-0001-crypto-mvp.md](decisions/ADR-0001-crypto-mvp.md).

- clé principale patient aléatoire de 32 octets ;
- clé aléatoire de 32 octets par version de document ;
- AES-256-GCM, nonce unique de 12 octets, tag de 16 octets ;
- AAD incluant version du format, patient, document et version ;
- clé de document enveloppée par la clé patient ;
- secret appareil protégé par SecureStore/Keystore/Keychain ;
- format d’enveloppe versionné.

Le Hackathon MVP utilise SQLite standard : la base elle-même n’est pas chiffrée. Les fichiers et métadonnées sensibles sont chiffrés avec AES-256-GCM avant SQLite. Si une base locale est illisible ou incompatible, l’application échoue fermé et propose une suppression locale irréversible après confirmation ; elle ne tente pas de récupérer une clé inconnue.

## Groq / GPT‑OSS

La Edge Function reçoit uniquement \`pseudonymizedText\` et un contexte non identifiant. Elle utilise \`openai/gpt-oss-120b\` sur Groq avec Structured Outputs stricts.

- Clé Groq uniquement côté serveur.
- Pas d’image, PDF, outil web, conversation persistante ou fichier fournisseur.
- Le bouton « Analyse IA » affiche d’abord un avertissement bloquant. Le fichier du coffre reste intact, non anonymisé et chiffré ; seule une copie textuelle pseudonymisée localement, affichée et modifiable, peut être confirmée pour envoi.
- Pas de diagnostic, traitement ou décision médicale dans le schéma.
- Le modèle propose une catégorie libre et extrait exhaustivement les faits présents dans le seul texte pseudonymisé approuvé : résumé, établissement et champs structurés par section. La taxonomie personnelle du patient ne lui est pas envoyée et aucune information absente ne doit être inventée.
- Le résultat IA en attente est chiffré localement avec la clé du document et un AAD lié au document et à la requête ; après confirmation ou infirmation, il rejoint les métadonnées chiffrées du document.
- Logs : identifiant technique, durée, modèle, statut et usage ; jamais le texte.
- Données synthétiques uniquement. Le compte Groq doit activer Zero Data Retention avant toute réévaluation du périmètre ; les données médicales réelles restent hors périmètre même avec ZDR.

## Partage

Le patient génère explicitement un QR et un code numérique de huit chiffres ; ils contiennent seulement un identifiant opaque de session et disparaissent après cinq minutes s’ils ne sont pas utilisés. Après la demande du professionnel, la session passe à `requested` et le patient voit l’identité déclarée. Le portail crée une paire Curve25519 éphémère. Après confirmation, le mobile chiffre uniquement la clé AES du document avec la clé publique du portail ; Supabase ne reçoit que cette enveloppe. Le navigateur déchiffre localement et l’accès atomique devient `accessed`.

Le serveur refuse la demande si la session est inconnue, expirée, révoquée, déjà utilisée ou associée à un autre navigateur. Une demande ne donne jamais accès avant la confirmation explicite du patient. Le QR court ne suffit pas à récupérer le document : il faut aussi l’UUID de demande conservé par le navigateur à l’origine de la demande.

Le portail doit refuser :

- session inconnue, expirée, révoquée, refusée ou non approuvée ;
- code consommé ou nombre de tentatives dépassé ;
- version non incluse dans \`share_items\` ;
- accès direct aux tables patient.

Le partage à clés éphémères fera l’objet d’un spike court. S’il ne peut pas être validé sans primitive maison, la démo du portail restera limitée à des fixtures synthétiques et sera étiquetée prototype ; le coffre patient ne sera pas affaibli.

### Exception de démonstration : affichage du code dans l’application

`DEMO_IN_APP_CODE_DISPLAY`, le pepper associé et les secrets Twilio ne sont plus utilisés par le parcours de partage Hackathon MVP. Ils doivent être retirés de la configuration lors du prochain nettoyage de secrets.

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
- Disponibilité, coût, restrictions géographiques et anti-fraude des fournisseurs SMS non garantis par le MVP.
- Un compte Twilio d’essai peut refuser le corps personnalisé du code temporaire ; un compte mis à niveau peut être nécessaire pour la démonstration réelle.
