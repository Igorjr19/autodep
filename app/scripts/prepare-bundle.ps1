# =============================================================================
# Prepara os artefatos empacotados pelo Tauri (engine.jar + JRE minimo) no Windows.
#
# Gera:
#   src-tauri\resources\engine.jar  -> fat JAR da engine (mvn package)
#   src-tauri\resources\jre\        -> runtime Java minimo (jlink, para Windows)
#
# Pre-requisitos: JDK 22+ (jlink/jdeps no PATH) e Maven (mvn no PATH).
# Uso (a partir de autodep\app):  powershell -ExecutionPolicy Bypass -File scripts\prepare-bundle.ps1
# =============================================================================
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppDir    = Resolve-Path (Join-Path $ScriptDir "..")
$EngineDir = Resolve-Path (Join-Path $AppDir "..\engine")
$ResDir    = Join-Path $AppDir "src-tauri\resources"

# Modulos do JDK necessarios para JavaParser + JGit + Gson em runtime.
$Modules = "java.base,java.logging,java.naming,java.sql,java.xml,java.management,java.desktop,jdk.unsupported,jdk.crypto.ec,jdk.zipfs"

Write-Host "==> Compilando a engine (mvn package)"
Push-Location $EngineDir
try { mvn -q -DskipTests package } finally { Pop-Location }

$Jar = Get-ChildItem (Join-Path $EngineDir "target") -Filter "structural-*-jar-with-dependencies.jar" | Select-Object -First 1
Write-Host "==> JAR da engine: $($Jar.FullName)"
New-Item -ItemType Directory -Force -Path $ResDir | Out-Null
Copy-Item $Jar.FullName (Join-Path $ResDir "engine.jar") -Force

Write-Host "==> Gerando JRE minimo com jlink"
$JreDir = Join-Path $ResDir "jre"
if (Test-Path $JreDir) { Remove-Item -Recurse -Force $JreDir }
jlink `
  --no-header-files `
  --no-man-pages `
  --strip-debug `
  --compress=zip-6 `
  --add-modules $Modules `
  --output $JreDir

Write-Host "==> Bundle pronto em: $ResDir"
