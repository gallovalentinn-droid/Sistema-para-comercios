# Mi Comercio — detalle de correcciones de la auditoría REV29

**Entrega:** REV30  
**Fecha:** 23 de septiembre de 2026  
**Fuente de revisión:** `AUDITORIA-REV29.zip`

## Resultado

Se corrigieron los defectos funcionales y de experiencia de uso reproducibles de la auditoría. La entrega queda identificada como **revisión 30**, con el HTML, el service worker, el paquete offline y las pruebas alineados.

La comprobación final dio estos resultados:

- **90 de 90 pruebas locales aprobadas.**
- **Código principal válido** en la comprobación de sintaxis de JavaScript.
- **9 archivos críticos verificados por SHA-256**, sin secretos privados detectados.
- Revisión visual local en **1366 × 800** y **390 × 844**.
- Sin desbordes horizontales en Productos, Para pedir, Movimientos de stock, Caja y el catálogo vacío.
- Modales de egreso y carga de factura contenidos correctamente en celular.
- La beta pública todavía no fue reemplazada por esta entrega; esa comprobación corresponde después de publicarla.

## Correcciones funcionales

### 1. Importes argentinos y cantidades fraccionarias

**Problema:** valores como `14.000`, `1.500,50` y `1,5` podían interpretarse de forma inconsistente según el campo.

**Cambio:** se separó la lectura de dinero de la lectura de cantidades. Los importes reconocen punto de miles y coma decimal; las cantidades por peso aceptan punto o coma decimal sin convertir `1.250 kg` en 1.250 unidades enteras.

**Código principal:** `beta/index.html`, líneas 2937–2962. También se aplicó el parser de cantidades en producto, ajuste de stock, factura, remito, pedidos y vencimientos.

### 2. Venta única y comprobante conservado

**Problema:** durante la animación final era posible volver a disparar el cobro, y algunas acciones de pago cerraban el comprobante demasiado pronto.

**Cambio:** se agregó el estado `ventaEnProceso`, se protegieron `cerrarVenta`, F2 y F4, y se limpia el ticket inmediatamente después de guardar la venta. El comprobante queda disponible para imprimir o revisar.

**Código principal:** `beta/index.html`, líneas 3531, 3973–4045, 4198–4273 y 11176–11177.

### 3. Caja y ganancia con criterios coherentes

**Problema:** Caja y Resumen podían usar criterios distintos; pagos a proveedores, retiros del dueño y devoluciones podían reducir la ganancia como si fueran gastos operativos. Además, una aclaración agregada al motivo podía alterar el cálculo.

**Cambio:** ambos módulos usan el mismo filtro de egresos operativos. Se excluyen motivos que comiencen con “Pago a proveedor”, “Retiro del dueño” o “Devolución de venta”. Si faltan costos de productos vendidos, la ganancia se muestra como no disponible en vez de presentar una cifra engañosa.

**Código principal:** `beta/index.html`, líneas 6644–6647, 6810–6869, 7130–7155 y 7542–7600.

### 4. Efectivo de pagos combinados

**Problema:** el efectivo de una venta mixta podía repartirse de forma ambigua entre caja general y cigarrillos.

**Cambio:** el efectivo cubre primero la porción de cigarrillos y el resto se asigna a caja general, siempre redondeado a centavos.

**Código principal:** `beta/index.html`, líneas 6815–6832.

### 5. Cierre de caja explícito

**Problema:** dejar el conteo vacío podía confundirse con haber contado cero. Las diferencias no explicaban con claridad si faltaba o sobraba dinero.

**Cambio:** el cierre exige completar los conteos visibles. Escribir `0` es válido; dejar el campo vacío bloquea el cierre. Las diferencias se presentan como **Falta**, **Sobra** o **Diferencia** cuando cuadra exactamente.

**Código principal:** `beta/index.html`, líneas 7255–7330.

### 6. Deshacer cambios masivos sin pisar ediciones posteriores

