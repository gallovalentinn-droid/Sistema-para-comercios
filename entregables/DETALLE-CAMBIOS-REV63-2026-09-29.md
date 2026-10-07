# MiComercio REV63 — separación de cigarrillos al cerrar la caja

Fecha: 29/09/2026.

## Qué cambia

- En **Configuración → Caja**, el modo **Una caja · separo cigarrillos al cerrar** cuenta una sola caja física. Al cerrar, muestra una sugerencia con las ventas de cigarrillos ya cobradas por efectivo, transferencia, QR o tarjeta.
- Los pagos combinados se distribuyen proporcionalmente entre sus medios de pago. El fiado pendiente no entra en la sugerencia. Los cobros posteriores de fiado no se pueden atribuir automáticamente a los productos originales; el operador puede ajustar el efectivo realmente apartado.
- En el último paso del cierre se registra el **efectivo real** separado, incluso $0. El botón **Usar sugerencia** facilita cargarlo, sin superar el efectivo contado. Si la sugerencia es mayor que el efectivo disponible, se muestra la diferencia.
- Al elegir **Dejo plata**, se propone automáticamente lo contado menos lo apartado para cigarrillos. El importe que queda puede modificarse si también hubo otros retiros.
- La separación es parte del retiro total ya existente. El arqueo compara todo el efectivo contado con el efectivo esperado **antes** de apartarlo. Las transferencias y tarjetas nunca se suman como efectivo ni se descuentan dos veces.
- La configuración de **dos cajas físicas** y la de **una sola caja sin separación** conservan su lógica.

## Ejemplo

Con $50.000 al abrir y una venta de $1.000 ($600 de cigarrillos), pagada con $400 en efectivo y $600 por QR, el efectivo esperado es $50.400. La sugerencia para cigarrillos es $600. Si se cuentan $50.400 y se apartan $600, quedan $49.800 para el próximo turno, sin sobrante artificial.

## Verificación

- **Código:** `beta/index.html`, identidad REV63 en `beta/sw.js`, pruebas e `integrity-manifest.json` alineados. No hay migraciones SQL ni cambios al formato guardado de los cierres.
- **Local:** 265 pruebas automatizadas aprobadas; verificador de integridad correcto para 20 archivos. Recorrido con datos de prueba en Chrome a 1366 y 390 px: sugerencia, arqueo, resto y ausencia de desborde. También se verificó el aviso cuando la sugerencia supera el efectivo contado.
- **Entorno público:** esta revisión no fue publicada ni se probó en una cuenta real. La verificación pública queda pendiente para después de desplegar el ZIP.

## Uso

Elegí el modo **Una caja · separo cigarrillos al cerrar** en Configuración → Caja. Al cerrar, contá todo el efectivo una vez, revisá el resultado, indicá cuánto apartás realmente para cigarrillos y elegí cuánto queda para el turno siguiente. El importe que apartás puede diferir de la sugerencia.
