# MiComercio — empleados, WhatsApp y stock por turnos (REV79)

Fecha: 01/10/2026. Base: REV78, SHA-256 `6648327706d225e4c919d97deae9d131c1d431d57d562e692a147bf7ea4d127a`.

Entrega integrada localmente: conserva las tres correcciones del lector de REV78 y agrega los cambios solicitados de empleados, WhatsApp y stock. No se publicó ni se cambiaron datos, permisos o funciones de Supabase. La beta canónica no fue reemplazada en esta tarea.

## Compras en la configuración de empleados

Los formularios de crear empleado y editar permisos ahora muestran **Compras · Para pedir** y **Productos y compras**, con el alcance de cada permiso explicado. La primera opción habilita faltantes y pedidos; la segunda permite cargar facturas a mano o con el lector, además de editar Productos. La explicación de Caja aclara cierre y WhatsApp sin historial.

Se conserva la relación existente entre cargar facturas y editar Productos. No se agregaron claves de permiso que el servidor desconozca ni se concedió acceso adicional al actualizar las etiquetas. Se comprobó que una persona con sólo Para pedir no obtiene Cargar factura, y que con ambos permisos obtiene las dos opciones de Compras.

## Empleado sin historial, con WhatsApp de su cierre

El historial de turnos no se renderiza para empleados, con o sin caja abierta. Se bloquean también las funciones de detalle y el acceso indirecto desde Resumen a las diferencias de cierres. Dueño y administrador conservan su historial.

Al finalizar su propio cierre, el empleado puede abrir WhatsApp con el resumen. La autorización se comprueba al abrir la vista previa y al pulsar el botón, para impedir reutilizar un botón abierto por otra identidad. El permiso del empleado se limita al objeto de su cierre recién realizado en esa sesión; no habilita consultar ni reenviar cierres ajenos desde el historial.

Si el dueño no configuró un teléfono, el empleado puede ingresar un destino para ese envío sin intentar cambiar la configuración privilegiada del comercio. Las pruebas interceptaron el enlace: no enviaron mensajes reales.

Los cambios restringen las rutas de la interfaz; no modifican las políticas de lectura del servidor ni eliminan datos ya sincronizados del dispositivo.

## Cigarrillos en el mensaje

El resumen incorpora cuatro líneas de importes vendidos:

```text
Cigarrillos por forma de pago
Efectivo: …
Transferencia / QR: …
Tarjeta: …
Fiado: …
```

En ventas con pagos combinados se prorratea el importe neto de cigarrillos, conservando centavos. QR se agrupa con Transferencia; débito y crédito con Tarjeta. Fiado corresponde a la venta pendiente, no a cobros posteriores de cuentas corrientes. Las ventas anuladas antes del cierre no suman.

Se guarda el desglose en el cierre local para mantener sus importes originales si luego anulan una venta. Un cierre histórico de otro dispositivo se reconstruye sólo si están completos sus vínculos, ventas y pagos, coinciden los importes y no hay componentes aproximados. De faltar datos, el mensaje indica **Desglose de cigarrillos no disponible**; no convierte dinero faltante en Fiado ni inventa cuatro ceros.

El desglose nuevo es un dato local del cierre; no se agregó una columna al servidor. En otro dispositivo se aplican las comprobaciones de reconstrucción anteriores.

## Comparación de stock entre turnos

Movimientos de stock conserva día, 7 días, 30 días, búsqueda y rubro. Dueños y administradores tienen además **Comparar turnos**, con dos selectores y el detalle por producto de ingresos, vendidas, ajustes y variación registrada de cada turno. Los empleados con permiso de Movimientos conservan la consulta por período.

La identidad del segmento separa turnos que comparten caja raíz y turnos simultáneos de dispositivos distintos. Una devolución posterior figura como ajuste en el turno en que se registra y conserva la salida original. No se asignan movimientos históricos a un turno basándose solamente en su hora.

El stock al abrir/cerrar se reconstruye con la base y todos los movimientos del comercio. Se rotula **stock global reconstruido**, porque también cambia por otras cajas y operaciones entre turnos; no es un conteo físico del empleado. Se informa la variación de movimientos externos durante esas horas, y los movimientos sin turno asignado tienen un detalle separado.

La apertura sincronizada ahora prefiere la hora del segmento, en lugar de reutilizar la apertura de su caja raíz. Si sólo se conoce una apertura aproximada, no se muestra un stock inicial preciso. La columna existente `opened_at_device` fue comprobada con una consulta de metadatos de sólo lectura en Supabase.

Se avisa cuando el detalle de ventas o movimientos de un cierre está reconocido como incompleto. Ese faltante oculta los stocks globales de ambos turnos comparados, porque también afecta el inventario posterior. Se conservan sus movimientos disponibles. Productos ausentes y bases históricas desconocidas se muestran como no disponibles. Una llegada posterior al cierre se marca, incluso si llegó el mismo día.

Limitaciones: el cálculo depende del historial sincronizado disponible y no detecta toda posible ausencia de movimientos. Los turnos interrumpidos sin arqueo se ofrecen cuando ya se cargaron desde Caja; no se agregó una descarga nueva desde Movimientos. Los turnos abiertos se identifican como provisionales.

## Verificación realizada

- **En código:** HTML y caché REV79 alineados; manifiesto de integridad válido. Revisión independiente de permisos, WhatsApp y stock, sin hallazgos críticos o importantes abiertos dentro del alcance.
- **Localmente en Windows:** 387/387 pruebas. Las 29 pruebas nuevas de esta entrega cubren autorizaciones, pagos mixtos e incompletos, snapshots, segmentos, devoluciones, peso, faltantes, llegada tardía y cortes globales. Los fallos nuevos fueron reproducidos antes de corregirse.
- **Navegador local:** configuración de Compras y efectos de permisos; empleado abriendo y cerrando por la interfaz a 1366 y 390 px; cuatro importes de $250 en un cierre de ejemplo; envío de enlace interceptado; historial y accesos indirectos bloqueados. Comparación de dos turnos, detalles, búsqueda, selección inválida, móvil, ausencia de escrituras y vista diaria del empleado. Sin errores de página.
- **Regresiones locales:** recorrido de 14 pasos del lector REV77, nueve escenarios financieros y tres identidades del lector REV78, Resumen REV76 y navegación REV54 sin duplicaciones. El recorrido REV54 se ejecuta con `REV` apuntando a la raíz de esta entrega.
- **Entorno público:** no publicado ni comprobado allí. La consulta de esquema no valida el flujo autenticado público. Siguen pendientes la prueba real de permisos/sincronización, WhatsApp en dispositivos físicos, Gemini real y facturas nuevas.

## Repetir y continuar

Desde la raíz, ejecutar `node --test tests/*.test.cjs` y `node tools/verificar-integridad.cjs`. Con `PW` configurado a Playwright y `CHROME` a Chrome, los recorridos nuevos están en `entregables/pruebas-navegador-REV79/`: `compras-config.cjs`, `empleados-whatsapp.cjs` y `stock-turnos.cjs`.

Antes de publicar, comparar e integrar el backend del lector de REV78 con lo realmente desplegado y repetir el escenario en la beta pública. No ejecutar migraciones históricas por estar incluidas en este ZIP. No se incluyeron credenciales, catálogo privado ni operaciones reales.

Permanecen fuera de esta entrega los dos problemas heredados documentados en REV78: descuento global distribuido sobre deuda dentro de `items`, y el botón Ver en Caja sin acción cuando no hay ventas. Los documentos de revisiones anteriores se conservan como antecedentes.
