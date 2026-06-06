# =============================================================================
# Monta a versao PORTATIL do AutoDep (roda de pendrive, sem instalar).
#
# Pre-requisito: ter rodado 'prepare-bundle.ps1' e 'pnpm tauri build' antes,
# de modo que existam:
#   src-tauri\target\release\<app>.exe
#   src-tauri\resources\engine.jar  e  src-tauri\resources\jre\
#
# Gera: app\dist-portable\AutoDep-portable.zip  (descompacte e rode o .exe)
# Uso (a partir de autodep\app): powershell -ExecutionPolicy Bypass -File scripts\make-portable.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir    = Resolve-Path (Join-Path $ScriptDir "..")
$Release   = Join-Path $AppDir "src-tauri\target\release"
$Res       = Join-Path $AppDir "src-tauri\resources"
$Out       = Join-Path $AppDir "dist-portable"
$Pkg       = Join-Path $Out "AutoDep"

$Exe = Get-ChildItem $Release -Filter "*.exe" |
  Where-Object { $_.Name -notlike "*setup*" -and $_.Name -notlike "*uninstall*" } |
  Select-Object -First 1
if (-not $Exe) {
  throw "Executavel nao encontrado em $Release. Rode 'pnpm tauri build' antes."
}
if (-not (Test-Path (Join-Path $Res "engine.jar"))) {
  throw "resources\engine.jar nao encontrado. Rode 'prepare-bundle.ps1' antes."
}

if (Test-Path $Out) { Remove-Item -Recurse -Force $Out }
New-Item -ItemType Directory -Force -Path $Pkg | Out-Null

Copy-Item $Exe.FullName (Join-Path $Pkg $Exe.Name) -Force
Copy-Item $Res (Join-Path $Pkg "resources") -Recurse -Force
# Remove o placeholder de desenvolvimento do pacote final.
Remove-Item (Join-Path $Pkg "resources\README.txt") -ErrorAction SilentlyContinue

$Zip = Join-Path $Out "AutoDep-portable.zip"
Compress-Archive -Path (Join-Path $Pkg "*") -DestinationPath $Zip -Force

Write-Host "==> Portatil gerado: $Zip"
Write-Host "    Conteudo: $($Exe.Name) + resources\ (engine.jar + jre\)"
