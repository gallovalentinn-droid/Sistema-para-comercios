# MiComercio · Detalle de cambios REV31

Fecha: 23 de septiembre de 2026. Esta entrega integra las cinco propuestas del texto adjunto al sistema completo. La revisión 31 está preparada en código y empaquetada; no se publicó en la beta pública ni se aplicó la migración a la base pública.

## 1. Rubros múltiples en Productos y Para pedir

- Ambos lugares usan el mismo selector con casillas, cantidad de productos por rubro, búsqueda cuando hay más de diez rubros, **Seleccionar todos** y **Limpiar**. El botón resume la selección como “Todos los rubros”, el nombre elegido o “N rubros”.
- Los rubros elegidos se combinan por unión. La búsqueda de texto, el filtro por actividad y el estado archivado se combinan con ellos. El estado se refleja en la URL y sobrevive a recargar o compartir el enlace.
- Se puede cerrar con Escape o al hacer clic fuera. Las flechas recorren opciones, Espacio las marca y el foco vuelve al botón al cerrar. Los productos sin categoría aparecen bajo “Sin rubro”.
- Productos y Para pedir muestran el número de resultados, ofrecen limpiar filtros y explican los filtros activos si no hay coincidencias.

Código: `beta/index.html` líneas 71–79 (estilos), 4411–4495 (reglas, URL y selector), 4573–4603 y 4617–4637 (Productos), 6225–6265 (Para pedir).

## 2. Actividad comercial y archivo de productos

- Productos ofrece “Ventas últimos 30 días”, “Ventas últimos 90 días”, “Sin ventas últimos 90 días” y “Nunca vendidos”. El cálculo contempla ventas directas y componentes de combos; ignora ventas anuladas.
- Se puede archivar o desarchivar una fila o todos los productos seleccionados en el resultado actual. El filtro **Archivados** permite encontrarlos. Cada acción guarda fecha, usuario y tipo de cambio en el historial del producto.
- El archivo retira el producto de Vender, de los combos vendibles y de Para pedir, y elimina su presencia en un ticket o pedido en curso. No borra ventas ni movimientos anteriores; por eso los reportes históricos conservan esos datos. Si se escanea su código en Vender, se ofrece desarchivarlo y agregarlo al ticket.

Código: `beta/index.html` líneas 3663–3674 (búsqueda), 3722 (escaneo), 4260–4261 (control al cobrar), 4412–4444 (filtros), 4507–4523 (archivo y recuperación), 4601–4664 (acciones y tabla), 5791–5818 (historial), 3108 (faltantes).

## 3. Apertura obligatoria de turno y recordatorio

- El alta pregunta si el comercio usa turnos. La preferencia y las horas del recordatorio (1 a 72, ocho por defecto) también se editan en Configuración.
- Si está activada, Vender muestra una pantalla de apertura con fondo inicial y responsable. El punto de venta y el cobro quedan bloqueados hasta una apertura explícita. Una sesión creada por otra operación no cuenta como apertura de turno.
- Al superar el umbral aparece un aviso no bloqueante para dueño o empleado: cerrar y abrir uno nuevo, o seguir. Posponerlo retrasa el próximo aviso por el mismo número de horas. El cierre requiere permiso de Caja y nunca ocurre automáticamente.
- Con turnos desactivados se mantiene el flujo de venta existente.

Código: `beta/index.html` líneas 3838–3899 y 4260 (apertura, aviso y control de venta), 4445 (estado), 7314–7318 y 7537–7539 (Caja y reapertura), 8357–8361 y 8474–8485 (Configuración), 12161 y 12191–12241 (alta). `REV31-MIGRACION.sql` líneas 8–64 añade las preferencias y su escritura autorizada.

## 4. Ajuste de stock más claro

- El ajuste ofrece **Agregar**, **Descontar** y la opción existente de **Fijar el stock real**. La cantidad se escribe positiva y tiene botones − y +.
- Antes de confirmar muestra “Stock: actual → resultante” y destaca un resultado negativo. En ese caso pide confirmación. El motivo sigue siendo obligatorio.
- El movimiento conserva signo, motivo, usuario y fecha/hora en el historial.

Código: `beta/index.html` líneas 4446–4449 (cálculo) y 5731–5789 (formulario, validación y registro).

## 5. Barra lateral

- En el primer uso aparece expandida. El botón de colapsar o expandir sigue visible en ambos estados.
- El estado queda guardado en el navegador entre sesiones. Al colapsarla, cada sección muestra su nombre como ayuda al pasar el puntero.

Código: `beta/index.html` líneas 44–46 y 65–70 (estilos), 619 (botón), 3435–3447 y 3450–3472 (estado, controles y títulos).

## Datos, sincronización y archivos tocados

- `REV31-MIGRACION.sql`: agrega a productos fecha, usuario e historial de archivo; agrega a la configuración uso de turnos y horas del aviso; incorpora el RPC de preferencias y amplía la proyección de sincronización. Debe aplicarse **antes** de publicar REV31.
- `beta/index.html` líneas 1615–1623, 1643–1644, 1679–1695 y 8998: adapta la subida y bajada de esos campos al contrato V4. Líneas 10687 y otras proyecciones conservan las nuevas preferencias en los respaldos locales.
- `beta/index.html` línea 634, `beta/sw.js` línea 2 e `integrity-manifest.json` revisión 31: mantienen alineadas la identidad de compilación, la caché y las huellas de integridad.
- `tests/beta-rev31-ux.test.cjs`: casos nuevos de rubros, actividad, archivo, turnos, stock, selector, barra, diseño de notebooks y migración. Se actualizaron pruebas anteriores para la nueva versión y el desplazamiento de columnas. `tests/notebook-preview.cjs` permite comprobar la tabla y el selector en una pantalla de notebook.

## Verificación y alcance

**Verificado en código:** la migración y los contratos de sincronización están incluidos; el archivo de un producto no elimina ventas ni movimientos; las reglas de filtro y apertura explícita tienen pruebas específicas. La migración SQL no se ejecutó contra una base de pruebas o pública.

**Verificado localmente:** la suite completa pasó con 100 pruebas y 0 fallas; la sintaxis de JavaScript y el verificador de integridad pasaron. En una vista local de notebook de 1024 × 768 se comprobó que no hay desplazamiento horizontal de la página, que el nombre y las acciones del producto siguen visibles y que el selector responde a mouse, Escape, flechas y Espacio. Esa vista usa datos de prueba locales; no acredita todos los flujos con una sesión autenticada.

**Verificado en el entorno público:** no se verificó esta revisión en la beta pública porque no está publicada. La base pública aún necesita `REV31-MIGRACION.sql`. Para ponerla en servicio corresponde aplicar esa migración, publicar `beta/index.html` y `beta/sw.js` juntos y repetir en la beta pública los escenarios de venta, cierre, archivo y sincronización con cuentas autorizadas.
