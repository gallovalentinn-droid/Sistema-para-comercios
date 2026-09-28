# MiComercio REV60 — Caja más clara

## Cambios

- En la separación de cigarrillos del cierre, la ayuda debajo del importe muestra únicamente las ventas de cigarrillos cobradas en efectivo durante el turno.
- «Ver todos» ahora amplía la misma lista de movimientos y permite volver a los últimos cinco. Cuando hay cinco o menos, todos ya están visibles y el botón no aparece.
- Se quitó el segundo listado completo de movimientos y el bloque repetido «Cobros por forma de pago». La barra de «Vendido en el turno» conserva efectivo, transferencia/QR, tarjeta y fiado.
- La búsqueda, anulación de ventas y revisión de egresos siguen disponibles en «Más datos y correcciones», cerrado de forma predeterminada. Los totales extra del turno también quedaron allí.
- Se corrigió el anidamiento de tarjetas de la vista para que pagos, movimientos y correcciones sean secciones independientes.
- Identidad del HTML, caché del service worker y manifiesto alineados en REV60.

## Verificación

- **En código:** no cambiaron los cálculos de caja ni los datos de comercios.
- **Localmente:** 250 pruebas, integridad y sintaxis correctas. Navegador con datos sintéticos: tres modos de caja, lista corta y larga, expansión/contracción, búsqueda y acciones de corrección, texto de cigarrillos y vista móvil sin desborde.
- **Entorno público:** la beta sirvió `packageRevision:60` y el service worker `micomercio-beta-6.0.0-f6-rc2-rev60` en lecturas sin caché. El HTML publicado contiene el nuevo control de movimientos y ya no contiene «Usalo como referencia». El recorrido autenticado de Caja no se repitió con datos reales en público; los tres modos se comprobaron localmente con datos sintéticos.
