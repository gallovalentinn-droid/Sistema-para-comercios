# MiComercio REV56 — arqueo de una caja física

## Por qué se cambió

En Kiosco de Ponce el efectivo de cigarrillos se separa al final del día. No existe una segunda caja física durante el turno. La configuración anterior repartía los cobros entre caja general y caja de cigarrillos y pedía contar ambos saldos; eso podía contar dos veces el mismo dinero.

El cierre del 27/09/2026 a las 06:21 muestra $159.530 de sobrante en general y $127.600 contados en cigarrillos. Con un único conteo de $682.000, las ventas en efectivo y egresos informados darían un esperado de $650.070 y una diferencia de $31.930, **si el fondo inicial era $0 y todos esos egresos salieron de la misma caja**. La cifra restante requiere conciliar fondo, gastos y dinero físicamente retirado. Ese cierre histórico no se reescribió.

## Cómo funciona desde REV56

- **Caja única:** ventas en efectivo de todos los rubros, cobros de fiado y egresos en efectivo forman un solo saldo esperado. El usuario cuenta el efectivo físico una sola vez.
- Las ventas de cigarrillos siguen visibles como dato de gestión. No se restan del efectivo ni se cuentan en otra caja.
- Al cerrar se elige cuánto queda para el próximo turno. Del monto retirado se puede informar opcionalmente cuánto se aparta para cigarrillos. Ese apartado es parte del retiro, no otro gasto.
- **Dos cajas físicas** queda disponible para comercios que realmente guardan y cuentan el dinero de cigarrillos en otra caja durante todo el turno. La configuración explica esa distinción.
- Pasar de dos cajas a una caja corrige también el turno abierto. Activar dos cajas espera al próximo turno para conservar una apertura coherente.
- Cada cierre nuevo registra su modelo de caja y el apartado. Los cierres anteriores conservan importes y significado originales.

## Archivos principales

- `beta/index.html`: cálculo, cierre guiado, historial, configuración y sincronización.
- `beta/sw.js` e `integrity-manifest.json`: identidad REV56 y caché nuevo.
- `REV56-CAJA-UNICA.sql`: columnas, validaciones y guardado atómico de los metadatos del cierre.
- `tests/beta-caja-unica-rev56.test.cjs`: escenarios de caja única, dos cajas, apartado y recuperación de datos.

## Verificación

- **Código:** la migración no actualiza cierres previos; el cierre nuevo exige consistencia entre conteo, retiro y apartado.
- **Local:** 226 pruebas de `tests/*.test.cjs` pasaron. `verificar.ps1` validó 18 archivos y no detectó secretos privados.
- **Base pública:** migración REV56 aplicada; se verificaron ambas columnas, ambas restricciones y la función privada. El cierre histórico consultado conserva $159.530 y $127.600 en sus campos originales.
- **Beta pública:** pendiente de comprobar tras la publicación de REV56. No se realizó un cierre real de prueba sobre el comercio del usuario.

## Uso en Kiosco de Ponce

Configuración → Caja → **Dos cajas físicas** debe estar apagado en ambos dispositivos. Una vez cargada REV56, el cierre pide un solo conteo. Si el dinero de cigarrillos se aparta al cerrar, anotar ese importe dentro del retiro; no registrarlo como egreso adicional.
