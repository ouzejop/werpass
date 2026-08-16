# Configuration de la verticale WérPass

Cette checklist sépare les valeurs publiques du client, l’authentification téléphonique Supabase et les secrets serveur utilisés pour le code temporaire du médecin. La présence du code dans le dépôt ne signifie pas que les services distants sont configurés.

## État actuel

- [x] Application mobile, portail professionnel, migrations et Edge Functions implémentés.
- [x] SQLite standard activé pour le Hackathon MVP ; chiffrement applicatif AES-256-GCM conservé.
- [x] Tests locaux, scan de secrets, bundle Android et APK de développement validés.
- [x] Projet Supabase déjà relié à un environnement distant de démonstration.
- [x] Schéma vertical initial et premières versions des Edge Functions déjà déployés.
- [ ] Migration d’extension des types MIME confirmée/appliquée sur le projet distant.
- [ ] Auth Phone activé et fournisseur SMS Supabase configuré.
- [ ] Secrets Twilio du partage ajoutés à l’Edge Function.
- [ ] Version actuelle de `share-demo` redéployée après configuration des secrets.
- [ ] Secret Groq configuré et appel `openai/gpt-oss-120b` validé.
- [ ] Parcours positif OTP, synchronisation, demande médecin, second SMS, accès unique et révocation validé sur téléphone.

## 1. Variables publiques du mobile et du portail

Créer `apps/mobile/.env.local` — ce fichier est ignoré par Git — avec uniquement les valeurs publiques :

```text
EXPO_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<clé-publiable>
EXPO_PUBLIC_DEMO_MODE=true
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<clé-publiable>
VITE_DEMO_MODE=true
```

Ne jamais y placer une clé Groq, un token Twilio, le pepper du code médical, une clé `service_role`/secrète ou une donnée patient.

## 2. Base Supabase

Le dépôt est déjà lié à un projet. Vérifier la cible avant toute mutation, puis appliquer les migrations manquantes depuis la racine canonique :

```text
supabase status
supabase migration list
supabase db push
```

Vérifier que les migrations suivantes sont présentes dans l’historique distant :

- `20260718150000_vertical_demo.sql` ;
- `20260718193000_expand_import_mime_types.sql`.

La seconde migration permet de synchroniser PDF, JPEG, PNG et les autres formats sous `application/octet-stream`, toujours avec une limite de 5 Mo.

## 3. Premier SMS : OTP d’inscription patient

Dans le Dashboard Supabase :

1. ouvrir **Authentication → Providers → Phone** ;
2. activer l’authentification par téléphone ;
3. configurer un fournisseur SMS pris en charge, par exemple Twilio ;
4. configurer les limites d’envoi adaptées à la démo et, avant toute exposition publique, un CAPTCHA ;
5. utiliser un numéro de test au format E.164, par exemple `+221…`.

Ce SMS vérifie le numéro et crée la session Supabase. Son code n’est jamais communiqué au médecin. La configuration du fournisseur dans Supabase Auth est distincte des secrets de l’Edge Function ci-dessous, même si le même compte Twilio est réutilisé.

