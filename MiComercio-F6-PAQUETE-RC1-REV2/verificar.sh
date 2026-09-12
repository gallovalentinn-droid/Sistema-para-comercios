#!/usr/bin/env bash
# Verificación reproducible del candidato F6.
# Uso: bash verificar.sh

set -euo pipefail
cd "$(dirname "$0")"

MANIFIESTO='SHA256SUMS-F6.txt'
PRUEBAS_ESPERADAS=128
SUITES_SQL_ESPERADAS=16

echo '== 1. Integridad y cobertura =='
sha256sum -c "$MANIFIESTO" > /dev/null
echo "   hashes: $(wc -l < "$MANIFIESTO") archivos verificados"

en_disco="$(find . -type f ! -name "$MANIFIESTO" | sed 's|^\./||' | LC_ALL=C sort)"
en_manifiesto="$(cut -c 67- "$MANIFIESTO" | tr -d '\r' | LC_ALL=C sort)"
if [ "$en_disco" != "$en_manifiesto" ]; then
  echo 'ERROR: el manifiesto no describe exactamente el paquete.' >&2
  echo '-- en disco y sin listar:' >&2
  comm -23 <(printf '%s\n' "$en_disco") <(printf '%s\n' "$en_manifiesto") | sed 's/^/     /' >&2
  echo '-- listados y ausentes:' >&2
  comm -13 <(printf '%s\n' "$en_disco") <(printf '%s\n' "$en_manifiesto") | sed 's/^/     /' >&2
  exit 1
fi
echo '   cobertura: el manifiesto describe todo el paquete'

echo
echo '== 2. Sintaxis de los clientes =='
node -e '
const fs=require("fs"),vm=require("vm");
for(const p of ["entregables/MiComercio-F6-PRUEBA.html","entregables/MiComercio-Soporte-F6.html"]){
  const h=fs.readFileSync(p,"utf8"), a="<script>", i=h.indexOf(a), f=h.lastIndexOf("</script>");
  if(i<0||f<=i) throw new Error("no se encontró el script embebido: "+p);
  new vm.Script(h.slice(i+a.length,f),{filename:p});
  console.log("   sintaxis OK: "+p);
}'

echo
echo '== 3. Inventario SQL =='
mapfile -t suites_sql < <(find supabase/tests -maxdepth 1 -type f -name '*.test.sql' | LC_ALL=C sort)
if [ "${#suites_sql[@]}" -ne "$SUITES_SQL_ESPERADAS" ]; then
  echo "ERROR: se esperaban $SUITES_SQL_ESPERADAS suites SQL y se encontraron ${#suites_sql[@]}." >&2
  exit 1
fi
mapfile -t migraciones_f6 < <(find supabase/f6 -maxdepth 1 -type f -name '*.sql' | LC_ALL=C sort)
if [ "${#migraciones_f6[@]}" -ne 10 ]; then
  echo "ERROR: se esperaban 10 migraciones F6 y se encontraron ${#migraciones_f6[@]}." >&2
  exit 1
fi
echo "   inventario: ${#suites_sql[@]} suites SQL y ${#migraciones_f6[@]} migraciones F6"
echo '   ejecución SQL: externa; ver entregables/SQL-REPRODUCIBILIDAD-F6.md'

echo
echo '== 4. Pruebas locales e identidad =='
archivos=(tests/*.test.cjs tests/*.test.mjs)
salida="$(node --require "$(pwd)/tests/lib/fixed-vm-clock.cjs" --test "${archivos[@]}" 2>&1)" || {
  printf '%s\n' "$salida" | grep '^not ok' >&2 || true
  echo 'ERROR: la ejecución de pruebas falló.' >&2
  exit 1
}
pass=$(printf '%s\n' "$salida" | sed -n -E 's/^(#|ℹ)[[:space:]]+pass[[:space:]]+([0-9]+)[[:space:]]*$/\2/p' | tail -1)
fail=$(printf '%s\n' "$salida" | sed -n -E 's/^(#|ℹ)[[:space:]]+fail[[:space:]]+([0-9]+)[[:space:]]*$/\2/p' | tail -1)
if [ "${fail:-1}" != '0' ]; then
  echo "ERROR: ${fail:-?} pruebas fallaron." >&2
  exit 1
fi
if [ "${pass:-0}" != "$PRUEBAS_ESPERADAS" ]; then
  echo "ERROR: se esperaban $PRUEBAS_ESPERADAS pruebas y se ejecutaron ${pass:-0}." >&2
  exit 1
fi
echo "   pruebas: $pass/$PRUEBAS_ESPERADAS aprobadas en ${#archivos[@]} suites"

echo
echo '== 5. Búsqueda de secretos =='
if ! node verificacion/scan-secrets.cjs . "$MANIFIESTO" verificar.sh verificar.ps1; then
  echo 'ERROR: se detectaron posibles secretos de alto riesgo.' >&2
  exit 1
fi
echo '   secretos de alto riesgo: cero coincidencias'

echo
echo "== Verificación completa: $pass/$PRUEBAS_ESPERADAS =="
