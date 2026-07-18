# Préparation de soumission

## Description courte

WérPass est un coffre mobile local-first pour documents médicaux synthétiques. Le patient conserve un accès hors ligne, contrôle chaque traitement intelligent et autorise temporairement un professionnel à recevoir uniquement le paquet chiffré sélectionné.

## Problème

Une connectivité intermittente ne devrait pas empêcher une personne d’accéder à ses documents essentiels. Les traitements intelligents et le partage ajoutent toutefois des risques de fuite et de perte de consentement. WérPass rend ces frontières visibles : aperçu pseudonymisé avant consentement, chiffrement avant synchronisation et partage temporaire à portée exacte.

## Ce que démontre le prototype

- coffre réellement utilisable hors ligne avec PIN local ;
- AES-256-GCM, clés de documents distinctes, AAD et stockage SQLCipher ;
- import borné à deux fixtures strictement synthétiques ;
- aperçu pseudonymisé éditable et consentement annulable ;
- contrat GPT-5.6 strict côté Edge Function, `store: false`, original impossible dans le payload ;
- repli déterministe affiché comme « Prototype simulé — aucun appel GPT » tant que le quota API est indisponible ;
- synchronisation du ciphertext et métadonnées chiffrées ;
- OTP patient distinct du PIN local et du code médical ;
- partage de dix minutes, code à usage unique, cinq tentatives, révocation et audit serveur ;
- portail professionnel limité au paquet chiffré autorisé.

## Utilisation de Codex

Codex a servi à transformer le brief en tranche verticale, formaliser les invariants, implémenter le coffre Expo, écrire les contrats et tests, diagnostiquer les builds Windows, créer les migrations RLS et Edge Functions, puis exécuter les gates de sécurité. Les contrôles déterministes (`pnpm verify`, tests crypto, tests du code médical, scan de secrets et build du portail) fournissent les preuves reproductibles.

## Limites déclarées

- données synthétiques uniquement ;
- prototype non médical et non certifié ;
- partage distant hors ligne limité à une intention, sans délivrance d’accès ;
- portail sans déchiffrement navigateur tant que l’échange de clés éphémères n’est pas validé ;
- appel GPT réel actuellement bloqué par quota API et remplacé dans la démo par une simulation explicitement signalée.

## Actions utilisateur restantes

- [ ] Fournir une adresse e-mail accessible et valider l’OTP patient.
- [ ] Exécuter le parcours Android en mode avion, fermer et relancer l’application.
- [ ] Réactiver le réseau et synchroniser le ciphertext.
- [ ] Créer un partage, tester un accès, un rejeu refusé et une révocation.
- [ ] Répéter deux fois le parcours à froid.
- [ ] Enregistrer et publier une vidéo avec voix de moins de trois minutes.
- [ ] Renseigner l’identifiant `/feedback` et les liens définitifs.
- [ ] Confirmer la catégorie, l’accès au dépôt et la soumission Devpost.
