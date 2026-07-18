# ADR-0001 — Chiffrement et gestion des clés du MVP

- Statut : **approuvé**
- Date : 2026-07-17

## Contexte

Le MVP doit stocker et synchroniser des documents synthétiques comme s’il s’agissait de données sensibles, sans inventer de cryptographie ni construire la récupération multi-appareil.

## Décision proposée

1. Générer une clé principale patient aléatoire de 32 octets.
2. Générer une clé aléatoire distincte de 32 octets pour chaque version de document.
3. Chiffrer fichier et métadonnées sensibles avec AES-256-GCM.
4. Utiliser un nonce aléatoire unique de 12 octets et un tag de 16 octets pour chaque opération.
5. Authentifier comme AAD : version du format, identifiant patient, document et version.
6. Envelopper chaque clé de document sous la clé patient avec un nonce distinct.
7. Conserver la clé patient uniquement sous forme protégée par un secret appareil stocké dans SecureStore/Keystore/Keychain.
8. Utiliser SQLCipher pour la base locale et le système de fichiers privé pour les blobs déjà chiffrés.
9. Versionner le format d’enveloppe dès la première version.
10. Utiliser le PIN comme verrou local avec compteur et délai, jamais seul pour dériver ou protéger la clé principale.

## Non-décisions

- Aucune récupération après perte du téléphone.
- Aucun transfert entre appareils.
- Aucune clé globale côté serveur.
- Aucune primitive cryptographique personnalisée.
- Aucun partage distant hors ligne réel.

## Format logique

\`\`\`text
envelopeVersion
algorithm
keyId
nonce
ciphertext
tag
aadVersion
\`\`\`

Les identifiants présents dans l’AAD ne sont pas secrets. Toute combinaison clé/nonce est unique.

## Conséquences

- Supabase stocke ciphertext, métadonnées chiffrées et clés enveloppées.
- Une perte du secret appareil rend les données locales irrécupérables dans le MVP.
- SQLCipher impose un development build Expo ; Expo Go ne suffit pas.
- Les fichiers du MVP doivent rester petits si l’API de chiffrement ne fournit pas de flux natif.
- Un spike limité validera la compatibilité Expo avant construction du coffre.

## Repli

Si l’API Expo retenue échoue au spike, choisir une bibliothèque native reconnue après revue. Ne jamais remplacer AES-GCM par un chiffrement maison ou désactiver le chiffrement pour respecter la deadline.

## Validation attendue

Répondre explicitement « ADR-0001 approuvé » avant l’implémentation du coffre.
