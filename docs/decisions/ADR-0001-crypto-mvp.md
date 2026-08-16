# ADR-0001 — Chiffrement applicatif et abstraction du coffre

- Statut : **approuvé — Hackathon MVP**
- Date : 2026-08-01
- Remplace : la décision SQLCipher du 2026-07-17 pour la version de démonstration

## Contexte

La V1 doit être stable et facile à lancer avec Expo Dev Client pendant le hackathon. SQLCipher impose une compilation native spécifique et ajoute une source de blocage qui n’est pas nécessaire pour démontrer le chiffrement des documents.

Le besoin de sécurité reste inchangé : les documents médicaux synthétiques et leurs métadonnées sensibles doivent être chiffrés avant toute persistance SQLite ou synchronisation Supabase.

## Décision

1. Générer une clé patient aléatoire de 32 octets.
2. Générer une clé aléatoire distincte pour chaque version de document.
3. Chiffrer les fichiers et métadonnées sensibles avec AES-256-GCM.
4. Utiliser un nonce aléatoire unique de 12 octets et un tag de 16 octets.
5. Authentifier comme AAD la version du format, le patient, le document et la version.
6. Envelopper chaque clé de document avec la clé patient.
7. Protéger la clé patient avec un secret appareil stocké dans SecureStore/Keystore/Keychain.
8. Utiliser **SQLite standard** pour la base locale du Hackathon MVP.
9. Conserver uniquement le ciphertext, les enveloppes de clés et les métadonnées chiffrées pour les données médicales sensibles dans SQLite.
10. Accéder à SQLite uniquement via l’interface `VaultDatabase` et son implémentation `SQLiteVaultDatabase`.
11. Versionner le format d’enveloppe dès la première version.
12. Utiliser le PIN comme verrou local avec compteur et délai, jamais comme clé cryptographique.
13. Pour un partage approuvé, générer une paire Curve25519 éphémère dans le navigateur professionnel et chiffrer uniquement la clé AES du document avec `nacl.box`. La clé patient, la clé de document en clair et la clé privée du navigateur ne quittent jamais leur appareil.

## Frontière de l’abstraction

Le domaine et les écrans ne dépendent pas d’Expo SQLite ni de SQLCipher.

```text
VaultDatabase
    └── SQLiteVaultDatabase       (Hackathon MVP, SQLite standard)

Future:
    └── SQLCipherVaultDatabase    (après le hackathon)
```

`TODO(HACKATHON): remplacer SQLiteVaultDatabase par SQLCipherVaultDatabase lorsque la protection de la base locale devient une exigence produit. Cette migration ne doit modifier ni les modèles, ni les repositories, ni les services, ni les écrans.

## Ce qui est temporairement abandonné

- SQLCipher dans la compilation native ;
- `useSQLCipher` dans la configuration Expo ;
- toute utilisation de `PRAGMA key` ;
- la garantie de confidentialité des champs techniques de la base SQLite elle-même.

Cette dernière limite est acceptée uniquement pour la démonstration avec des données synthétiques. Elle ne doit pas être présentée comme une garantie de production.

## Invariants conservés

- aucun document original n’est envoyé à Groq ni à aucun fournisseur IA ;
- aucune clé principale n’est envoyée en clair à Supabase ;
- les données médicales sont chiffrées avant SQLite et avant synchronisation ;
- les types documentaires libres, l’âge, le groupe sanguin et les maladies chroniques utilisent les enveloppes de métadonnées/profil existantes et ne créent aucun index sensible en clair ;
- les clés et secrets restent hors d’AsyncStorage et des variables publiques ;
- les QR, codes, logs et erreurs ne contiennent ni document ni clé ;
- Supabase ne reçoit, pour le partage, que la clé publique éphémère et une clé de document emballée ;
- le changement de stockage ne modifie pas le partage, le consentement patient ou la synchronisation chiffrée.

## Conséquences

- Expo Dev Client peut utiliser le coffre sans compilation SQLCipher personnalisée ;
- la base SQLite locale n’est plus un second chiffrement : la protection repose sur le chiffrement applicatif et le secret appareil ;
- une ancienne base SQLCipher peut être illisible par SQLite standard ; la récupération reste un reset local explicite et irréversible ;
- les blobs restent chiffrés dans le système de fichiers privé ;
- les tests doivent vérifier le ciphertext, le round-trip AES-GCM et l’absence de `PRAGMA key`.

## Réactivation après le hackathon

1. Implémenter `SQLCipherVaultDatabase` derrière `VaultDatabase`.
2. Ajouter le plugin/configuration native SQLCipher dans l’application Expo.
3. Restaurer la politique de migration ou de reset des anciennes bases.
4. Tester une base vide, une base existante, une clé incorrecte et une restauration d’appareil.
5. Mettre à jour ce document et obtenir une nouvelle approbation avant déploiement réel.

Ne jamais remplacer AES-256-GCM par un chiffrement maison et ne jamais stocker une clé globale côté serveur.
