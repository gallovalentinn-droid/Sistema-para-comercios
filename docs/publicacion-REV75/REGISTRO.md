# Publicación REV75 — 30/09/2026

Autorización del usuario: «publica el rev, asi empiezo a cargar facturas reales».

- Paquete: `MiComercio-Sistema-Completo-REV75-2026-09-30.zip`.
- SHA256 del ZIP: `7ff13b7ee43295a0ce9438afd0724b487ca8a815f95a1528ecc5fdc5a6be02a4`.
- Commit de publicación: `deece9be1e64c8cea57315e82adb022082c8aa20`, sobre REV69 `b20988e`.
- GitHub Pages: [despliegue exitoso](https://github.com/gallovalentinn-droid/Sistema-para-comercios/actions/runs/36792354913).
- Beta: https://micomercio.ar/beta/.

## Verificado en código y localmente

333/333 pruebas locales de `tests/*.test.cjs`, manifiesto de 25/25 archivos y recorrido del lector de 13 pasos en Chromium sin errores. El recorrido sustituye Gemini y Supabase por simulaciones; no representa una lectura real de IA.

HTML y service worker se integraron juntos desde el paquete; no se modificó el comportamiento de REV75 durante la publicación. La limitación P3 del generador de mutaciones descrita en la auditoría no modifica el producto publicado.

## Verificado en el entorno público

HTML público con `packageRevision:75`, SHA256 `060066853da5838fe8eaf2e9206c4e41518c991980bd41b86049a41ac2d5c513`. Service worker público con caché REV75, SHA256 `c339f5153ecd8f8fd99454cfc84af89fee7ea614a5ecb1edbb9713e6aac32c12`. Ambos coinciden exactamente con el manifiesto del paquete.

El navegador público abre la pantalla de acceso y contiene el emparejador REV75. Se repitieron los siete grupos de comprobaciones independientes sobre el código descargado del dominio: componentes intercambiados, descripción que omite datos, controles de componentes, componentes ambiguos, dosis/volumen, embalaje y contraejemplos anteriores.

Supabase: migración `rev71_alias_factura` aplicada; memoria inicialmente vacía, RLS habilitado, dos políticas por comercio/permiso/licencia. Sin lectura anónima ni TRUNCATE para usuarios. `leer-factura` v18 ACTIVE, JWT habilitado y sus tres archivos coinciden con la fuente. OPTIONS devuelve 204 con el origen correcto; POST sin sesión devuelve 401. El asesor de seguridad no informa hallazgos para la tabla de memoria. El respaldo privado sin políticas es deliberadamente inaccesible para clientes.

## Respaldo y límites

Antes de aplicar la migración se creó `private.rev75_predeploy_snapshot`: copia interna de 27 tablas operativas, más el estado previo de despliegue, con acceso revocado a clientes y RLS habilitado. Es un respaldo operativo dentro de la misma base, no una copia completa externa del servidor ni de Auth. La memoria no existía antes. La fuente del lector v17 se conservó en una carpeta temporal privada para recuperación; se puede recuperar también del despliegue histórico.

No se cargaron facturas, ventas, movimientos de stock ni datos de prueba en la memoria pública; no se consumió Gemini. No se ejecutó la suite SQL aislada de 11 pruebas sobre producción. Quedan pendientes el flujo autenticado completo con facturas reales, Gemini y dos dispositivos físicos.
