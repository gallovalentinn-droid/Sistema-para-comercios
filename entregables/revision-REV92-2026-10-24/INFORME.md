# REV92 — tamaños con stock compartido en kilos

Publicado por pedido del usuario el 24/10/2026 en https://micomercio.ar/beta/.

## Uso

En Productos, cargar un producto por peso con su stock total en kg, por ejemplo Helado. Entrar en Tamaños y definir nombre, gramos y precio propio para cada presentación. Los botones aparecen en Vender. Un cuarto descuenta 0,250 kg; un medio, 0,500 kg; un kilo, 1 kg. La reposición y el ajuste se hacen sobre la base común. El cajero no reparte ni carga stock por tamaño. La función no controla sabores por separado. No se cargó un catálogo real como parte del despliegue.

## Fuente y publicación

- Aplicación: commit `89060ee324673e60edfa13e8d1e98ac1dfb78536` sobre main REV88 `4d1e43f5eef9a1b7224885bb5c541952a8b3ffd8`.
- Identidad: REV92, edición 2026-10-24; caché `micomercio-beta-6.0.0-f6-rc2-rev92`.
- HTML público: HTTP 200, SHA-256 `ed0c9a25cdc1873840c1e6822ea10fb0f8916427b034e227fa7a0dc1237c2db8`, idéntico a la fuente.
- SW público: HTTP 200, SHA-256 `2ea182014bb6ba7914aac916692fe5766e1cae5cfdf30c2d1175a6f3aec4f52f`, idéntico a la fuente.
- Se reutiliza el circuito existente de componentes de combos; no hubo migraciones ni despliegues de funciones. La consulta de esquema fue de solo lectura: cantidades con precisión de tres decimales.

## Verificado en código

Revisión independiente cerrada sin hallazgos pendientes después de corregir permisos de edición y bloqueo de presentaciones cuya base fue archivada. El formulario exige autorización tanto de vista como del maestro existente. No se sustituye silenciosamente una base archivada por otro producto. Los combos de varios componentes conservan su funcionamiento. Se preserva el snapshot de consumo y precio de cada venta.

## Verificado localmente

- Suite completa: 526 pruebas aprobadas, ninguna fallida ni omitida; base REV88: 521 aprobadas.
- Integridad: 33 archivos críticos y control de ausencia de secretos privados.
- Navegador, 1366 y 390 px: alta de tamaños, precios independientes, venta offline, costo proporcional, serialización de operación, persistencia IndexedDB y recarga; anulación con configuración posteriormente modificada; doble anulación bloqueada; desactivación y base archivada.
- Regresiones de Caja: seis escenarios con tres cierres por ancho. Regresión del lector aprobada en ambos anchos.

## Verificado en el entorno público

Fuente pública y SW iguales por SHA-256. El mismo escenario de tamaños pasó en 1366 y 390 px usando el HTML público: stock inicial 10 kg; dos cuartos a $5.500, un medio a $10.000 y un kilo a $18.000, total $39.000 y consumo 2 kg; stock final 8 kg. Costo total $16.000 con base de $8.000/kg. La anulación devolvió los 2 kg originales incluso después de modificar un tamaño; segundo intento sin devolución adicional. Recarga con la venta anulada y sus cantidades originales persistidas. Sin errores de página ni desborde horizontal.

Estas pruebas usaron datos sintéticos y backend simulado con escrituras externas bloqueadas. Verifican la interfaz publicada, el cálculo, la persistencia local y la construcción de la operación; no acreditan sincronización autenticada real entre dispositivos. No se crearon ventas, cierres ni ajustes reales del negocio. Para reproducir: `PUBLIC_BETA=https://micomercio.ar/beta/` y `node tests/browser-presentaciones.cjs` con Playwright y Chrome disponibles.

## Continuidad P0

El candidato P0 `0f1c90145b78dfab8f5693bd5fa7fe3f65ddb0e4` y el checkout original se conservaron. La web pública avanzó desde REV88: sus referencias de C3/P0 deben renovarse y este cambio debe incorporarse al candidato antes de cualquier publicación futura. No usar un candidato anterior que revierta REV92. El ensayo del M, credenciales privadas, privacidad P/E, presencia a T+40 y autorizaciones independientes de P0 siguen fuera de esta publicación.
