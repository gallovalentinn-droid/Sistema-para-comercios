# MiComercio — corrección de recuperación de ventas, REV44

**Fecha:** 25/09/2026. **Beta:** https://micomercio.ar/beta/
**Código:** `3d1ccaf` en `main`.

## Evidencia recibida

La captura muestra “No pudimos abrir el comercio”, 667 productos activos y 0 ventas. El reloj de la captura marca las 15:14 (Argentina). REV43 se registró a las 15:30, por lo que esa captura corresponde a una versión anterior. La consulta de solo lectura al servidor encontró 669 productos no eliminados, 356 ventas y 3 cierres del comercio; no hay indicio de un borrado de esos registros.

Los registros de acceso de la cuenta alrededor de las 15:14 muestran consultas de productos y ventas respondidas por el servidor. La pantalla anterior atribuía cualquier error de apertura a la conexión, incluso cuando el problema ocurría al procesar datos en el navegador.

## Corrección en REV44

1. REV43 posponía la comprobación de registros faltantes si existía cualquier operación local sin confirmar. Eso podía mantener las ventas en 0 aunque ya estuvieran confirmadas en el servidor. REV44 hace la comparación incluso con operaciones pendientes; el pull existente difiere por fila los maestros con cambios locales para conservarlos.
2. Cuando faltan ventas, REV44 reinicia los cursores de los flujos operativos relacionados y vuelve a procesarlos en su orden causal. Reutiliza los identificadores de cada registro para evitar duplicados y recalcula los derivados. Los productos completos conservan su cursor, de modo que recuperar ventas no obliga a descargar de nuevo todo el catálogo.
3. Si la apertura falla por una causa interna, la pantalla deja de llamarla error de conexión y muestra una referencia técnica breve. La referencia permite identificar la etapa que falló sin exponer credenciales.
4. HTML, service worker, manifiesto de integridad y pruebas identifican la REV44.

## Verificación

- **En código:** la corrección no borra ni modifica registros comerciales en Supabase.
- **Localmente:** 167 de 167 pruebas aprobadas; script del HTML válido; integridad correcta de 14 archivos. Las regresiones nuevas cubren ventas faltantes con un envío pendiente, cursores separados para maestros y operaciones, y un error interno de apertura presentado con referencia.
- **Entorno público:** `beta/index.html` y `beta/sw.js` entregan REV44 y sus SHA-256 coinciden exactamente con los archivos probados. Esta sesión no puede reproducir la carga autenticada desde los dos dispositivos del comercio.

Para probar la versión publicada, recargar `https://micomercio.ar/beta/` en ambos equipos y esperar la recuperación antes de operar la caja. No borrar datos del navegador. Si aparece otro error, registrar la referencia que se ve debajo del mensaje y la hora.