Documentation officielle : [Supabase Phone Login](https://supabase.com/docs/guides/auth/phone-login?showSmsProvider=Twilio).

### OTP fixe de démonstration

Pour le projet de démonstration uniquement, le dépôt réserve le numéro synthétique `+221771234567` et l’OTP `123456`. La configuration locale est déclarée dans `supabase/config.toml` avec `auth.sms.test_otp`. Elle ne s’applique pas automatiquement au projet Supabase hébergé : il faut configurer le même test OTP dans la configuration Auth du projet de démo, puis le supprimer avant toute utilisation réelle.

Ce code ne doit jamais être accepté pour un autre numéro, placé dans `EXPO_PUBLIC_*` ou activé sur un projet contenant des données réelles.

## 4. Partage direct après confirmation du patient

Le Hackathon MVP n’utilise plus de second SMS, de code médical, de pepper ni de secrets Twilio pour le partage. Déployer la migration `20260801150000_short_share_tokens.sql`, puis `20260801160000_direct_patient_approval_share.sql`, avant de redéployer `share-demo` :

```text
supabase db push
supabase functions deploy share-demo
```

Le flux est : QR opaque court → demande avec identité → confirmation explicite du patient → accès direct unique dans le navigateur demandeur. Le QR ne suffit pas : le portail conserve un `portalRequestId` UUID privé, jamais affiché dans le QR ou l’application.

> Les instructions SMS/code qui suivent dans cette section sont historiques et ne doivent pas être appliquées au Hackathon MVP. Elles seront supprimées lors du nettoyage post-hackathon.

Créer un secret serveur aléatoire d’au moins 32 octets pour `MEDICAL_CODE_PEPPER`, puis enregistrer les secrets dans Supabase :

```text
supabase secrets set MEDICAL_CODE_PEPPER=<secret-serveur>
supabase secrets set TWILIO_ACCOUNT_SID=<AC...> TWILIO_AUTH_TOKEN=<token> TWILIO_FROM_NUMBER=<numéro-e164>
supabase functions deploy share-demo
```

Les variables `SUPABASE_URL`, `SUPABASE_ANON_KEY` et `SUPABASE_SERVICE_ROLE_KEY` sont fournies automatiquement aux Edge Functions hébergées. Ne jamais recopier `SUPABASE_SERVICE_ROLE_KEY` dans le mobile ou le portail.

### Affichage forcé dans l’application — démo uniquement

Pour une démonstration sans SMS, activer explicitement le secret serveur puis redéployer la fonction :

```text
supabase secrets set DEMO_IN_APP_CODE_DISPLAY=true
supabase functions deploy share-demo
```

Avec `EXPO_PUBLIC_DEMO_MODE=true`, l’application authentifiée du patient récupère alors le code après sa confirmation et l’affiche sous l’étiquette **Prototype démo**. Le serveur tente également le SMS quand un numéro vérifié est disponible, ce qui permet au patient de recevoir le code sans connexion de données. Le code reste dérivé côté serveur et n’est pas stocké en clair. Ce mode est interdit hors données synthétiques et doit être désactivé avec `DEMO_IN_APP_CODE_DISPLAY=false` avant toute utilisation réelle.

Le flux attendu est strict :

1. le médecin scanne le QR ou saisit son identifiant opaque ;
2. le portail envoie `action: request` ;
3. le serveur vérifie la session et retrouve le numéro vérifié du patient ;
4. après confirmation patient, le serveur génère le code à six chiffres, stocke seulement son HMAC et envoie le SMS ;
5. le patient communique oralement le code au médecin ;
6. une validation correcte consomme le code ; cinq erreurs, l’expiration ou la révocation bloquent l’accès.

Sur un compte Twilio d’essai, vérifier les restrictions courantes : destinataire préalablement vérifié, pays autorisé, numéro émetteur compatible et éventuelle interdiction des messages personnalisés. Le SMS WérPass utilise un corps personnalisé ; un compte Twilio mis à niveau peut donc être nécessaire. Voir [Twilio Trial](https://www.twilio.com/docs/usage/trials).

Gestion officielle des secrets : [Supabase Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets).

## 5. Analyse GPT‑OSS avec Groq

La clé reste exclusivement côté Edge Function :

```text
supabase secrets set GROQ_API_KEY=<clé> GROQ_MODEL=openai/gpt-oss-120b GROQ_BASE_URL=https://api.groq.com/openai/v1
supabase functions deploy smart-import
```

L’application accepte tout fichier non vide jusqu’à 5 Mo, mais l’analyse IA n’est proposée que pour les deux fixtures synthétiques reconnues. Le patient ouvre le document récemment importé, sélectionne « Analyser avec l’IA », vérifie l’aperçu pseudonymisé puis consent explicitement. Aucun original n’est envoyé : seul le texte approuvé fait partie du contrat réseau.

La clé peut provenir de la configuration serveur de `Renta_cv`, mais elle doit être enregistrée dans les secrets Supabase et ne doit jamais être copiée dans `apps/mobile/.env.local`, une variable `EXPO_PUBLIC_*`, une variable `VITE_*`, le dépôt ou les logs. Avant toute donnée autre que les fixtures synthétiques, activer Zero Data Retention dans les contrôles du compte Groq et effectuer une nouvelle revue de sécurité.

## 6. Validation manuelle obligatoire

- [ ] Recevoir et valider l’OTP d’inscription patient.
- [ ] Créer un PIN local de quatre chiffres et vérifier le verrouillage après cinq erreurs.
- [ ] Importer un PDF puis un format non reconnu, en mode avion.
- [ ] Relancer l’application et vérifier la lecture locale.
- [ ] Réactiver le réseau et synchroniser le ciphertext.
- [ ] Vérifier que l’accueil affiche le QR et le même identifiant saisissable.
- [ ] Envoyer la demande depuis le portail et recevoir le second SMS.
- [ ] Vérifier qu’aucun code à six chiffres n’apparaît dans l’application mobile.
- [ ] Accéder une fois, refuser le rejeu, puis tester expiration et révocation sur une nouvelle session.
- [ ] Inspecter Supabase/Twilio/Groq : aucun code clair, contenu médical, clé ou payload IA dans les logs.