**Problema:** deshacer un lote podía restaurar datos que alguien había modificado después.

**Cambio:** cada cambio conserva producto, campo, valor anterior y valor aplicado. El deshacer sólo restaura el valor si todavía coincide con el lote; las ediciones posteriores se omiten. Los cambios de costo generan el movimiento inverso correspondiente.

**Código principal:** `beta/index.html`, líneas 4833–4885.

### 7. Reglas seguras para cambios de precios

- El redondeo terminado en `.99` no se aplica a importes menores de $100.
- Una reducción porcentual queda limitada al 90%.
- Se mantiene la base vigente del descuento manual para no cambiar reglas comerciales sin una decisión de producto.

**Código principal:** `beta/index.html`, líneas 4777–4846.

### 8. Vencimientos

**Problema:** un producto vencido todavía podía ofrecerse para liquidación y una liquidación próxima podía quedar debajo del costo sin aviso.

**Cambio:** los vencidos muestran **Dar de baja** y no ofrecen liquidación. Los próximos a vencer permiten liquidar, pero avisan cuando el nuevo precio queda debajo del costo.

**Código principal:** `beta/index.html`, líneas 6230–6265.

### 9. Anulación de ventas y reintegros

**Problema:** anular una venta histórica en efectivo no dejaba una forma clara de reflejar la devolución en el turno abierto.

**Cambio:** la anulación ofrece, de forma explícita y desmarcada por defecto, registrar el reintegro en el turno actual y elegir la caja. El egreso queda vinculado a la venta anulada y no se cuenta como gasto operativo para la ganancia.

**Código principal:** `beta/index.html`, líneas 6848–6935.

### 10. Fiado pagado y crédito a favor

**Problema:** al anular una venta fiada que ya tenía cobros, los pagos podían quedar ocultos detrás de un saldo negativo.

**Cambio:** los pagos se conservan. El saldo adeudado no baja de cero y el excedente se muestra como **Crédito a favor** en la lista y en el detalle del cliente.

**Código principal:** `beta/index.html`, líneas 2317, 2422–2426, 6316–6327, 6453 y 6509.

### 11. Configuración guardada sin conexión

**Problema:** sin conexión no se aplicaban cambios locales aunque el nombre del comercio no hubiera cambiado.

**Cambio:** si el nombre remoto es el mismo, el sistema confirma ese dato antes de exigir conexión y guarda localmente número de ticket, WhatsApp y demás opciones. Un cambio real de nombre sigue requiriendo confirmación del servidor para evitar divergencias.

**Código principal:** `beta/index.html`, líneas 8071–8101.

### 12. Cierres realizados por empleados

**Cambio:** el historial del dueño conserva y muestra cierres sincronizados desde otros usuarios o dispositivos. Se agregó la persona responsable y un filtro cuando hay más de una. La recuperación REV17 también reinicia los dos cursores de ajustes de cierres para traer registros que pudieron omitirse antes.

**Código principal:** `beta/index.html`, líneas 6778, 7076–7105, 9241–9253 y 9390 en adelante.

## Correcciones de experiencia de uso

### Avisos y cancelación de venta

- Se muestran como máximo tres avisos simultáneos.
- Cancelar una venta limpia también el cliente de fiado seleccionado.
- Los atajos de cobro se bloquean mientras se procesa la venta.

**Código principal:** `beta/index.html`, líneas 3076–3080, 3973 y 11176–11177.

### Navegación móvil

La barra inferior ahora se desplaza horizontalmente y mantiene accesibles todas las secciones. Cada botón conserva un ancho táctil estable y el indicador de licencia queda por encima de la barra.

**Código principal:** `beta/index.html`, líneas 375–396 y 10334.

### Dependencia local y recuperación visible

Supabase JS 2.112.3 quedó alojado dentro del sistema y agregado al caché offline. Si el archivo falta o está dañado, se muestra una pantalla clara con **Reintentar** en lugar de abrir una aplicación parcial o vacía.

