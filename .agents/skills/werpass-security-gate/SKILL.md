---
name: werpass-security-gate
description: Vérifier les changements WérPass sensibles avant implémentation et avant clôture. Utiliser pour toute tâche touchant au chiffrement, aux clés, à l’authentification, au PIN/OTP/code médical, au stockage, à la synchronisation, à Supabase RLS, au partage, aux QR, aux logs ou à l’envoi de données vers OpenAI.
---

# WérPass Security Gate

## Procédure

1. Lire `docs/SECURITY.md`, `docs/THREAT_MODEL.md` et les contrats concernés.
2. Lire `docs/decisions/ADR-0001-crypto-mvp.md` pour tout changement de coffre ou de clés.
3. Identifier les actifs, frontières de confiance et invariants affectés.
4. Refuser toute nouvelle primitive cryptographique, tout secret client public ou toute donnée réelle.
5. Vérifier que la tranche respecte le périmètre réel/illustré de `docs/OFFLINE_DEMO.md`.
6. Ajouter ou ajuster les tests ciblés de `docs/TESTING.md` en même temps que le changement.
7. Exécuter les vérifications étroites, puis `pnpm verify` avant clôture quand disponible.
8. Inspecter le diff et les logs pour détecter clés, tokens, données médicales, originaux ou payloads OpenAI.

## Arrêts obligatoires

- Demander l’approbation avant de modifier une décision cryptographique consignée.
- Bloquer l’implémentation si l’original peut atteindre OpenAI.
- Bloquer si un QR ou code contient une donnée ou une clé.
- Bloquer si le partage distant hors ligne délivre un accès avant reconnexion.
- Bloquer si une fonction client peut contourner RLS ou écrire l’audit.
- Bloquer si une garantie simulée n’est pas étiquetée prototype.

## Sortie attendue

Donner une conclusion concise :

- invariants concernés ;
- tests exécutés ou manquants ;
- risques restants ;
- verdict `PASS`, `PASS WITH LIMITS` ou `BLOCK`.
