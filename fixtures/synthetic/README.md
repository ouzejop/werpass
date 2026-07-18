# Fixtures synthétiques

Créer seulement deux documents, sans personne ni établissement réel :

1. \`prescription-demo.pdf\`
   - patient : \`PATIENT DEMO 001\` ;
   - date fictive ;
   - médicaments et posologies clairement marqués comme exemple ;
   - nom de clinique fictif ;
   - quelques champs destinés à la pseudonymisation.

2. \`lab-result-demo.jpg\`
   - patient : \`PATIENT DEMO 002\` ;
   - valeurs plausibles mais non rattachées à une personne ;
   - laboratoire fictif ;
   - une zone volontairement illisible pour démontrer \`warnings\`.

Chaque document doit afficher visiblement « SYNTHETIC DEMO — NOT A REAL MEDICAL RECORD ».

Les attentes d’extraction devront être enregistrées à côté des fichiers dans un JSON de test, sans dupliquer le fichier en base64.

Les deux fichiers sont générés de manière reproductible par `generate-fixtures.py`. Ils restent exclusivement synthétiques et ne doivent jamais être remplacés par des dossiers médicaux réels.
