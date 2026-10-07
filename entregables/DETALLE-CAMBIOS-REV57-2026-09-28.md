# MiComercio REV57 — caja única con separación de cigarrillos

## Qué cambió

- En **Configuración → Caja** hay tres opciones claras: una sola caja, una sola caja que separa cigarrillos al cerrar, y dos cajas físicas. Cada opción explica cuándo corresponde usarla.
- El modo **una caja que separa cigarrillos** cuenta todo el efectivo una sola vez. Al cerrar, pide indicar cuánto queda para el turno siguiente y cuánto del retiro real se aparta para cigarrillos. El monto apartado puede ser $0, pero debe escribirse expresamente. Las ventas de cigarrillos cobradas en efectivo aparecen solo como referencia.
- El resumen del cierre muestra tres importes que suman el efectivo contado: apartado para cigarrillos, otros retiros y dinero que queda en caja. El apartado forma parte del retiro; no se descuenta otra vez del arqueo.
- El historial y el resumen para WhatsApp identifican los cierres hechos en este modo. La preferencia se sincroniza entre dispositivos y el cierre conserva el modo en que fue realizado.
- Para ver REV57 en ambos dispositivos, recargá la beta. Si una pestaña quedó abierta desde REV56, cerrala y volvé a entrar para que el navegador actualice el caché.
- No se modificaron los importes ni el modelo de los cierres anteriores. El modo de dos cajas físicas sigue disponible para comercios que realmente separan y cuentan dos fondos durante todo el turno.

## Ejemplo del caso revisado

Con $673.970 de ventas en efectivo y $8.030 de fondo inicial, el sistema espera $682.000. Si se cuentan $682.000, la diferencia es $0. Si de ese efectivo se apartan $159.530 para cigarrillos, el retiro restante es $522.470 cuando se retira todo. Los $159.530 no se restan dos veces.

## Archivos

- `beta/index.html`: configuración, guía de cierre, desglose, historial y sincronización.
- `beta/sw.js` e `integrity-manifest.json`: identidad y caché REV57.
- `REV57-MODOS-CAJA-CIGARRILLOS.sql`: preferencia compartida, validaciones de cierres y proyección de configuración.
- `tests/beta-caja-modos-rev57.test.cjs` y pruebas existentes actualizadas: modos, sincronización, validación, desglose e interfaz de cierre.

## Verificaciones

- **Código y pruebas locales:** suite completa de Node, sintaxis de los tres scripts, verificación de integridad de 19 archivos y `git diff --check`: correctos. La prueba de interfaz usa el ejemplo numérico anterior y exige escribir el apartado antes de habilitar el cierre.
- **Base pública:** migración REV57 aplicada; se comprobaron la columna, las tres restricciones nuevas y la proyección de sincronización. La preferencia quedó activada para Kiosco de Ponce con una sola caja física.
- **Beta pública:** `beta/index.html` y `beta/sw.js` se descargaron de `micomercio.ar` y sus SHA-256 coinciden exactamente con los archivos locales REV57.

No se creó un cierre real de producción: requiere que el comerciante cuente su efectivo. La herramienta visual no tuvo acceso a un navegador de esta sesión; la verificación pública se basó en los archivos servidos y la base, y la interacción se probó localmente.
