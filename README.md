# WérPass

WérPass est un coffre mobile de documents médicaux, contrôlé par le patient, conçu pour l’OpenAI Build Week dans la catégorie « Apps for Your Life ».

Le MVP démontre un coffre patient réellement utilisable hors ligne, un import intelligent consenti avec GPT-5.6 et un partage temporaire avec un professionnel de démonstration. Toutes les données utilisées sont synthétiques.

## État

La verticale de démonstration est implémentée : coffre hors ligne, OTP patient, synchronisation du ciphertext, import intelligent consenti et partage temporaire borné. L’Edge Function GPT-5.6 est déployée mais le quota API actuel refuse les appels ; un repli local déterministe est donc disponible et toujours étiqueté « Prototype simulé — aucun appel GPT ». Le portail professionnel reçoit uniquement le paquet chiffré autorisé et ne prétend pas le déchiffrer.

- Brief source : [Project.txt](Project.txt)
- Roadmap et état d’avancement : [ROADMAP.md](ROADMAP.md)
- Architecture : [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Sécurité : [docs/SECURITY.md](docs/SECURITY.md)
- Contrat hors ligne : [docs/OFFLINE_DEMO.md](docs/OFFLINE_DEMO.md)
- Contrats applicatifs : [docs/CONTRACTS.md](docs/CONTRACTS.md)
- Stratégie de tests : [docs/TESTING.md](docs/TESTING.md)
- Démo et soumission : [docs/DEMO.md](docs/DEMO.md)
- Dépannage reproductible : [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)

## Ligne directrice

Une seule tranche verticale doit être fiable :

1. importer un document synthétique hors ligne ;
2. le chiffrer et le consulter après redémarrage ;
3. préparer l’import intelligent sans réseau ;
4. afficher et approuver le texte pseudonymisé ;
5. obtenir un résultat structuré de GPT-5.6, ou utiliser le repli local explicitement simulé ;
6. synchroniser le ciphertext ;
7. partager une sélection, approuver, révoquer et consulter le journal.

Le partage distant sans réseau est illustré honnêtement comme une intention en attente de reconnexion. La consultation sur le téléphone du patient fonctionne réellement hors ligne.

## Règles absolues

- Ne jamais utiliser de vraies données médicales.
- Ne jamais envoyer le document original à OpenAI.
- Ne jamais placer de donnée médicale ou de clé dans un QR, un code, un log ou une variable publique.
- Ne jamais confondre OTP, PIN local et code médical.
- Ne pas présenter le prototype comme un produit médical certifié.

## Démarrage

Le socle applicatif se vérifie avec :

\`\`\`text
pnpm verify
\`\`\`

Elle reproduit les vérifications de la CI : lint, types, tests ciblés et build du portail. Réinitialiser la démonstration locale avec `pnpm demo:reset`.

Le coffre SQLCipher nécessite un development build ; Expo Go ne suffit pas :

```text
pnpm --filter @werpass/mobile android
```

Dans l’application, créer un PIN de 4 à 8 chiffres puis importer uniquement `prescription-demo.pdf` ou `lab-result-demo.jpg`. Pour synchroniser, saisir une adresse e-mail de démonstration, valider l’OTP Supabase, puis utiliser « Synchroniser les documents chiffrés ». Le bouton « Réinitialiser la démo » supprime les données synthétiques, la base locale et les secrets de démonstration de l’appareil.

### Configuration de l’import GPT

Définir `EXPO_PUBLIC_SUPABASE_URL` et `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` dans l’environnement du development build. Définir la clé OpenAI uniquement comme secret de l’Edge Function, jamais dans un fichier `.env` client ou une variable `EXPO_PUBLIC_*` :

```text
supabase secrets set OPENAI_API_KEY=<nouvelle-clé> OPENAI_MODEL=gpt-5.6
supabase functions deploy smart-import
```

Toute clé copiée dans une conversation, un ticket ou un log doit être révoquée avant utilisation.

### Partage professionnel de démonstration

Après authentification OTP et synchronisation, choisir « Partager ce document ». L’application affiche :

- un identifiant QR opaque sans donnée ni clé ;
- un code médical distinct du PIN et de l’OTP ;
- une expiration de dix minutes ;
- une action de révocation.

Construire le portail avec `pnpm --filter @werpass/clinician-web build`, puis ouvrir `apps/clinician-web/dist/index.html` via un serveur HTTP statique. Saisir l’identifiant opaque et le code médical. Un accès réussi consomme le code et affiche uniquement les informations techniques du paquet chiffré sélectionné.

Le backend de partage se déploie avec :

```text
supabase secrets set MEDICAL_CODE_PEPPER=<secret-aléatoire-serveur>
supabase functions deploy share-demo
```

Ne jamais stocker `MEDICAL_CODE_PEPPER` dans le dépôt ou dans une variable publique.

## Échéance

Soumission OpenAI Build Week : **22 juillet 2026 à 00:00 UTC**. Gel fonctionnel prévu le 20 juillet ; soumission interne visée le 21 juillet à 20:00 UTC pour conserver quatre heures de marge.
