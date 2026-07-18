# Roadmap WérPass — OpenAI Build Week

Source unique de planification et d’état. Toute nouvelle idée non nécessaire à la démonstration va dans « Après le hackathon ».

## Objectif de soumission

Présenter en moins de trois minutes une application cohérente qui prouve :

- un vrai usage hors ligne du coffre patient ;
- un traitement GPT-5.6 limité, pseudonymisé et consenti ;
- une synchronisation de données chiffrées ;
- un partage temporaire contrôlé et révocable ;
- une utilisation substantielle de Codex documentée.

Échéance officielle : **2026-07-22 00:00 UTC**. Échéance interne : **2026-07-21 20:00 UTC**.

## Budget Codex — plafond de 25 % de l’usage hebdomadaire

Le plan vise **20 points de pourcentage** d’usage hebdomadaire pour WérPass et conserve **5 points de réserve**. La réserve ne sert qu’à un blocage P0, une vérification de sécurité ou la soumission finale ; elle ne finance aucune nouvelle fonctionnalité.

Ce compteur concerne Codex et ChatGPT Work. Les appels de l’application à l’API OpenAI sont facturés séparément et ne consomment pas ce quota hebdomadaire. Pour la démonstration, l’application garde `OPENAI_MODEL=gpt-5.6` et limite les appels aux deux fixtures synthétiques et aux répétitions indispensables.

### Mesure et seuils d’arrêt

1. Avant le bootstrap, relever le pourcentage dans le tableau de bord d’usage Codex et le noter comme `U0` : **à renseigner**.
2. La préparation déjà réalisée est provisionnée à **3 %**, faute de mesure initiale distincte.
3. Après chaque tranche, calculer l’usage projet comme `3 % + (U_actuel - U0)`. Si le compteur hebdomadaire se réinitialise, relever un nouveau point de départ et reporter le reliquat.
4. Si la préparation mesurée dépasse finalement 3 %, retirer l’écart des phases restantes ; ne jamais augmenter l’enveloppe de 20 %.
5. À **20 %**, arrêter le travail planifié. Entre 20 et 25 %, n’autoriser que la réserve. À **25 %**, arrêter Codex sur WérPass jusqu’à la remise à zéro hebdomadaire.

### Allocation par phase

| Phase | Tâches et modèle Codex | Raisonnement | Budget cible | Cumul planifié |
|---|---|---:|---:|---:|
| Préparation réalisée | Provision uniquement ; si reprise, **GPT-5.6 Sol** pour architecture/sécurité et **Luna** pour la documentation mécanique | Medium, High seulement pour la sécurité | 3 % provisionnés | 3 % |
| 17 juillet — bootstrap | **Luna** pour monorepo, configuration, fixtures et CI ; passer à **Terra** uniquement sur un blocage reproductible | Light ; Medium après échec vérifié | 2 % | 5 % |
| 18 juillet — coffre hors ligne | **Terra** pour le flux vertical ; **Luna** pour copies et tests répétitifs ; une passe **Sol** pour le gate crypto | Medium ; High pour le gate | 5 % | 10 % |
| 19 juillet — import GPT consenti | **Terra** pour extraction, consentement et Edge Function ; **Luna** pour schémas/fixtures ; une passe **Sol** sur la frontière de données | Medium ; High pour le gate | 4 % | 14 % |
| 20 juillet — synchronisation et partage | **Terra** pour Supabase et le happy path ; **Sol** seulement pour RLS, auth, clés, QR et révocation | Medium ; High pour le gate | 4 % | 18 % |
| 21 juillet — qualité et soumission | **Luna** pour README, checklist, script et texte Devpost ; **Terra** pour les défauts P0 ; **Sol** seulement pour un bloqueur critique | Light à Medium | 2 % | 20 % |
| Réserve | **Terra** par défaut ; **Sol** seulement si un risque P0 le justifie | Le plus bas efficace | 5 % maximum | 25 % maximum |

