# MiComercio — entrega REV55

**Base recibida:** `MiComercio-Sistema-Completo-REV54-2026-09-26.zip` (SHA-256 `86ce68113aba9c5db30456259d75d25a826477dfc41674c218ac9179beee7add`).

## Cambios

1. **Lector de facturas en celulares angostos.** Se corrigió el desborde horizontal a 320 px. El campo de búsqueda y los botones de cantidad ahora se ajustan al ancho disponible. Se conservan el diseño de tarjetas y los pasos para volver de REV54.
2. **Caja.** Se aplicó `REV52-CAJA-TRASPASO.sql`: registra cuánto efectivo se retira y cuánto queda para la próxima apertura, junto con el conteo, la diferencia y el responsable. Si la referencia al último cierre cambió o fallan los metadatos adicionales, la operación principal no se revierte; queda una alerta para revisión.
3. **Promociones.** Se aplicó `REV53-PROMOCIONES-CANTIDAD.sql`: permite reglas «Llevá N y pagá M» del mismo producto, con N mayor que M. Los descuentos porcentuales normales siguen exigiendo más de 0 % y hasta 100 %.
4. **Respaldo previo.** Antes de esas migraciones se guardaron en `private.rev55_predeploy_snapshot` las 10 filas de cierres, 23 segmentos, 1 promoción, las dos funciones reemplazadas y la restricción anterior. No se incluyeron datos comerciales en el ZIP; la tabla privada no puede leerse con los roles `anon` ni `authenticated`.
5. **Identidad de publicación.** La aplicación, el caché y el manifiesto de integridad avanzaron juntos a REV55.

## Verificación

- **Código:** el ZIP REV54 se comprobó sin rutas peligrosas, duplicados ni errores de integridad. Los archivos de la nueva entrega mantienen el manifiesto de 17 archivos sin secretos privados detectados.
- **Local:** 221 de 221 pruebas; navegador Chromium en 1366, 390 y 320 px. El caso de 320 px falló antes de la corrección (`scrollWidth 307`, `clientWidth 288`) y pasó después (`288/288`). A 1366 y 390 px, la revisión y la carga de factura no desbordan y no registraron errores de página.
- **Base pública:** las migraciones figuran aplicadas. La consulta de último traspaso existe, la nueva restricción de promociones está activa y el acceso anónimo a las funciones nuevas está revocado. Ninguno de los 10 cierres históricos recibió un saldo de traspaso inventado.
- **Web pública:** pendiente de comprobar tras la publicación de los archivos.

## Conciliación pendiente

Los seis cierres del comercio afectado continúan en estado `requiere_conciliacion`. No se alteraron sus importes ni se asignó efectivo a la próxima caja. Para resolver ese historial hace falta contar el efectivo real de caja general y, si corresponde, de cigarrillos. Una apertura nueva debe pedir ese conteo explícito.

## Orden aplicado

1. `REV55-RESPALDO-PREVIO.sql`
2. `REV52-CAJA-TRASPASO.sql`
3. `REV53-PROMOCIONES-CANTIDAD.sql`
4. Publicación conjunta de `beta/index.html` y `beta/sw.js`