**Código principal:** `beta/index.html`, líneas 10 y 12030–12130; `beta/sw.js`, líneas 2–3.  
**Archivo agregado:** `beta/vendor/supabase-js-2.112.3.min.js`.  
**SHA-256:** `cf529fe8980cbe6f2dd3e3930ecf96352ed3d3d71233b6760e4f927f89b94b9f`.

### Accesos anteriores y landing

- El botón **Ingresar** de la landing abre `./beta/`.
- La ruta anterior `clientes/` ya no carga una copia vieja conectada a otro proyecto: redirige a la versión actual y limpia sus cachés anteriores.

**Código:** `index.html`, línea 321; `clientes/index.html`, líneas 6–14; `clientes/sw.js`, líneas 1–12.

## Integridad y versión

- Build: `6.0.0-f6-rc2`, revisión **30**.
- Caché: `micomercio-beta-6.0.0-f6-rc2-rev30`.
- El service worker precarga el HTML y Supabase local.
- `integrity-manifest.json` guarda SHA-256 de nueve archivos críticos.
- `verificar.ps1` y `verificar.sh` ejecutan la comprobación.
- `tools/verificar-integridad.cjs` valida hashes y busca patrones de claves privadas.
- `.gitattributes` fija archivos de texto e identifica binarios para evitar falsos cambios por finales de línea.

## Verificación por función

| Función | Comprobación realizada |
|---|---|
| Vender | Búsqueda, ticket, cancelación, efectivo, electrónico, fiado, mixto, atajos, doble cobro y comprobante |
| Productos | Tabla, imágenes, edición, importación, factura, cambio masivo, deshacer y estado vacío |
| Para pedir | Agrupación, selección, imágenes, tablas angostas y vaciado confirmado |
| Combos | Precio, stock de componentes y confirmación de precio inconveniente |
| Descuentos | Nombre, alcance, vista previa y rentabilidad |
| Fiado | Lista, saldo, pagos, mora, anulación y crédito a favor |
| Caja | Turno, egresos, arqueo, cierre, cigarrillos, historial, responsables y cierres de empleados |
| Movimientos de stock | Ingresos, ajustes, costos, negativos, imágenes y vista angosta |
| Vencimientos | Cobertura, fechas, baja y liquidación segura |
| Resumen | Ventas, costos faltantes, ganancia y gastos operativos |
| Configuración | Guardado local, nombre remoto, empleados, permisos, módulos y restauración |
| Soporte | Diagnóstico de sólo lectura y preparación del contacto |
| Offline y sincronización | Identidad REV30, caché local, dependencia fijada, recuperación y cursores de cierres |

## Pruebas agregadas o actualizadas

La nueva batería principal está en `tests/beta-auditoria-rev29-regressions.test.cjs`, líneas 22–151. Cubre parsers, venta única, cierre, ganancia, pagos combinados, deshacer masivo, vencimientos, dependencia local, anulaciones, crédito, configuración, integridad y REV30.

También se actualizaron:

- `tests/beta-cash-ux-redesign.test.cjs`
- `tests/beta-employee-cash-closures.test.cjs`
- `tests/beta-product-images-ui.test.cjs`
- `tests/beta-products-ux-redesign.test.cjs`
- `tests/beta-ux-review-round.test.cjs`
- `tests/sidebar-layout.test.cjs`
- `tests/notebook-preview.cjs`

## Alcance de la verificación

### Verificado en código

Todos los cambios descriptos arriba, la identidad REV30, el caché, los redirects y el manifiesto.

### Verificado localmente

Suite de 90 pruebas, sintaxis, integridad y revisión visual responsive. El navegador local recorrió Productos, Para pedir, Movimientos de stock, Caja, catálogo vacío, Registrar egreso y Cargar factura.

### Verificación pública pendiente

Esta entrega no se publicó durante la preparación del ZIP. Después de autorizar la publicación corresponde repetir en `https://micomercio.ar/beta/` los escenarios de venta, cierre de empleado visible para dueño, configuración y responsive.