Les taux officiels donnent à Terra environ la moitié du coût en crédits de Sol et à Luna environ un cinquième, à volume de tokens comparable. Les pourcentages du tableau restent des plafonds opérationnels : la consommation réelle dépend aussi du contexte, du raisonnement, des outils et du cache.

### Règles d’économie obligatoires

- Utiliser la vitesse **Standard** ; ne jamais activer Fast pour ce projet, car Fast sur GPT-5.6 consomme 2,5 fois plus de crédits.
- Ne pas utiliser Max, Extra High ou Ultra. High est réservé à une passe de sécurité bornée ; Ultra et les sous-agents restent désactivés pendant l’implémentation.
- Donner une tranche verticale précise par tâche, avec fichiers utiles, acceptation et commande de test ; ne pas demander une exploration générale du dépôt.
- Laisser Luna faire les transformations déterministes, Terra écrire et déboguer le produit, et Sol juger les décisions ambiguës ou sensibles.
- Après un échec Luna reproductible, passer une fois à Terra. Après un échec Terra sur un P0, passer une fois à Sol ; sinon réduire le scope.
- Exécuter les linters, tests, scans et recherches par outils déterministes plutôt que demander plusieurs relectures au modèle.
- Ne pas générer d’image avec Codex sauf visuel indispensable au jury et réserve disponible ; privilégier les composants et icônes déjà présents.
- Vérifier le compteur à la fin de chaque phase. Si le cumul réel dépasse le seuil, couper d’abord P1 puis le polish, jamais un invariant de sécurité P0.

