# Presentaciones rápidas y cobro por importe en Docker

Los tres cambios pedidos están disponibles en http://127.0.0.1:55383/beta/ y verificados el 25/11/2026. La pestaña del usuario se actualizó y muestra Configuración con la verificación apagada. Esta entrega es local; producción no se publicó.

## Agregar presentaciones

El resumen de Tamaños fijos tiene un botón + junto a Editar. El + abre directamente una presentación vacía y enfoca Nombre, sin tener que tocar Editar. Conserva nombres, pesos, ventas y envases ya cargados. Se guarda junto con el producto.

Se mantiene lo anterior: varias presentaciones pueden usar los mismos gramos, cada una conserva precio y envase, y todas descuentan del stock del producto base. Con presentaciones se vende directamente; solo los productos sin presentaciones preguntan peso o monto.

## Transferencia y QR

Configuración → Caja incorpora Verificar cobros con Mercado Pago. El usuario confirmó el comportamiento:

- Apagado, que es el valor inicial: tocar Transferencia/QR confirma directamente la venta. No consulta cuentas ni inicia un cobro en Mercado Pago. La venta queda marcada como manual.
- Encendido: conserva el selector de cuenta, QR y verificación de transferencias existentes. Si la cuenta ya no está disponible, se ofrece el cobro manual.
- Un cobro conectado pendiente debe resolverse aunque se apague la opción. Cambiar la preferencia no permite omitir la cancelación ni registrar dos veces un pago.

La preferencia se comparte entre dispositivos del comercio. Solo se envía esa columna cuando cambió esa preferencia: una caja atrasada que edite otro ajuste no puede apagarla silenciosamente. La comparación F34 también distingue el valor local del valor del servidor.

Para sincronizarla se agregó y aplicó únicamente en Docker `supabase/migrations/20261125032029_cobro_transferencia_configurable.sql`. Conserva los controles de usuario, dueño/admin, licencia y permisos de la función existente. La proyección del vendedor conserva el campo incluso al recrear la definición histórica de REV109.

## Venta por monto

La ventana Venta a granel conserva Por peso y agrega Por monto. El usuario confirmó que se cobra el importe exacto y se muestra el peso aproximado, al gramo más cercano.

Ejemplo probado con pan a $3.000/kg:

| Entrada | Peso registrado | Subtotal |
| --- | --- | --- |
| 250 gramos | 250 g | $750 |
| $2.000 | Aproximadamente 667 g | $2.000 |

La conversión no cambia el precio del catálogo. El stock y el costo se calculan con el peso registrado. Las promociones y descuentos vigentes siguen aplicándose al cobrar, como indica la ventana; el monto ingresado fija el subtotal de esa línea.

Las líneas por monto conservan su importe y se distinguen de las ventas por peso y de las presentaciones fijas. Se bloquean entradas inválidas, importes que producirían cero gramos y la venta por monto sin precio por kg válido. Un código de barras escaneado no se transforma en peso ni dinero.

## Revisión y regresiones

Una revisión independiente encontró cinco problemas, reproducidos y corregidos con regresiones:

1. El reintento de una transferencia manual tras fallar el guardado podía duplicar venta y stock. Ahora conserva una referencia de venta y reintenta esa misma persistencia.
2. Un EAN-8 con ceros iniciales podía convertirse en monto o gramos. Ahora se reconoce antes de convertir y se pide volver al buscador.
3. Reaplicar la proyección histórica de REV109 podía omitir la preferencia. La extensión se movió a la base que esa definición sigue usando.
4. Una caja atrasada podía reenviar una preferencia vieja al cambiar otro ajuste. Se registran las claves cambiadas y se omite la preferencia en los demás envíos.
5. F34 omitía el modo de cobro de su comparación. Ahora lo compara en ambos orígenes.

No hubo una segunda revisión independiente después de las correcciones.

Las pruebas de integración también detectaron que una copia del parche había alterado selectores de la página del candidato. Se corrigió y se cotejaron literalmente los 17 bloques de interfaz afectados y el archivo de Mercado Pago con el worktree. Dos recorridos históricos se adaptaron al nuevo estado manual cuando no hay cuentas conectadas.

## Verificación final

- Candidato Docker combinado: 768 pruebas Node aprobadas, cero fallas y cero omitidas, con MP_SQL_TEST y PESO_SQL_TEST habilitados.
- 42 recorridos de navegador aprobados: 19 escenarios en 1366 y 390, dos adicionales en tema claro y dos del lector autenticado en Docker.
- Diez ejemplos multiproducto del lector aprobados con proveedores simulados. Fotos interceptadas, sin enviarlas a IA.
- SQL real local: reaplicación, proyección histórica, persistencia true/false, rechazo de texto, rechazo de empleado y sesión ausente, dueño y permisos conservados. Los datos de prueba se revierten con ROLLBACK.
- Integridad de 50 archivos correcta en ambas copias. Diff sin errores de espacios.
- Presupuesto del lector conservado: 2 de 3 lecturas utilizadas; ninguna consumida por esta entrega.

El recorrido de la venta manual usa el guardado real de IndexedDB en un navegador aislado. Provoca un fallo de persistencia y reintenta: queda una sola venta, una sola baja de stock y el mismo importe. Los recorridos conectados usan respuestas de Mercado Pago simuladas.

## Archivos y publicación futura

Docker sirve la edición `2026-11-25-venta-importe-cobro-manual-r21`, caché rev107-r21. El worktree usa `2026-11-25-venta-importe-cobro-manual-local-r10`, caché rev109-r10. Sus bases son diferentes; estos identificadores son locales.

Se conservaron los extractores y el diseño previo del lector. No hubo push, despliegues, SQL remoto, cambios de secretos, ventas o cobros reales ni llamadas pagas.

Para publicar hay que integrar con la rama vigente, autorizar y aplicar la migración remota antes de la web, fijar la identidad de publicación y actualizar las pestañas de los equipos. El informe consolidado de las mejoras anteriores está en `entregables/INFORME-CAMBIOS-PRESENTACIONES-Y-COBRO-2026-11-24.md`.
