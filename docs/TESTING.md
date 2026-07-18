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

### OpenAI

- zéro appel sans consentement explicite ;
- payload envoyé égal à l’aperçu approuvé ;
- contrat impossible à instancier avec un fichier original ;
- annulation et mode hors ligne n’envoient rien ;
- réponse invalide, diagnostic ou traitement sont refusés.

### Hors ligne et sync

- import, chronologie et consultation fonctionnent sans réseau ;
- outbox survit au redémarrage ;
- retry idempotent ;
- transitions d’état valides uniquement ;
- ancienne version incapable d’écraser la plus récente ;
- fichiers immuables.

### Partage et RLS

- portée exacte de la sélection ;
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

## Critères de blocage

- P0 : fuite, consentement contourné, coffre inutilisable, partage non autorisé, parcours jury cassé.
- P1 : état ambigu, expiration/révocation incorrecte, installation non reproductible.
- P2 : polish ou cas non filmé ; reporter après soumission.
