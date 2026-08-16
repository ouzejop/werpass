# Démo et soumission

## Message

WérPass donne au patient un coffre médical utilisable malgré une connectivité intermittente. Le patient choisit exactement quand GPT‑OSS sur Groq intervient et quels documents un professionnel peut consulter.

## Script cible actuel — 2 min 30

| Temps | Action | Preuve |
|---|---|---|
| 0:00–0:20 | Accueil avec QR et identifiant saisissable | Accès patient simple, QR sans donnée ni clé |
| 0:20–0:45 | Mode avion, PIN à quatre chiffres, import | Coffre et import hors ligne réels |
| 0:45–1:00 | Relance puis « Voir mes documents » | Persistance SQLite et lecture locale de données chiffrées |
| 1:00–1:25 | Aperçu pseudonymisé et consentement | Original absent du contrat ; contrôle patient |
| 1:25–1:40 | Résultat structuré ou simulation annoncée | Traitement borné, pas de diagnostic |
| 1:40–2:00 | Reconnexion et synchronisation du ciphertext | Reprise de l’outbox sans clair serveur |
| 2:00–2:15 | Médecin renseigne son identité et demande l’accès | La session passe à `requested`, sans code ni accès |
| 2:15–2:30 | Patient confirme/refuse, puis code unique et révocation | Consentement explicite, rejeu refusé et contrôle prospectif |

La voix doit expliquer explicitement comment Codex a accéléré architecture, implémentation, tests et revue. Ne pas annoncer un appel Groq réel avant validation du secret et de l’Edge Function déployée. Si la séquence utilise le repli local, l’annoncer clairement comme simulation.

## Mode démo

- un patient synthétique ;
- un professionnel synthétique ;
- un numéro de téléphone de test vérifié, jamais commité ;
- une ordonnance et un résultat d’analyse ;
- remise à zéro déterministe ;
- identifiant sous le QR pour continuer si le scan échoue ;
- état réseau contrôlable ;
- Supabase Auth et Twilio préconfigurés avant l’enregistrement.

## Checklist Devpost

- [ ] Projet fonctionnel.
- [ ] Catégorie « Apps for Your Life ».
- [ ] Description du problème, du produit et de l’impact.
- [ ] Dépôt public avec licence, ou accès donné aux adresses du jury.
- [ ] README avec installation, commandes et données synthétiques.
- [ ] Explication de l’usage de Codex et des décisions clés.
- [ ] Explication de l’usage de GPT‑OSS sur Groq et du consentement.
- [ ] Vidéo YouTube publique, moins de trois minutes, avec voix.
- [ ] Identifiant \`/feedback\` de la session principale.
- [ ] Lien de test et identifiants de démonstration si nécessaires.
- [ ] Soumission finale confirmée avant 20:00 UTC le 21 juillet.

## État au 18 juillet 2026

- Page WérPass publiée sur Devpost.
- Vidéo absente.
- Soumission finale non confirmée.
- Dépôt Git local créé et vérifiable avec `pnpm verify`.
- Projet Supabase lié, schéma initial et fonctions déjà déployés ; migration MIME et version SMS actuelle à redéployer/confirmer.
- GPT réel bloqué par quota API ; repli local simulé disponible et étiqueté.
- APK Android Expo Dev Client compilé et installé ; récupération d’une base locale incompatible affichée.
- Configuration positive Auth Phone/Twilio, confirmation du reset et parcours complet à réaliser avec l’utilisateur.

## Interdictions de présentation

- Ne pas dire que le partage distant fonctionne réellement sans réseau.
- Ne pas prétendre à une certification ou conformité de production.
- Ne pas utiliser une vraie ordonnance ou identité.
- Ne pas présenter une extraction GPT comme information clinique vérifiée.
