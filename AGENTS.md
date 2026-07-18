# Instructions du dépôt WérPass

## Priorité

Construire une seule démonstration verticale fiable avant d’élargir le périmètre. La sécurité visible, le consentement patient, le hors-ligne réel et la reproductibilité de la démo priment sur la généralisation.

## À lire

- Toujours lire \`ROADMAP.md\` avant de choisir la prochaine tranche.
- Lire \`docs/SECURITY.md\`, \`docs/THREAT_MODEL.md\` et l’ADR crypto avant tout changement d’authentification, chiffrement, partage, synchronisation sensible ou appel OpenAI.
- Lire \`docs/OFFLINE_DEMO.md\` pour tout écran ou flux hors ligne.
- Lire uniquement les autres documents utiles à la tâche ; ne pas charger toute la documentation sans besoin.

## Contraintes

- Utiliser uniquement des données synthétiques.
- Ne jamais envoyer le fichier original à OpenAI.
- N’envoyer aucun contenu à OpenAI avant aperçu et consentement explicite.
- Ne placer aucune clé, donnée médicale ou secret dans les QR, codes, logs, analytics, erreurs, fixtures publiques ou variables \`EXPO_PUBLIC_*\` / \`VITE_*\`.
- Garder OTP de connexion, PIN local et code médical séparés dans le domaine et l’interface.
- Ne pas inventer de primitive cryptographique.
- Demander validation avant toute décision cryptographique qui change l’ADR.
- Étiqueter clairement tout comportement illustratif ou simulé.

## Construction efficace

- Implémenter par tranche verticale, une étape de \`ROADMAP.md\` à la fois.
- Respecter le budget et le routage de modèles définis dans \`ROADMAP.md\` : Luna/Light pour le mécanique, Terra/Medium pour l’implémentation, Sol/High uniquement pour les décisions ou gates sensibles.
- Utiliser la vitesse Standard. Ne pas activer Fast, Max ou Ultra et ne pas lancer de sous-agents pendant l’implémentation sans autorisation explicite liée à la réserve.
- À 20 % d’usage hebdomadaire attribué au projet, arrêter le travail planifié ; ne jamais dépasser le plafond absolu de 25 %.
- Co-localiser le code d’une fonctionnalité avant de créer une abstraction partagée.
- Ne créer un package partagé qu’après l’existence d’au moins deux consommateurs, sauf \`packages/contracts\`.
- Préférer une dépendance reconnue à du code maison.
- Ne pas ajouter de design system, couche générique, outil ou documentation sans besoin immédiat du scénario jury.
- Utiliser un seul patient, un seul professionnel et deux documents synthétiques pour la démo.
- Déléguer uniquement les travaux indépendants dont le gain justifie le coût.
- Ne pas rouvrir une décision consignée sans nouvelle contrainte vérifiable.

## Vérification

- Ajouter les tests de sécurité en même temps que la tranche concernée.
- Exécuter les tests les plus étroits pendant l’itération.
- Exécuter \`pnpm verify\` avant de déclarer une tranche terminée, dès que cette commande existe.
- Tester manuellement le mode avion pour toute modification du coffre, de l’import ou de l’outbox.
- Mettre à jour \`ROADMAP.md\` uniquement quand un critère d’acceptation est réellement satisfait.

## Définition de fini

Une tranche est terminée lorsque :

1. son scénario d’acceptation fonctionne ;
2. les invariants de sécurité concernés sont testés ;
3. l’état hors ligne est vérifié si applicable ;
4. aucune donnée sensible n’apparaît dans le diff, les logs ou le stockage inspectable ;
5. la documentation est mise à jour seulement si une décision ou un contrat a changé.
