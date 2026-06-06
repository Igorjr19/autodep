#!/usr/bin/env bash
# =============================================================================
# Prepara os artefatos empacotados pelo Tauri (engine.jar + JRE mínimo).
#
# Gera:
#   src-tauri/resources/engine.jar  -> fat JAR da engine (mvn package)
#   src-tauri/resources/jre/        -> runtime Java mínimo (jlink)
#
# O JRE gerado é para o SISTEMA OPERACIONAL onde este script roda. Para produzir
# o .exe Windows, rode em uma máquina Windows (ou no CI windows-latest) — use o
# prepare-bundle.ps1.
#
# Uso: ./scripts/prepare-bundle.sh
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENGINE_DIR="$(cd "$APP_DIR/../engine" && pwd)"
RES_DIR="$APP_DIR/src-tauri/resources"

# Módulos do JDK necessários para JavaParser + JGit + Gson em runtime.
# Conjunto deliberadamente generoso para evitar ClassNotFound durante o experimento.
MODULES="java.base,java.logging,java.naming,java.sql,java.xml,java.management,java.desktop,jdk.unsupported,jdk.crypto.ec,jdk.zipfs"

echo "==> Compilando a engine (mvn package)"
(cd "$ENGINE_DIR" && mvn -q -DskipTests package)

JAR="$(ls "$ENGINE_DIR"/target/structural-*-jar-with-dependencies.jar | head -1)"
echo "==> JAR da engine: $JAR"
mkdir -p "$RES_DIR"
cp "$JAR" "$RES_DIR/engine.jar"

echo "==> Gerando JRE mínimo com jlink"
rm -rf "$RES_DIR/jre"
jlink \
  --no-header-files \
  --no-man-pages \
  --strip-debug \
  --compress=zip-6 \
  --add-modules "$MODULES" \
  --output "$RES_DIR/jre"

echo "==> Bundle pronto em: $RES_DIR"
du -sh "$RES_DIR/jre" "$RES_DIR/engine.jar"
