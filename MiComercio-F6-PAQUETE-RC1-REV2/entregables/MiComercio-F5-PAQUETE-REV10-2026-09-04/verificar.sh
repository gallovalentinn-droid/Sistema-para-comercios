#!/usr/bin/env bash
# Verificación reproducible del paquete F5.
#
# Uso:  bash verificar.sh
#
# Falla cerrado. Un manifiesto truncado, un archivo no listado, una suite
# borrada o un conteo de pruebas distinto del esperado abortan con error.
# La versión anterior no lo hacía: con el manifiesto recortado a 3 líneas y una
# suite eliminada, salía con éxito e imprimía "53/53" igual. Un verificador que
# anuncia un número que no midió es peor que no tener verificador.
#
# No cubre las suites SQL: requieren conexión al proyecto QA y se ejecutan
# aparte (ver QA-F5-EVIDENCIA.md).

set -euo pipefail
cd "$(dirname "$0")"

MANIFIESTO='SHA256SUMS-F5.txt'
PRUEBAS_ESPERADAS=62   # gate: 53 rev7 + 4 config/proyección + 3 IP + 2 identidad

echo "== 1. Integridad de artefactos =="

# 1a. Los hashes listados coinciden.
sha256sum -c "$MANIFIESTO" > /dev/null
echo "   hashes: $(wc -l < "$MANIFIESTO") archivos verificados"

# 1b. El manifiesto cubre exactamente el contenido del paquete.
#     Sin esto, recortar el manifiesto reduce la cobertura sin que nada avise.
en_disco="$(find . -type f ! -name "$MANIFIESTO" | sed 's|^\./||' | LC_ALL=C sort)"
# tr -d '\r': el manifiesto se regenera en Windows y vuelve con CRLF.
# sha256sum -c lo tolera desde coreutils 9.x, esta comparacion no.
en_manifiesto="$(cut -c 67- "$MANIFIESTO" | tr -d '\r' | LC_ALL=C sort)"

if [ "$en_disco" != "$en_manifiesto" ]; then
  echo "ERROR: el manifiesto no describe el paquete." >&2
  echo "-- en disco y sin listar:" >&2
  comm -23 <(echo "$en_disco") <(echo "$en_manifiesto") | sed 's/^/     /' >&2
  echo "-- listados y ausentes:" >&2
  comm -13 <(echo "$en_disco") <(echo "$en_manifiesto") | sed 's/^/     /' >&2
  exit 1
fi
echo "   cobertura: el manifiesto describe todo el paquete"

echo
echo "== 2. Sintaxis del artefacto cliente =="
node -e '
const fs=require("fs"), vm=require("vm");
const p="entregables/MiComercio-F5-PRUEBA.html";
const html=fs.readFileSync(p,"utf8");
const abre="<script>";
const ini=html.indexOf(abre), fin=html.lastIndexOf("</script>");
if(ini<0||fin<=ini) throw new Error("no se encontró el script embebido");
const js=html.slice(ini+abre.length,fin);
new vm.Script(js,{filename:p});
console.log("   sintaxis OK ("+js.split("\n").length+" líneas de JS)");
'

echo
echo "== 3. Pruebas locales =="

archivos=(tests/*.test.cjs tests/*.test.mjs)
salida="$(node --test "${archivos[@]}" 2>&1)" || { printf '%s\n' "$salida" | grep '^not ok' >&2 || true; echo "ERROR: la ejecución de pruebas falló." >&2; exit 1; }

# Node puede usar el prefijo TAP "#" o el prefijo visual "ℹ" según el reporter.
pass=$(printf '%s\n' "$salida" | sed -n -E 's/^(#|ℹ)[[:space:]]+pass[[:space:]]+([0-9]+)[[:space:]]*$/\2/p' | tail -1)
fail=$(printf '%s\n' "$salida" | sed -n -E 's/^(#|ℹ)[[:space:]]+fail[[:space:]]+([0-9]+)[[:space:]]*$/\2/p' | tail -1)

if [ "${fail:-1}" != "0" ]; then
  echo "ERROR: ${fail:-?} pruebas fallaron." >&2
  exit 1
fi

# El conteo es parte del gate: si baja, alguien borró cobertura.
if [ "${pass:-0}" != "$PRUEBAS_ESPERADAS" ]; then
  echo "ERROR: se esperaban $PRUEBAS_ESPERADAS pruebas y se ejecutaron ${pass:-0}." >&2
  echo "       Si el cambio de cobertura es deliberado, actualizá PRUEBAS_ESPERADAS." >&2
  exit 1
fi
echo "   pruebas: $pass/$PRUEBAS_ESPERADAS aprobadas en ${#archivos[@]} suites"

echo
echo "== Verificación completa: $pass/$PRUEBAS_ESPERADAS =="
