# Préparation de soumission

## Description courte

WérPass est un coffre mobile local-first pour documents médicaux synthétiques. Le patient conserve un accès hors ligne, contrôle chaque traitement intelligent et autorise temporairement un professionnel à recevoir uniquement le paquet chiffré sélectionné.

## Problème

Une connectivité intermittente ne devrait pas empêcher une personne d’accéder à ses documents essentiels. Les traitements intelligents et le partage ajoutent toutefois des risques de fuite et de perte de consentement. WérPass rend ces frontières visibles : aperçu pseudonymisé avant consentement, chiffrement avant synchronisation et partage temporaire à portée exacte.

## Ce que démontre le prototype

- coffre réellement utilisable hors ligne avec PIN local ;
- AES-256-GCM, clés de documents distinctes, AAD et stockage SQLite de ciphertext ;
- import local de tout fichier non vide jusqu’à 5 Mo ; import intelligent borné aux deux fixtures strictement synthétiques ;
- aperçu pseudonymisé éditable et consentement annulable ;
- contrat GPT‑OSS strict côté Edge Function, original impossible dans le payload ;
- repli déterministe affiché comme « Prototype simulé — aucun appel GPT » si le service d’inférence est indisponible ;
- synchronisation du ciphertext et métadonnées chiffrées ;
- inscription par numéro de téléphone et OTP patient distinct du PIN local à quatre chiffres ;
- QR généré à la demande avec identifiant saisissable équivalent, sans donnée médicale ni clé ;
- demande professionnelle liée à un navigateur précis, visible puis confirmée ou refusée par le patient ;
- partage de cinq minutes, accès unique, révocation et audit serveur ;
- portail professionnel limité au dossier et aux résultats d’analyse explicitement autorisés.

## Utilisation de Codex

Codex a servi à transformer le brief en tranche verticale, formaliser les invariants, implémenter le coffre Expo, écrire les contrats et tests, diagnostiquer les builds Windows, créer les migrations RLS et Edge Functions, puis exécuter les gates de sécurité. Les contrôles déterministes (`pnpm verify`, tests crypto, tests du code médical, scan de secrets et build du portail) fournissent les preuves reproductibles.

## Limites déclarées

- données synthétiques uniquement ;
- prototype non médical et non certifié ;
- partage distant hors ligne limité à une intention, sans délivrance d’accès ;
- prototype limité aux données synthétiques et à une démonstration contrôlée ;
- appel d’inférence réel à valider après configuration du secret Supabase ; la simulation reste explicitement signalée lorsqu’elle est utilisée ;
- configuration et délivrabilité de l’OTP d’inscription non encore validées ;
- récupération d’une base locale incompatible limitée à une suppression locale explicite et irréversible.

## Actions utilisateur restantes

- [ ] Configurer Supabase Auth Phone et son fournisseur SMS.
- [ ] Fournir un numéro de téléphone de test vérifié et valider l’OTP patient.
- [ ] Confirmer la migration MIME distante et redéployer les Edge Functions finales.
- [ ] Confirmer la réinitialisation locale proposée sur l’APK actuel.
- [ ] Exécuter le parcours Android en mode avion, fermer et relancer l’application.
- [ ] Réactiver le réseau et synchroniser le ciphertext.
- [ ] Créer un partage, tester un accès, un rejeu refusé et une révocation.
- [ ] Compléter/vérifier les événements d’audit `code_failed` et `expired` si montrés dans la démo.
- [ ] Répéter deux fois le parcours à froid.
- [ ] Enregistrer et publier une vidéo avec voix de moins de trois minutes.
- [ ] Renseigner l’identifiant `/feedback` et les liens définitifs.
- [ ] Confirmer la catégorie, l’accès au dépôt et la soumission Devpost.
