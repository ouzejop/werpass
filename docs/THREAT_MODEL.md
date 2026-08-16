# Modèle de menaces MVP

## Portée

Application patient, stockage local, Supabase, Edge Function Groq et portail professionnel. Données synthétiques uniquement.

## Actifs

- fichiers, types documentaires et métadonnées ;
- âge, groupe sanguin et maladies chroniques du profil ;
- clé patient, clés de documents et secrets appareil ;
- sessions Supabase, OTP, PIN et codes médicaux ;
- consentement et payload GPT ;
- autorisations et journal d’accès.

## Frontières de confiance

1. Application ↔ SecureStore et stockage local.
2. Application ↔ Supabase par HTTPS.
3. Edge Function ↔ Groq.
4. Portail professionnel ↔ fonctions de partage.
5. Données temporaires en clair ↔ stockage chiffré.

## Menaces prioritaires

| Menace | Mesure MVP | Preuve attendue |
|---|---|---|
| Vol du téléphone | Blobs et métadonnées médicales chiffrés, secret SecureStore, PIN local ; SQLite standard accepté pour le hackathon | Inspection du stockage et relance verrouillée |
| Accès entre patients | RLS et ownership explicite | Tests patient A/B |
| Altération ou rejeu | AES-GCM/AAD, version et idempotence | Mauvais AAD/clé et retry testés |
| QR court volé | Valeur opaque, durée courte, demande liée à un UUID privé de navigateur, usage unique | Expiration, navigateur différent et rejeu refusés |
| Compromission de Supabase | Ciphertext et clé de document emballée seulement ; clé privée éphémère conservée dans le navigateur | Tentative de déchiffrement sans clé privée refusée |
| Ingénierie sociale | Identité déclarée présentée au patient, confirmation explicite | Aucun code médical à transmettre, absence d’accord refusée |
| Base restaurée sans clé appareil | Sauvegarde Android désactivée, échec fermé, reset explicite | Ancienne base reconnue et jamais ouverte en clair |
| Partage trop large | Liste immuable de versions autorisées | Document non sélectionné refusé |
| Fuite fournisseur IA | Pseudonymisation, aperçu, consentement, texte minimal et clé serveur | Test zéro appel avant consentement |
| Fuite par recherche/classement | Catégories dans les métadonnées chiffrées, recherche en mémoire uniquement, aucune table d’index médical en clair | Inspection SQLite et test de classement hors ligne |
| Fuite de logs/config | Redaction, variables serveur, secret scan | Recherche automatique et revue du diff |
| Écrasement de version | Versions immuables et conflit visible | Ancienne version refusée |
| Résultat IA présenté comme clinique | Provenance et confirmation patient | UI et schéma sans conseil médical |

## Cas explicitement hors modèle

- malware disposant des privilèges système ;
- professionnel photographiant l’écran ;
- attaque cryptographique contre les primitives reconnues ;
- disponibilité permanente du réseau ;
- données médicales réelles ou déploiement réglementé.

## Révision

Mettre à jour ce document uniquement lorsqu’un nouvel actif, une nouvelle frontière ou une nouvelle garantie apparaît. Toute nouvelle menace P0 doit être traitée avant de poursuivre la roadmap.
