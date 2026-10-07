# MiComercio REV59 — Turno actual

## Qué cambió

- El efectivo esperado se explica con la cuenta completa: fondo inicial + ventas en efectivo + cobros de fiado en efectivo − gastos y otras salidas − retiros del dueño.
- El modo de dos cajas físicas muestra caja general y caja de cigarrillos en tarjetas del mismo tamaño. Los modos de caja única muestran una sola tarjeta; si se separa dinero para cigarrillos al cerrar, la tarjeta lo explica.
- Registrar gasto, sacar plata y cerrar caja son botones visibles junto al estado del turno. Se quitó el acceso duplicado «Ver cierres»; el historial sigue en su pestaña.
- Se muestran responsable, fecha y tiempo transcurrido del turno; los cinco movimientos más recientes; y un enlace a todos los movimientos y las tablas de detalle.
- El total vendido se desglosa en efectivo, transferencia/QR, tarjeta y fiado. Se aclara que cobrar fiado agrega efectivo a caja sin duplicar el total vendido.
- En la revisión del cierre de caja única, la fila «Ventas en efectivo» ahora usa todas las ventas en efectivo, incluidos cigarrillos, igual que el cálculo del efectivo esperado.
- Identidad de build y caché actualizadas a REV59.

## Verificación

- **Código:** fórmulas de presentación contrastadas con los importes que usa el cierre; ningún cambio de esquema o datos del comercio.
- **Local:** batería completa de pruebas, verificación de integridad y sintaxis del script; prueba de navegador con datos sintéticos en los tres modos de caja y en pantalla móvil.
- **Público:** `https://micomercio.ar/beta/` respondió con `packageRevision:59`, el nuevo bloque «Últimos movimientos» y service worker `micomercio-beta-6.0.0-f6-rc2-rev59` en una lectura sin caché. El navegador público cargó la pantalla de ingreso sin errores de consola. El recorrido dentro de Caja con una cuenta real quedó sin ejecutar en público porque la sesión de prueba estaba sin autenticar; los tres modos se reprodujeron localmente con datos sintéticos.