Références officielles : [choix des modèles Codex](https://learn.chatgpt.com/docs/models), [limites et taux de crédits](https://learn.chatgpt.com/docs/pricing), [coût du mode Fast](https://learn.chatgpt.com/docs/agent-configuration/speed).

## Chemin critique

| Priorité | Contenu |
|---|---|
| P0 | Coffre hors ligne, consentement GPT réel, synchronisation ciphertext, partage en ligne happy path, vidéo et soumission |
| P1 | Révocation, journal, consultation locale hors ligne, illustration de l’intention de partage hors ligne |
| Coupé | Tout élément qui ne renforce pas directement la démonstration ou un invariant de sécurité P0 |

## 17 juillet — Préparation et bootstrap

### Préparation

- [x] Geler le périmètre réel, illustré et différé.
- [x] Documenter architecture, sécurité, menaces, contrats et tests.
- [x] Créer les conventions Codex et le garde-fou sécurité.
- [x] Définir la roadmap et le script de démonstration.
- [x] Faire approuver l’ADR cryptographique.

### Bootstrap applicatif — timebox 2 à 3 heures

- [x] Initialiser Git sur la branche `main`.
- [x] Initialiser le monorepo pnpm.
- [x] Créer \`apps/mobile\`, \`apps/clinician-web\`, \`packages/contracts\` et \`supabase\`.
- [x] Configurer TypeScript strict, lint, format, tests et \`pnpm verify\`.
- [x] Ajouter deux fixtures synthétiques : une ordonnance et un résultat d’analyse.
- [x] Ajouter un mode démo et une commande de remise à zéro.
- [ ] Faire passer la CI (workflow prêt ; exécution distante à déclencher après ajout du dépôt distant).

Acceptation : installation reproductible, aucun secret commité, shell mobile et portail exécutables, fixtures clairement synthétiques.

## 18 juillet — Tranche hors ligne réelle

- [x] Patient de démonstration et PIN local.
- [x] Import d’un PDF/JPEG synthétique.
- [x] Chiffrement local et suppression de la copie temporaire en clair.
- [x] Persistance locale et chronologie.
- [x] Outbox persistante et états de synchronisation.
- [x] Consultation locale temporaire en lecture seule.

Acceptation :

- en mode avion avant le lancement, import et consultation fonctionnent ;
- après fermeture et relance, le document reste lisible après déverrouillage ;
- le stockage inspecté ne contient pas le document en clair ;
- l’outbox survit au redémarrage ;
- chiffrement altéré, mauvaise clé ou mauvais AAD échouent fermé.

## 19 juillet — Import intelligent consenti

- [x] Extraction locale bornée sur les deux fixtures.
- [x] Pseudonymisation déterministe et aperçu éditable.
- [x] Consentement explicite et annulable.
- [x] File d’attente si le réseau est absent.
- [x] Edge Function GPT-5.6 et Structured Output strict (déployée ; appel réel bloqué par quota API).
- [x] Vérification et confirmation du résultat (repli local explicitement simulé disponible).

Limite au 18 juillet : l’intégration et les refus sont testés, mais l’acceptation GPT réelle reste non satisfaite tant que le fournisseur retourne `provider_rate_limited`.

Acceptation :

- aucun appel avant consentement ;
- le fichier original est impossible dans le contrat réseau ;
- le payload affiché est exactement celui envoyé ;
- l’annulation n’envoie et ne persiste rien ;
- une sortie non conforme est refusée ;
- le mode hors ligne reprend correctement à la reconnexion.

## 20 juillet — Synchronisation et partage

- [x] Supabase Auth et tables minimales avec RLS (déployées ; OTP positif à valider).
- [x] Upload du ciphertext et métadonnées chiffrées (implémenté ; parcours positif à valider).
- [x] Portail professionnel de démonstration (build et refus navigateur vérifiés).
- [x] Session temporaire, QR opaque et code médical.
- [x] Demande, approbation patient et portée exacte (un document par session dans le prototype).
- [x] Expiration, révocation et journal.
- [ ] Intention de partage hors ligne en attente de reconnexion.

Limite au 18 juillet : le partage positif, le rejeu et la révocation doivent encore être exercés avec une session OTP utilisateur réelle. Le portail expose uniquement le paquet chiffré et reste étiqueté prototype.

Acceptation :

- avant approbation, aucun document n’est accessible ;
- un document non sélectionné reste inaccessible ;
- QR et code ne contiennent ni donnée ni clé ;
- code expiré, consommé ou rejoué est refusé ;
- révocation et expiration bloquent tout nouvel accès ;
- patient A ne peut jamais lire ou modifier les lignes du patient B.

**Gel fonctionnel à la fin de la journée. Aucun nouveau scope après ce point.**

## 21 juillet — Qualité et soumission

- [ ] Corriger uniquement les défauts P0 puis P1.
- [ ] Répéter deux fois le parcours à froid.
- [ ] Vérifier installation et reset à partir du README.
- [x] Scanner secrets, logs et contrats QR (`pnpm security:scan` ; inspection du stockage appareil encore manuelle).
- [x] Finaliser le brouillon de description Devpost et les preuves d’usage de Codex dans `docs/SUBMISSION.md`.
- [ ] Enregistrer une vidéo publique de moins de trois minutes avec voix.
- [ ] Obtenir et renseigner l’identifiant \`/feedback\`.
- [ ] Soumettre avant 20:00 UTC.

Acceptation : scénario complet reproductible sans intervention manuelle imprévue, README exact, vidéo conforme et checklist Devpost à 100 %.

## Règle de coupe si retard

Conserver dans cet ordre :

1. coffre hors ligne réel ;
2. consentement et GPT-5.6 réel ;
3. partage en ligne limité ;
4. expiration/révocation ;
5. illustration du partage hors ligne ;
6. polish non essentiel.

Ne jamais remplacer une garantie de sécurité par une simulation non signalée.

## Après le hackathon

Récupération de compte, transfert d’appareil, biométrie, OCR généraliste, vérification des médecins, partage Bluetooth/Wi-Fi Direct, multi-appareil, conflits avancés, push, FHIR, passerelle de confidentialité, analytics, i18n, téléchargement professionnel et conformité réglementaire.
