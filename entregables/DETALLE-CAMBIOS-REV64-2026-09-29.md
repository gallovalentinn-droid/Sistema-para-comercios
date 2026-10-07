# MiComercio REV64 — revisión de la auditoría REV63

Fecha: 29/09/2026.

La auditoría adjunta se trató como evidencia para contrastar con el código. Esta revisión corrige los hallazgos reproducibles sin modificar datos de comercios. REV64 se publicó en la beta el 29/09/2026.

## Cambios

- **A1, cobro y lector:** un código de barras en el campo «Con cuánto paga» ya no dispara el cobro con Enter ni habilita «Cobrar». Si corresponde a un producto del catálogo, se cierra el diálogo de pago y se suma al ticket para revisar el nuevo total. Si parece un código desconocido, se informa al cajero y se mantiene el cobro bloqueado. La validación se repite al guardar la venta para evitar que otra acción omita la protección. El ingreso normal de efectivo y el cálculo del vuelto se conservan.
- **M1, sesión cerrada al abrir turno:** la apertura muestra «Volver a ingresar» cuando la sesión local está cerrada o la consulta devuelve `42501`/`PGRST301`. Los fallos generales de red mantienen «Reintentar consulta». El ingreso vuelve a usar el cierre de sesión local existente.
- **B1, pruebas históricas:** las pruebas de navegador de REV60 y REV61 ahora comprueban los controles vigentes, sin depender de textos o posiciones que cambiaron deliberadamente en REV62/63.
- **B3, apartado de cigarrillos:** si se intenta apartar más efectivo del retiro, el mensaje muestra ambos importes y explica qué valor corregir. La regla contable no cambió.
- Se agregó una prueba de navegador para el lector con pago abierto y se ajustaron las pruebas de código, la identidad REV64, la caché y el manifiesto de integridad.

## Hallazgos que no requieren cambio de código en esta revisión

- **M2, criterio de cigarrillos:** se mantiene la decisión ya aprobada de sugerir lo cobrado por todos los medios, excluyendo fiado. La pantalla de cierre lo indica, desglosa efectivo, transferencia/QR y tarjeta, y exige confirmar el efectivo realmente apartado. La sugerencia no se contabiliza como efectivo adicional.
- **A2, conciliación de datos reales:** una consulta propia de solo lectura a Supabase, a las 10:04 de Argentina, confirmó **17 excepciones en `requiere_conciliacion`, una sesión abierta y tres sesiones en revisión** para el comercio identificado en la auditoría. La última venta recibida fue a las 09:45:53; llegaron tres ventas desde la hora de referencia del informe. No se modificaron registros. Resolver las excepciones requiere contrastar cada cierre con las ventas y los datos locales de los dispositivos, y conciliar sin inventar movimientos.
- **B2, publicación:** se subieron REV62, REV63 y REV64 a `main` y se comprobó que `micomercio.ar/beta` sirve REV64.

## Verificación

- **Código:** la identidad de `beta/index.html`, `beta/sw.js`, el manifiesto y las expectativas de las pruebas corresponden a REV64.
- **Local:** 269/269 pruebas de código aprobadas; el verificador de integridad confirmó 20 archivos y no detectó secretos privados; prueba de navegador REV64 aprobada para lectura de código, cobro normal y apertura con sesión cerrada; recorridos REV62 y REV63 aprobados a 1366 y 390 píxeles. Las pruebas históricas de REV60/61 también se actualizaron y ejecutaron.
- **Entorno público:** `beta/index.html` y `beta/sw.js` se descargaron sin caché y sus hashes SHA-256 coincidieron exactamente con los archivos locales probados. Un navegador aislado abrió la página pública REV64 con datos ficticios y el backend bloqueado: al escanear un producto con el cobro abierto no se registró una venta y el producto entró al ticket. Esta prueba no modificó datos de producción. El estado de conciliación indicado arriba se verificó directamente en la base de datos de producción mediante consultas de solo lectura.

## Archivos principales

- `beta/index.html`: cobro, apertura de turno y mensaje de apartado.
- `beta/sw.js` e `integrity-manifest.json`: identidad y hashes de REV64.
- `tests/` y `entregables/pruebas-navegador-REV64/qa.cjs`: regresiones.
- `entregables/pruebas-navegador-REV60/caja.cjs` y `entregables/pruebas-navegador-REV61/sesion-y-caja.cjs`: expectativas actualizadas.
