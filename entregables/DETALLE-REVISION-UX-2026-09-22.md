# MiComercio — revisión UX integral

Fecha: 22 de septiembre de 2026
Build: `6.0.0-f6-rc2`, revisión de paquete `29`

## Alcance

Se tomó `MiComercio-Revision-UX.zip` como referencia visual y funcional. Los HTML y documentos del ZIP se usaron como bocetos; no se ejecutaron como código ni se trataron como instrucciones.

La implementación conserva el sistema como una aplicación autocontenida y actualiza la experiencia de uso en Vender, Productos, Para pedir, Vencimientos, Combos, Descuentos, Fiado, Caja, Movimientos de stock, Resumen, Configuración y Soporte.

## Cambios implementados

### Vender

- Se agregó confirmación visible al sumar un producto, con acción para deshacer la última carga.
- Los resultados de búsqueda muestran el estado de stock y se advierte antes de vender un producto sin stock o vencido.
- `F1` enfoca el buscador, `F2` abre el cobro y `Escape` cierra resultados sin borrar el ticket.
- Cancelar una venta con tres o más renglones requiere confirmación.
- El cobro en efectivo ofrece importes rápidos (`Justo`, `$5.000`, `$10.000`, `$20.000`), calcula el vuelto y habilita el cobro solo cuando el importe recibido alcanza.
- Se eliminó la lista duplicada del ticket lateral; ese panel queda como resumen y total.
- Los descuentos eligen la mejor regla aplicable y excluyen combos para evitar dobles beneficios.

Código principal: `beta/index.html`, líneas 3621–3663, 3854–4041.

### Productos y cambios masivos de precios

- Se incorporó el encabezado simplificado con “Más opciones”, “Nuevo producto” y “Cargar factura”.
- El catálogo vacío muestra un inicio guiado con importación, factura o carga manual.
- Se agregó el filtro de productos con datos faltantes y una advertencia suave para nombres sospechosamente cortos o solo numéricos.
- Costo faltante se representa con `—`; Venta mantiene mayor jerarquía y los valores numéricos usan cifras tabulares y alineación derecha.
- El cambio masivo exige elegir alcance: catálogo, rubro o proveedor.
- Antes de aplicar se muestra cantidad afectada, promedio anterior/nuevo, mayor variación y exclusiones.
- El lote aplicado puede deshacerse desde Productos.

Código principal: `beta/index.html`, líneas 4354–4828.

### Adaptación para notebooks

- En anchos de hasta 1440 px, Productos oculta Código y Rubro y convierte Editar, Ajustar e Historial en botones compactos con icono.
- En 1024 px, Productos también oculta Margen para mantener visibles Producto, Costo, Venta, Stock y acciones sin desplazamiento horizontal.
- Para pedir muestra Producto, Stock, Pedir y Costo estimado en 1024 px; el proveedor sigue disponible en la agrupación y en el pedido armado.
- Movimientos mantiene todas las cifras, oculta la columna de botón y permite abrir el detalle tocando la fila. En pantallas más anchas conserva el botón “Detalle”.
- Ninguna de estas reglas cambia la presentación amplia de escritorio.

Código principal: `beta/index.html`, líneas 522–553 y 7228–7267.

### Para pedir

- Se unificó la selección del pedido: cada producto tiene una casilla y una cantidad editable.
- La lista inicial de faltantes se prepara una sola vez; si el usuario la vacía, permanece vacía.
- “Vaciar pedido” pide confirmación.
- El pedido final se agrupa por proveedor, explica la agrupación y permite preparar el mensaje de cada proveedor por separado.

Código principal: `beta/index.html`, líneas 5975–6150.

### Vencimientos

- Se agregó cobertura de fechas de vencimiento y métricas de mercadería en riesgo.
- Cuando faltan fechas, se muestra un estado honesto con acceso directo para cargarlas.
- Se incorporó la acción de liquidar productos próximos a vencer mediante un descuento del 40 %.
- Vender advierte si se intenta agregar un producto vencido.

Código principal: `beta/index.html`, líneas 6152–6349.

### Fiado

- Los indicadores se llaman “Total adeudado” y “Clientes con fiado”.
- Se agregaron vistas “Con saldo” y “Todos”.
- Cada cliente muestra antigüedad de deuda, saldo y monto vencido cuando corresponde.
- Desde la lista se puede iniciar un fiado para ese cliente o preparar un contacto por WhatsApp.
- Los estados vacíos diferencian entre no tener clientes y no tener saldos pendientes.

Código principal: `beta/index.html`, líneas 6351–6582.

### Combos y Descuentos

- Combos muestra precio unitario y stock de cada componente, costo estimado, margen y ahorro.
- Un combo requiere al menos dos componentes y un precio positivo.
- Si el combo queda más caro que comprar los productos por separado, se solicita confirmación explícita.
- Descuentos usa una terminología uniforme, nombre editable/autogenerado, búsqueda de productos y vista previa de alcance e impacto.
- Se validan las fechas y se avisa cuando faltan costos para evaluar rentabilidad.

Código principal: `beta/index.html`, líneas 5143–5480.

### Caja

