# Mi Comercio — cambios REV50 (26/09/2026)

Versión publicada en [micomercio.ar/beta](https://micomercio.ar/beta/). Código: `80373f3`.

## Cambios

1. **Productos:** se quitó “Cargar factura” tanto del catálogo con productos como del estado vacío. La carga de facturas permanece en la primera pestaña de Compras.
2. **Descuentos y promociones:** el formulario ya no pide un nombre. La descripción se genera automáticamente. Se puede elegir descuento porcentual, 2x1 o 3x2.
3. **Búsqueda de producto:** al escribir nombre, código o rubro, el selector muestra hasta 60 coincidencias y conserva el producto elegido al editar. En 2x1 y 3x2 se ofrecen productos vendidos por unidad.
4. **Cobro:** por cada grupo completo del mismo producto, 2x1 o 3x2 bonifica una unidad. No se mezcla con combos ni productos por kilo. Cuando coinciden varias promociones sobre el producto, se aplica la de mayor beneficio; el descuento por medio de pago conserva su cálculo posterior. El ticket y el comprobante muestran el importe bonificado.
5. **Sincronización:** 2x1 y 3x2 usan los campos ya existentes de promociones (`producto_id` y `objetivo_texto`), sin migración de base de datos. La lectura remota recupera la modalidad y los importes históricos de venta usan el detalle guardado de cada línea.
6. **Versión:** se alinearon `beta/index.html`, `beta/sw.js`, el manifiesto de integridad y las pruebas en REV50.

## Verificación

- **Código:** revisión de las rutas de producto, formulario, cálculo de venta, comprobante y sincronización; sin cambios en los datos de comercios.
- **Local:** 190 pruebas aprobadas, ninguna fallida; verificación de integridad de 14 archivos aprobada; script principal analizado sin errores de sintaxis; `git diff --check` sin observaciones.
- **Beta pública:** el HTML y `sw.js` servidos por `https://micomercio.ar/beta/` coinciden byte a byte con los archivos REV50 publicados. La pantalla pública sin sesión muestra el ingreso. No se hizo una venta ni se creó una promoción en una cuenta real; por eso el escenario autenticado entre dispositivos queda sin verificación pública.

## Criterios de cálculo probados

- 2x1: 2 unidades → 1 gratis; 5 unidades → 2 gratis.
- 3x2: 3 unidades → 1 gratis; 6 unidades → 2 gratis.
- Si un descuento porcentual supera el beneficio por cantidad, se usa ese porcentaje. No se acumulan ambos.
- Una promoción vencida, pausada o de otro producto no modifica el precio.
