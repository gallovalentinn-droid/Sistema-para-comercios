# REV87 — columnas originales con funcionamiento REV86

Pedido: volver al diseño con todas las columnas visibles y conservar el funcionamiento actual.

## Verificado en código

Se restauran las siete columnas: leído en la factura, producto emparejado, cantidad, unidades por bulto, precio unitario, descuento y resultado de carga. Los campos de bulto/precio/descuento vuelven a estar visibles y editables sin desplegar paneles. Se conserva la etiqueta Pack xN/Unidad, costo final destacado y elección de stock cuando hace falta. Impuesto de fila y subtotal impreso siguen ausentes.

El bloque de identificación, memoria, conversión automática, cálculos y controles REV84/REV86 se comparó contra fb28fbe725b79f0eeb1cde0dd15cc6a98fda02f0: idéntico. Los handlers de edición y confirmación manual se conservan; se elimina solamente el evento del panel de costo que ya no existe. Única revisión independiente sin hallazgos accionables. Identidad HTML/manifiesto REV87 edición 2026-10-06 y caché rev87; 33 archivos críticos verificados.

## Verificado localmente

513/513 pruebas completas. Navegador a 1366/390: siete columnas y cuatro controles visibles, packs/unidades y conversión automática, catálogo contradictorio pendiente, corrección manual, controles financieros, doce casos r3 y seis casos de costos por ancho. Sin errores de página ni desbordamiento en estos escenarios. Se conservan los costos internos de tres decimales y los totales al cargar.

## Entorno público

Fuente publicada en main: 3bdff8461f5a7dad8b99c8df13ed080378b8c0e3. Pages 37470641304 completó con success. HTML/SW/manifiesto HTTP 200 e idénticos por SHA-256 a la fuente local. Recorridos de columnas visibles, packs/unidades, revisión, doce casos r3 y seis casos de costos por ancho aprobados en la beta pública a 1366/390, con archivos públicos reales y Supabase simulado. Evidencia en web-hashes.json, VERIFICACION.json y registros públicos; esto no prueba una nueva extracción autenticada ni una escritura de stock real.

## Alcance

Cambio de presentación, sin SQL, función, prompt ni modelo nuevos. Pruebas con datos sintéticos y Supabase simulado, escrituras externas bloqueadas; sin IA paga ni stock/compras reales. No se vuelve a medir precisión de extracción con una foto. Capturas del usuario y catálogo real no publicados; capturas de ejemplo conservadas localmente. ZIP REV84 histórico conservado.