- La pantalla se divide en “Turno actual”, “Cierre de caja” e “Historial”.
- Fiado del turno y ganancia estimada se integraron a las métricas superiores.
- Los egresos en cero son neutrales; el rojo queda reservado para diferencias negativas y acciones destructivas.
- Efectivo contado tiene fondo, borde y tamaño propios para distinguirlo de los importes calculados.
- La caja de cigarrillos se puede ocultar y respeta la configuración del comercio.
- Registrar egreso usa el mismo azul operativo que el resto del sistema.
- Los cierres anteriores siguen mostrando el responsable, incluso cuando cerró un empleado.

Código principal: `beta/index.html`, líneas 203–242, 6584–6636 y 6941–7161.

### Movimientos de stock

- Se agregaron períodos de 1, 7 y 30 días.
- La tabla separa stock inicial, ingresos, ventas, ajustes y stock final.
- Los stocks negativos generan una advertencia y acceso a corrección.
- El detalle informa responsable, momento, tipo, motivo y cantidad.
- En notebook, tocar una fila abre el detalle sin depender de una acción recortada.

Código principal: `beta/index.html`, líneas 7228–7340.

### Resumen

- La ganancia queda indeterminada (`—`) cuando faltan costos, con acceso para completar los datos.
- Los gráficos e indicadores requieren un mínimo de ventas para evitar conclusiones engañosas.
- Se agregó comparación con el período anterior.

Código principal: `beta/index.html`, líneas 7367–7743.

### Configuración

- Los controles de funciones y permisos son interruptores accesibles.
- Se explica el orden entre permisos de cuenta y restricciones del dispositivo.
- La restricción local se aplica al decidir qué secciones puede ver el modo de mostrador.
- La pantalla aprovecha dos columnas en escritorio y se apila en notebook.
- Se advierte que cambiar el próximo número de ticket puede generar duplicados.
- Se puede copiar el código del comercio.
- La clave de empleado permanece oculta, con acciones para mostrarla o generar una segura.
- Restaurar exige escribir `RESTAURAR` y crea una copia automática antes de reemplazar datos.
- Las acciones irreversibles tienen un bloque visual propio.

Código principal: `beta/index.html`, líneas 7341–7361 y 7952–8161.

### Soporte

- Se agregó un formulario con tema, urgencia y descripción.
- El diagnóstico adjunto incluye versión, revisión, rol, conexión, navegador y un identificador de dispositivo enmascarado.
- El diagnóstico no incluye ventas, clientes, importes, contraseñas ni PIN.
- El sistema prepara el mensaje en WhatsApp; no lo envía automáticamente.

Código principal: `beta/index.html`, líneas 7745–7950.

## Archivos modificados

- `beta/index.html`: interfaz, comportamiento y reglas responsive.
- `beta/sw.js`: caché actualizada a `micomercio-beta-6.0.0-f6-rc2-rev29`.
- `tests/beta-cash-ux-redesign.test.cjs`: identidad del build 28.
- `tests/beta-products-ux-redesign.test.cjs`: identidad del build 28.
- `tests/beta-product-images-ui.test.cjs`: protección frente a repintados tardíos de Vender.
- `tests/beta-ux-review-round.test.cjs`: contratos de la revisión UX y reglas responsive.

## Verificación

### Verificado en código

- Identidad de `beta/index.html`, caché de `beta/sw.js` y pruebas alineadas en revisión 29.
- Sintaxis del script embebido validada.
- Contratos automatizados para los cambios de Vender, Productos, Para pedir, Vencimientos, Fiado, Combos, Descuentos, Caja, Movimientos, Resumen, Configuración y Soporte.

### Verificado localmente

- Suite completa: 76 pruebas aprobadas, 0 fallas.
- Validación independiente del script embebido: sintaxis correcta.
- Recorrido visual y funcional con comercio de ejemplo.
- Resoluciones comprobadas: 1024 × 768 y 1366 × 768.
- En ambas resoluciones se validó que la página y el contenido principal no se desborden.
- En 1024 × 768, Productos, Para pedir y Movimientos no requieren desplazamiento horizontal.
- Se probaron búsqueda y agregado en Vender, cobro en efectivo, cancelación sin registrar una venta, armado de pedido, búsqueda y validación de descuentos, Fiado, pestañas de Caja, detalle de Movimientos, resumen sin ventas, configuración, restauración protegida y diagnóstico de Soporte.
- La carga local final no registró errores nuevos en la consola.
- No se enviaron mensajes de WhatsApp ni se restauraron o borraron datos.

### Verificado en la beta pública

- La revisión 29 está publicada en `https://micomercio.ar/beta/`.
- Se navegó en modo de solo lectura por Productos, Para pedir, Vencimientos, Combos, Descuentos, Fiado, Caja, Movimientos de stock, Resumen y Soporte.
- En 1024 × 768, Productos y Para pedir no presentan desplazamiento horizontal; ninguna sección desborda la página ni el contenido principal.
- En 1366 × 768, Productos y Para pedir conservan todas las acciones visibles y no presentan recortes ni barras horizontales.
- Soporte muestra revisión 29, identificador de dispositivo enmascarado y diagnóstico sin métricas comerciales.
- Una carga limpia de la revisión 29 terminó sin errores nuevos en la consola.
- La validación pública no registró ventas, cobros, egresos, cierres ni cambios de configuración.
