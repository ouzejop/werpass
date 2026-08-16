# Périmètre produit recentré

## Promesse du MVP

WérPass est un coffre mobile local-first : le patient conserve des documents synthétiques, les consulte hors connexion et décide explicitement quand un professionnel peut demander l’accès à un document sélectionné.

La tranche démontrée est volontairement unique :

1. importer et consulter un document synthétique hors connexion ;
2. synchroniser uniquement son enveloppe chiffrée ;
3. créer un QR opaque pour un document synchronisé ;
4. laisser le professionnel déclarer son nom et son établissement ;
5. afficher la demande au patient ;
6. autoriser ou refuser explicitement ;
7. générer le code temporaire seulement après autorisation ;
8. ouvrir une fois le portail du navigateur demandeur après l’accord, puis permettre la révocation.

## Machine d’état du partage

```text
pending -> requested -> approved -> accès unique
                    \-> declined
pending/requested -> expired
approved -> revoked
```

`requested` est une demande sans accès. `approved` signifie que le patient a confirmé : le portail ayant créé cette demande récupère alors l’enveloppe chiffrée sans second code. L’accès la fait passer à `accessed` et ne peut pas être rejoué. Aucun document ni clé ne sont envoyés avant cette confirmation.

## Hors périmètre de cette tranche

- partage multi-documents et sélection avancée ;
- compte professionnel vérifié ou annuaire d’établissements ;
- déchiffrement réel dans le navigateur ;
- clés éphémères navigateur et protocole de transfert appareil-à-appareil ;
- récupération multi-appareil ;
- notifications push ;
- données médicales réelles ou usage de production.

Ces éléments restent des décisions futures, pas des prérequis pour valider le parcours patient-consentement-partage.

## Critères de sortie

- une demande professionnelle n’autorise jamais automatiquement une session ;
- le patient voit l’identité déclarée avant de décider ;
- refuser, révoquer, expirer ou réutiliser un code bloque l’accès ;
- le mode avion montre seulement une intention locale `pending_connection` ;
- les fixtures et le mode démo sont visiblement synthétiques/prototype.
