param(
  [string]$Destination = 'C:\wp'
)

$ErrorActionPreference = 'Stop'
$source = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = [System.IO.Path]::GetFullPath($Destination)
$targetRoot = [System.IO.Path]::GetPathRoot($target)

if ($target -eq $source -or $target -eq $targetRoot) {
  throw "Destination de miroir non sûre : $target"
}

New-Item -ItemType Directory -Path $target -Force | Out-Null

& robocopy $source $target /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP `
  /XD .git node_modules .pnpm-store .expo dist build .cxx .codex-remote-attachments `
  /XF .env .env.local

$robocopyCode = $LASTEXITCODE
if ($robocopyCode -ge 8) {
  throw "La synchronisation vers $target a échoué (robocopy $robocopyCode)."
}

Write-Output "Sources synchronisées vers $target sans suppression des fichiers du miroir."
exit 0
