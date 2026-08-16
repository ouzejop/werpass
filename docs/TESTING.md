# Stratégie de tests MVP

Tester les risques qui peuvent casser la démonstration ou invalider une garantie. Ne pas rechercher une couverture exhaustive.

## Pyramide

1. Tests unitaires rapides pour crypto, pseudonymisation, contrats et machine d’état.
2. Tests d’intégration pour outbox, Edge Functions et autorisation.
3. Tests SQL/RLS pour isolation patient et partage.
4. Deux répétitions manuelles du parcours jury, dont une en mode avion.

## Invariants obligatoires

### Chiffrement

- round-trip avec clé et AAD corrects ;
- mauvaise clé, mauvais AAD ou ciphertext altéré échouent fermé ;
- deux versions utilisent des clés et nonces distincts ;
- aucun marqueur du texte clair n’est visible dans le blob ;
- le format d’enveloppe refuse une version inconnue.

### Données

- le payload de sync ne contient ni original ni métadonnée sensible en clair ;
- QR et code ne contiennent aucun secret ou contenu médical ;
- les logs restent exempts de clé, token, texte pseudonymisé et contenu médical.
- tout fichier non vide jusqu’à 5 Mo est importable ; un type inconnu devient `application/octet-stream` ;
- seuls les deux fichiers synthétiques exacts sont éligibles à l’import intelligent.
- un type libre proposé par l’IA est borné, modifiable puis stocké uniquement dans les métadonnées chiffrées ;
- recherche, filtres et regroupement fonctionnent hors ligne sans table de catégories en clair ;
- l’âge et les maladies chroniques restent dans le ciphertext du profil synchronisé.

### Authentification et récupération locale

- l’OTP d’inscription vérifie le téléphone mais ne déverrouille pas seul le coffre ;
- le PIN local contient exactement quatre chiffres et se bloque temporairement après cinq erreurs ;
- le code temporaire du médecin n’est jamais confondu avec l’OTP ou le PIN dans le domaine ou l’interface ;
- une base SQLite illisible échoue fermé et affiche une récupération explicite ;
- le coffre standard n’utilise aucun `PRAGMA key` ni option `useSQLCipher` ;
- l’implémentation de la base reste derrière `VaultDatabase` ;
- aucune suppression locale n’a lieu sans confirmation ; l’échec de fermeture d’un handle incompatible ne bloque pas la suppression confirmée ;
- la restauration Android de l’application reste désactivée.

### Groq / GPT‑OSS

- zéro appel sans consentement explicite ;
- le bouton « Analyse IA » affiche l’avertissement avant la préparation, puis exige une seconde confirmation sur le texte pseudonymisé éditable ;
- l’interface indique sans ambiguïté que l’image enregistrée reste intacte et non anonymisée, tandis que ni l’image ni le fichier original ne sont envoyés à Groq ;
- le bouton reste visible pour un document non compatible et explique la limite OCR locale sans proposer ni déclencher d’envoi ;
- payload envoyé égal à l’aperçu approuvé ;
- contrat impossible à instancier avec un fichier original ;
- annulation et mode hors ligne n’envoient rien ;
- réponse invalide, diagnostic ou traitement sont refusés.
- aucune liste de types créée par le patient n’est ajoutée au payload Groq.
- la réponse structurée conserve les sections, libellés et valeurs complètes, notamment unités et intervalles de référence, sans réduire l’analyse au seul type documentaire.
- le résultat IA en attente est chiffré avant écriture SQLite et ne s’ouvre qu’avec la clé du document et le bon identifiant de requête.

### Hors ligne et sync

- import, chronologie et consultation fonctionnent sans réseau ;
- outbox survit au redémarrage ;
- retry idempotent ;
- transitions d’état valides uniquement ;
- ancienne version incapable d’écraser la plus récente ;
- fichiers immuables.

### Partage et RLS

- portée exacte de la sélection ;
- une demande médecin passe à `requested` sans générer de code ;
- l’identité déclarée du professionnel est visible au patient avant toute décision ;
- aucun accès n’est possible avant `approve` authentifié du patient ;
- `decline`, expiration et révocation bloquent l’accès ;
- aucune génération de code avant `action: request` ;
- hors mode démo, un échec SMS ne conserve aucun digest et ne passe pas la session à `approved` ;
- en mode démo, le SMS est tout de même tenté et l’affichage du code exige la session authentifiée du patient ;
- le mobile ne reçoit ni ne stocke le code temporaire ;
- code usage unique, expiré et limité en tentatives ;
- rejeu refusé ;
- révocation/expiration bloque le prochain accès ;
- patient A ne lit ni ne modifie B ;
- utilisateur anonyme refusé ;
- professionnel sans grant refusé ;
- client incapable d’écrire directement l’audit.

## Commande cible

\`pnpm verify\` devra exécuter, dans cet ordre :

1. lint ;
2. typecheck ;
3. tests unitaires et d’intégration ciblés ;
4. tests RLS lorsqu’un Supabase local est disponible ;
5. build du portail.

Le build natif EAS et les suites longues ne font pas partie de chaque itération.

État au 18 juillet : `pnpm verify`, l’export Metro Android et `assembleDebug` passent. Les validations qui exigent un fournisseur réel — OTP téléphone, envoi Twilio, délivrabilité, RLS distant et parcours complet — restent manuelles et bloquantes avant la démo finale.

## Critères de blocage

- P0 : fuite, consentement contourné, coffre inutilisable, partage non autorisé, parcours jury cassé.
- P1 : état ambigu, expiration/révocation incorrecte, installation non reproductible.
- P2 : polish ou cas non filmé ; reporter après soumission.
