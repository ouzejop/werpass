# Dépannage reproductible

## Build Android silencieux ou bloqué sous Windows

Le chemin complet du monorepo dépasse la limite CMake pour certains objets de `expo-modules-core`. Le dépôt Git canonique reste `C:\Users\user\Documents\Projects\WerPass`, mais la compilation Android validée utilise le miroir court `C:\wp`.

Synchroniser le miroir avant chaque compilation :

```powershell
Set-Location C:\Users\user\Documents\Projects\WerPass
.\scripts\sync-windows-mirror.ps1
Set-Location C:\wp
corepack pnpm android
```

`C:\wp` ne contient pas `.git` et ne doit pas devenir une deuxième source de vérité. Le script copie sans supprimer, exclut les caches/builds et préserve `.env`/`.env.local`. Le 18 juillet, `app:assembleDebug` a réussi dans ce miroir et a produit `C:\wp\apps\mobile\android\app\build\outputs\apk\debug\app-debug.apk`.

Si le Development Build affiche une ancienne interface malgré un nouvel APK, arrêter l’ancien Metro avec `Ctrl+C`, puis relancer depuis `C:\wp` avec `corepack pnpm android`. Le menu développeur « Reload » force ensuite le chargement du bundle courant.

## `pnpm` non reconnu

Le dépôt déclare pnpm 11.9.0 via Corepack. Le correctif permanent consiste à activer le shim Windows dans un dossier utilisateur. Cette variante évite les droits administrateur et le wrapper PowerShell `pnpm.ps1`, qui peut être bloqué par la politique d’exécution :

```powershell
# Une seule fois, dans PowerShell
$pnpmShimDir = "$env:LOCALAPPDATA\pnpm"
$pnpmCmdDir = "$env:LOCALAPPDATA\pnpm-cmd"
New-Item -ItemType Directory -Force -Path $pnpmCmdDir | Out-Null
corepack enable pnpm --install-directory $pnpmShimDir
Copy-Item "$pnpmShimDir\pnpm.cmd" "$pnpmCmdDir\pnpm.cmd" -Force
$userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
$userPathParts = @($userPath -split ';' | Where-Object { $_ -and $_ -ne $pnpmCmdDir })
[Environment]::SetEnvironmentVariable('Path', (($pnpmCmdDir + $userPathParts) -join ';'), 'User')

# Fermer et rouvrir PowerShell après cette étape
pnpm --version
```

Depuis la racine du dépôt :

```powershell
pnpm install
pnpm android
```

Si les droits administrateur ne sont pas disponibles, le fonctionnement reste possible sans shim global :

```powershell
corepack pnpm --version
corepack pnpm install
corepack pnpm android
```

Si le terminal courant n’a pas encore rechargé le `PATH`, utiliser temporairement `pnpm.cmd` ou ouvrir un nouveau terminal.

Si `corepack enable` nécessite des droits indisponibles, utiliser ponctuellement le wrapper CMD :

```powershell
npx.cmd --yes pnpm@11.9.0 install
npx.cmd --yes pnpm@11.9.0 android
```

Toujours vérifier le chemin avec `Get-Location`. `W:\` n’existe que si `subst W: ...` a été exécuté dans la session ; la procédure actuelle utilise `C:\wp` et n’en dépend pas.

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

## SQLite standard et Expo Dev Client

Le Hackathon MVP utilise SQLite standard dans `apps/mobile/app.json`. Les fichiers et métadonnées médicales restent chiffrés par l’application avant d’être écrits dans SQLite. Utiliser `pnpm --filter @werpass/mobile android` ou un development build EAS pour la démonstration.

### `file is not a database`

Cette erreur indique généralement qu’Android a conservé/restauré une ancienne base SQLite ou une base chiffrée dont la clé SecureStore n’existe plus. L’APK actuel désactive `allowBackup` et détecte cette incompatibilité.

1. charger le bundle courant depuis Metro ;
2. attendre l’écran « Coffre local incompatible » ;
3. appuyer sur « Réinitialiser le coffre local » ;
4. confirmer uniquement si la suppression irréversible des documents locaux de cette installation est acceptable ;
5. recréer le compte patient et le PIN de quatre chiffres.

Ne pas supprimer automatiquement la base et ne pas tenter une migration avec une clé inconnue. Si la réinitialisation confirmée échoue encore, relever l’erreur avant d’utiliser `adb shell pm clear com.werpass.demo`, car cette dernière commande efface toutes les données locales de l’application.

## Téléchargement Gradle inaccessible

La préconstruction Android peut réussir puis `gradlew assembleDebug` échouer avant la compilation avec un `SocketTimeoutException` sur `services.gradle.org` ou `downloads.gradle.org`. Ce message signifie que la distribution Gradle n’est pas encore présente dans le cache et que le réseau bloque sa récupération ; il ne signale pas une erreur SQLite ou React Native.

Vérifier d’abord l’accès HTTPS au domaine depuis le réseau utilisé, puis relancer :

```powershell
Set-Location apps/mobile
npx.cmd expo prebuild --platform android --no-install
Set-Location android
.\gradlew.bat assembleDebug
```

Ne pas désactiver le chiffrement applicatif pour faire passer le build. Si le réseau d’entreprise bloque Gradle, utiliser un réseau autorisé ou un cache Gradle approuvé.
