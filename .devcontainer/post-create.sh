#!/bin/bash
set +e

echo "Instalando dependencias del server..."
cd server && npm install
cd ..

echo "Instalando dependencias del client..."
cd client && npm install
cd ..

PATCH=".devcontainer/pending-feature.patch"
if [ -f "$PATCH" ]; then
  if git apply --check "$PATCH" 2>/dev/null; then
    git apply --index "$PATCH"
    echo "Patch aplicado: $PATCH (staged, sin commit)."
  elif git apply --reverse --check "$PATCH" 2>/dev/null; then
    echo "Patch ya aplicado previamente: $PATCH (se omite)."
  else
    echo "ADVERTENCIA: no se pudo aplicar $PATCH (no coincide con el árbol de trabajo actual)."
  fi
fi

set -e
echo "Environment ready."