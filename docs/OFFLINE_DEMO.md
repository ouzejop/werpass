# Contrat de démonstration hors ligne

## Réellement fonctionnel sans réseau

- déverrouillage local ;
- import local de tout fichier non vide jusqu’à 5 Mo ;
- chiffrement avant stockage durable ;
- chronologie et lecture locale ;
- édition des métadonnées ;
- création libre de types, classement, recherche et filtres documentaires ;
- outbox persistante ;
- états local, en attente, synchronisation, synchronisé et échec ;
- consultation temporaire sur le téléphone du patient ;
- journal local synchronisé ultérieurement.
- affichage d’une intention QR opaque et de son identifiant équivalent, sans accès distant actif.

## Illustré uniquement

Le patient peut créer une intention de partage et un identifiant QR opaque alors qu’il est hors ligne. L’état reste `pending_connection` dans l’outbox locale.

- Aucun professionnel ne reçoit de document ou de clé avant reconnexion.
- Le portail peut afficher « demande en attente », mais ne doit pas prétendre avoir accès.
- Après reconnexion, le backend crée ou active la session. Le portail peut déposer une demande, mais elle reste `requested` jusqu’à la confirmation explicite du patient. Après cette confirmation, seul le navigateur demandeur accède directement à l’enveloppe chiffrée, une fois.
- Aucun code médical n’existe ni ne s’affiche dans le mobile.
- Une indication « Données synthétiques » reste visible sur l’écran d’inscription/verrouillage sans être répétée sur chaque action.

## Scénario jury

1. Activer le mode avion.
2. Déverrouiller l’application.
3. Importer une ordonnance synthétique puis, si utile, un autre format non vide.
4. Fermer puis relancer l’application.
5. Consulter le document dans la chronologie.
6. Activer l’import intelligent : l’opération passe en attente.
7. Revenir à l’accueil et montrer le QR/intention : aucune clé ni autorisation distante n’est délivrée.
8. Réactiver le réseau.
9. Montrer la reprise de l’outbox, l’aperçu pseudonymisé et le consentement.
10. Depuis le portail, renseigner l’identité du professionnel et demander l’accès.
11. Dans l’application patient, vérifier l’identité puis autoriser ou refuser.
12. Après autorisation, vérifier que le portail déjà ouvert reçoit directement l’accès unique.

## Critères d’acceptation

- Le premier rendu utile ne dépend pas du réseau.
- Chaque transition est visible et déterministe.
- Le redémarrage ne perd aucune opération en attente.
- Le retry est idempotent.
- Une opération échouée reste réessayable.
- Aucune ancienne version n’écrase silencieusement une nouvelle.
- L’illustration hors ligne n’affiche jamais un faux accès accordé.
- L’absence de réseau laisse la demande en attente et ne révèle aucun accès.
