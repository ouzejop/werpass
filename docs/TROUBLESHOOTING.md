# Dépannage reproductible

## Installation Expo bloquée sous PowerShell

### Symptômes observés

- `npx expo ...` reste bloqué ou échoue avec `PSSecurityException` ;
- PowerShell indique que `npx.ps1` ou `npm.ps1` ne peut pas être chargé car l’exécution de scripts est désactivée ;
- `expo install` ne peut pas déterminer le SDK si le paquet `expo` n’est pas encore présent ;
- pnpm peut demander de recréer `node_modules` puis abandonner avec `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`.

### Cause

Windows résout parfois `npx` vers le wrapper PowerShell `npx.ps1`. La politique d’exécution locale peut interdire ce wrapper alors que l’exécutable `npx.cmd` reste autorisé. Le dépôt utilisait aussi un champ `packageManager` différent de la version pnpm réellement disponible, ce qui provoquait des relinks répétés.

### Procédure sûre

Ne pas désactiver ni assouplir la politique PowerShell. Depuis la racine du dépôt :

```powershell
pnpm --version
pnpm install
Set-Location apps/mobile
npx.cmd expo install --check
```

Pour un bootstrap sans paquet Expo installé, respecter cet ordre :

```powershell
pnpm add expo --filter @werpass/mobile
Set-Location apps/mobile
npx.cmd expo install expo-crypto expo-secure-store expo-sqlite expo-file-system expo-document-picker react react-native
```

En environnement non interactif, définir `CI=true` uniquement pour l’installation :

```powershell
$env:CI='true'
pnpm install
Remove-Item Env:CI
```

Le champ `packageManager` de `package.json` doit rester aligné sur la version utilisée dans le dépôt. Après toute modification des dépendances :

```powershell
npx.cmd expo install --check
pnpm verify
```

## SQLCipher et Expo Go

Le coffre active `useSQLCipher` dans `apps/mobile/app.json`. Expo Go ne contient pas cette configuration native : utiliser `pnpm --filter @werpass/mobile android` ou un development build EAS. Une erreur d’initialisation du coffre dans Expo Go est attendue et ne doit jamais conduire à désactiver le chiffrement.

## Téléchargement Gradle inaccessible

La préconstruction Android peut réussir puis `gradlew assembleDebug` échouer avant la compilation avec un `SocketTimeoutException` sur `services.gradle.org` ou `downloads.gradle.org`. Ce message signifie que la distribution Gradle n’est pas encore présente dans le cache et que le réseau bloque sa récupération ; il ne signale pas une erreur SQLCipher ou React Native.

Vérifier d’abord l’accès HTTPS au domaine depuis le réseau utilisé, puis relancer :

```powershell
Set-Location apps/mobile
npx.cmd expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat assembleDebug
```

Ne pas désactiver SQLCipher pour faire passer le build. Si le réseau d’entreprise bloque Gradle, utiliser un réseau autorisé ou un cache Gradle approuvé.
