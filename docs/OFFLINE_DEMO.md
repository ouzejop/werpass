# Contrat de démonstration hors ligne

## Réellement fonctionnel sans réseau

- déverrouillage local ;
- import d’une fixture PDF/JPEG ;
- chiffrement avant stockage durable ;
- chronologie et lecture locale ;
- édition des métadonnées ;
- outbox persistante ;
- états local, en attente, synchronisation, synchronisé et échec ;
- consultation temporaire sur le téléphone du patient ;
- journal local synchronisé ultérieurement.

## Illustré uniquement

Le patient peut créer une intention de partage et un code à six chiffres alors qu’il est hors ligne. L’état reste \`pending_connection\`.

- Aucun professionnel ne reçoit de document ou de clé avant reconnexion.
- Le portail peut afficher « demande en attente », mais ne doit pas prétendre avoir accès.
- Après reconnexion, le backend crée ou active la session, applique les limites de tentatives et poursuit le flux normal.
- Une bannière indique « Prototype — données synthétiques ».

## Scénario jury

1. Activer le mode avion.
2. Déverrouiller l’application.
3. Importer une ordonnance synthétique.
4. Fermer puis relancer l’application.
5. Consulter le document dans la chronologie.
6. Activer l’import intelligent : l’opération passe en attente.
7. Préparer une intention de partage : aucune clé n’est délivrée.
8. Réactiver le réseau.
9. Montrer la reprise de l’outbox, l’aperçu pseudonymisé et le consentement.
10. Finaliser le partage en ligne.

## Critères d’acceptation

- Le premier rendu utile ne dépend pas du réseau.
- Chaque transition est visible et déterministe.
- Le redémarrage ne perd aucune opération en attente.
- Le retry est idempotent.
- Une opération échouée reste réessayable.
- Aucune ancienne version n’écrase silencieusement une nouvelle.
- L’illustration hors ligne n’affiche jamais un faux accès accordé.
