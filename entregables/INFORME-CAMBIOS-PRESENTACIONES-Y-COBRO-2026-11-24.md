# Cambios de presentaciones y cobro en Docker

Estado local verificado el 24/11/2026. Las mejoras están integradas en el laboratorio http://127.0.0.1:55383/beta/. No están publicadas en producción.

## Venta por presentaciones

Un producto por kg con presentaciones configuradas se vende directamente desde los resultados de búsqueda. Elegir una presentación agrega su cantidad y precio al ticket, sin pedir gramos.

- Con una sola presentación, aparece el nombre principal del producto y debajo su peso y precio. Por ejemplo, Jamón con 250 g.
- Con varias, cada presentación aparece como un resultado independiente.
- Solo los productos por kg sin presentaciones abren la pregunta de peso.
- Un código de barras compartido abre el selector cuando corresponde a varias presentaciones; un código genérico no alcanza para distinguirlas. No pide escribir gramos.

Ahora también se pueden guardar presentaciones con el mismo peso y nombres diferentes. Ejemplo probado con helado cuyo costo es $10.000/kg:

| Presentación | Peso | Venta | Envase | Costo total |
| --- | --- | --- | --- | --- |
| Cuarto | 250 g | $8.000 | $300 | $2.800 |
| Milkshake | 250 g | $6.000 | $500 | $3.000 |

Las dos usan el stock del mismo helado y mantienen su nombre, precio y envase. Vender una de cada una consume 500 g. Preparar el ticket todavía no modifica el stock. El costo incluye el peso proporcional más el envase; estas presentaciones no agregan automáticamente otros ingredientes de una receta.

La selección identifica nombre y peso juntos. Cambiar el orden de las presentaciones no cambia lo que se vende. Si una presentación desaparece mientras los resultados están abiertos, se avisa y no se agrega otra del mismo peso. Buscar un nombre exacto como Cuarto tiene prioridad sobre coincidencias por alias de peso; dos productos distintos con ese mismo nombre siguen necesitando elección.

## Catálogo y detalle

El orden de las columnas es Producto, Rubro, Código, Stock, Costo, Venta y Margen, seguido de las acciones.

Ver detalle muestra una línea por presentación con nombre, peso, precio de venta, costo de envase y margen. El margen se calcula sobre la venta e incluye costo proporcional y envase. Cuando falta costo se indica Sin costo. El detalle ocupa una fila aparte para conservar alineadas las columnas principales.

## Caja y cobro

Se retiró Ganancia estimada de Caja. El resultado sigue disponible en Resumen.

La opción QR aparece apenas se selecciona Transferencia/QR, mientras se consultan las cuentas. Mostrar QR espera a conocer la cuenta y su disponibilidad. Una consulta fallida o una cuenta pausada conserva el bloqueo y muestra su estado. Seleccionar la opción no genera un cobro automáticamente.

## Integración y datos locales

El laboratorio servía una copia distinta del worktree. Los cambios se integraron en esa copia conservando el trabajo previo del lector. La pestaña abierta se actualizó y mostró Vender operativo, con ticket vacío.

Para permitir pesos repetidos se aplicó únicamente al PostgreSQL de Docker la migración `supabase/migrations/20261124134951_presentaciones_mismo_peso.sql`. Modifica solo el validador privado existente. Conserva nombres únicos y los controles de pesos, precios y envases. Se verificó que el catálogo completo, el dueño de la función y sus permisos quedaron iguales después de aplicarla.

Identidad de las copias:

| Copia | Edición | Caché |
| --- | --- | --- |
| Laboratorio servido | 2026-11-24-presentaciones-mismo-peso-r18 | rev107-r18 |
| Worktree de desarrollo | 2026-11-24-presentaciones-mismo-peso-local-r7 | rev109-r7 |

Los números de revisión distintos provienen de las bases diferentes de ambas copias. Ambas tienen manifiesto de integridad de 49 archivos.

## Verificación

- Candidato combinado de Docker: 760 pruebas Node aprobadas, sin fallas ni omisiones, con las pruebas SQL locales habilitadas.
- Ocho recorridos de navegador aprobados: dos de presentaciones con el mismo peso, cuatro de catálogo y cobro en claro/oscuro, y dos del lector autenticado. Anchos de 1366 y 390.
- Diez ejemplos multiproducto simulados del lector aprobados. Las fotos del recorrido se interceptaron sin enviarlas a proveedores.
- Tres pruebas SQL adicionales aprobadas después de aplicar la migración local. Incluyen reaplicación, persistencia de ambas presentaciones en una operación revertida y controles de permisos.
- Integridad de 49 archivos y comprobación de espacios del diff correctas.

Las pruebas SQL históricas recrean contratos anteriores dentro de transacciones con ROLLBACK; adaptan temporalmente sus datos de prueba para ese contrato y revierten todo. No borran presentaciones guardadas de forma persistente.

La revisión independiente detectó dos problemas: la búsqueda Cuarto podía confundirse con un alias de 250 g, y una prueba SQL antigua no admitía un catálogo con pesos repetidos. Se corrigieron ambos con regresiones. No hubo una segunda revisión independiente después de esas correcciones.

## Alcance y publicación futura

No hubo push, despliegue, SQL remoto, cambios de secretos, ventas ni cobros reales en esta integración. No se consumieron lecturas pagas; el laboratorio conserva 2 de 3 utilizadas, con una disponible.

Antes de publicar hay que integrar contra la rama vigente, definir la revisión definitiva y autorizar la migración remota y la publicación. Además deben actualizarse todas las pestañas o equipos con el selector anterior antes de habilitar presentaciones con pesos repetidos: el código antiguo solo distingue por gramos y podría seleccionar la presentación incorrecta.

Las verificaciones actuales corresponden al laboratorio y a datos de prueba. No acreditan el comportamiento de los cambios en producción ni la calidad del lector con nuevas fotos reales.
