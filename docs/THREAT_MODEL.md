# Modèle de menaces MVP

## Portée

Application patient, stockage local, Supabase, Edge Function OpenAI et portail professionnel. Données synthétiques uniquement.

## Actifs

- fichiers et métadonnées ;
- clé patient, clés de documents et secrets appareil ;
- sessions Supabase, OTP, PIN et codes médicaux ;
- consentement et payload GPT ;
- autorisations et journal d’accès.

## Frontières de confiance

1. Application ↔ SecureStore et stockage local.
2. Application ↔ Supabase par HTTPS.
3. Edge Function ↔ OpenAI.
4. Portail professionnel ↔ fonctions de partage.
5. Données temporaires en clair ↔ stockage chiffré.

## Menaces prioritaires

| Menace | Mesure MVP | Preuve attendue |
|---|---|---|
| Vol du téléphone | Blob et base chiffrés, secret SecureStore, PIN local | Inspection du stockage et relance verrouillée |
| Accès entre patients | RLS et ownership explicite | Tests patient A/B |
| Altération ou rejeu | AES-GCM/AAD, version et idempotence | Mauvais AAD/clé et retry testés |
| Code ou QR volé | Valeur opaque, durée courte, usage unique, rate limit | Expiration, replay et tentatives testés |
| Partage trop large | Liste immuable de versions autorisées | Document non sélectionné refusé |
| Fuite OpenAI | Pseudonymisation, aperçu, consentement, texte minimal | Test zéro appel avant consentement |
| Fuite de logs/config | Redaction, variables serveur, secret scan | Recherche automatique et revue du diff |
| Écrasement de version | Versions immuables et conflit visible | Ancienne version refusée |
| Résultat IA présenté comme clinique | Provenance et confirmation patient | UI et schéma sans conseil médical |

## Cas explicitement hors modèle

- malware disposant des privilèges système ;
- professionnel photographiant l’écran ;
- attaque cryptographique contre les primitives reconnues ;
- disponibilité permanente de SMS ou réseau ;
- données médicales réelles ou déploiement réglementé.

## Révision

Mettre à jour ce document uniquement lorsqu’un nouvel actif, une nouvelle frontière ou une nouvelle garantie apparaît. Toute nouvelle menace P0 doit être traitée avant de poursuivre la roadmap.
