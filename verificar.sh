#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
node tools/verificar-integridad.cjs
