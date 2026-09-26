# Mi Comercio — cambios REV51 (26/09/2026)

Versión publicada en [micomercio.ar/beta](https://micomercio.ar/beta/).

## Caja

1. La vista del turno prioriza tres datos: total vendido, efectivo recibido y fiado. Los indicadores secundarios, cobros y movimientos quedan accesibles en secciones desplegables.
2. Se agregaron accesos directos para registrar un gasto, registrar un retiro del dueño y consultar cierres anteriores. Cada acceso abre el motivo apropiado o la sección correspondiente.
3. El cierre guía tres pasos: contar el efectivo físico, revisar el arqueo y decidir el fondo de la próxima caja. El importe esperado se muestra recién después del conteo. Se puede volver a corregir antes de guardar.
4. Se rechazan conteos vacíos, inválidos o negativos. Si hay diferencia, se orienta a revisar el conteo y los movimientos y se ofrece una nota para explicarla.
5. El historial muestra un resumen por cierre y permite desplegar el arqueo, las ventas y el envío por WhatsApp.
6. Se conserva la regla previa: la próxima caja comienza en $0. En comercios sin turnos se puede declarar expresamente el efectivo que queda al cerrar, con 0 como valor inicial. Los cierres y saldos existentes no se modificaron.
7. Después de cerrar, la siguiente caja vuelve a abrir en «Turno actual», incluso si se abre un turno nuevo enseguida.

## Descuentos y promociones

1. Se quitaron los botones fijos 2x1 y 3x2. Ahora se elige «Llevá y pagá» y se indican las unidades que lleva y las que paga. Ejemplos: 2 y 1 = 2x1; 3 y 2 = 3x2; 4 y 2 = 4x2.
2. La regla acepta de 2 a 99 unidades llevadas y exige pagar al menos una y menos de las que se llevan. Se aplica a grupos completos de un mismo producto vendido por unidad. Los grupos incompletos no reciben beneficio; no se aplica a combos ni a productos por kilo.
3. Cuando coinciden un descuento porcentual y uno por cantidad, el sistema usa el mayor beneficio para ese producto. La promoción se conserva en la sincronización con los campos existentes, sin migración de base de datos.

## Verificación

- **Código:** revisados el cálculo del ticket, el formulario, las rutas de sincronización, el arqueo y la identidad de REV51.
- **Local:** 195 pruebas aprobadas; sintaxis del script principal correcta; integridad de 14 archivos correcta; `git diff --check` sin observaciones. La vista de Caja se inspeccionó en la prueba visual local.
- **Beta pública:** `index.html` y `sw.js` servidos por `https://micomercio.ar/beta/` coinciden byte a byte con los archivos REV51. La pantalla pública sin sesión muestra el ingreso. No se realizó un cierre, una venta ni la creación de una promoción en una cuenta real; el recorrido autenticado queda sin verificación pública.
