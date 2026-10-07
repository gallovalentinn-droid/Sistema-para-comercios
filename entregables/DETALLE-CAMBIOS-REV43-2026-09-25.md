# MiComercio — detalle de cambios REV43

**Fecha:** 25/09/2026. **Beta:** https://micomercio.ar/beta/
**Código publicado:** `8f121eb` en `main`.

## Cambios

1. **Productos sueltos de un atado.** El formulario tiene un buscador de atados por nombre o código de barras. El selector muestra hasta 60 coincidencias a la vez y conserva visible el atado ya elegido al editar. Esto evita recorrer miles de opciones sin perder la selección actual.
2. **Posición en Productos.** Al guardar, archivar o actualizar la vista se conservan el desplazamiento de la página y el de la tabla de productos. Al pasar a otra sección, la nueva vista comienza arriba.
3. **Inicio y sincronización.** Cada consulta de arranque dispone de su propio plazo de ocho segundos. Antes, varias consultas correctas podían consumir juntas el plazo total y terminar en un falso error de conexión. Al volver la red, las operaciones pendientes de una misma caja se envían consecutivamente y en orden, sin esperar quince segundos entre cada una. Una operación fallida detiene las siguientes de esa caja hasta el reintento.
4. **Recuperación de datos locales incompletos.** El primer pull compara el número de productos, clientes, ventas y cierres locales con los registros del comercio en el servidor. Si faltan registros, reinicia los cursores y vuelve a descargarlos; también contempla ventas propias ya confirmadas. Si hay operaciones locales sin confirmar, pospone esta reconstrucción para no reintroducir una edición pendiente.
5. **Versión y caché.** HTML, service worker, manifiesto de integridad y pruebas identifican la REV43.

## Comprobaciones

- **En código:** las consultas de datos V4 siguen limitadas al comercio y la corrección no incluye borrados ni cambios de registros en Supabase.
- **Localmente:** 165 de 165 pruebas aprobadas; scripts del HTML válidos; verificación de integridad correcta para los 14 archivos del manifiesto. Las pruebas nuevas cubren búsqueda de atados, conservación de la selección y la posición, apertura prolongada, drenaje ordenado y reconstrucción de datos faltantes con operaciones pendientes.
- **En el entorno público:** el 25/09/2026, `beta/index.html` y `beta/sw.js` sirvieron REV43 y sus SHA-256 coincidieron exactamente con los archivos probados. La beta abrió la pantalla de ingreso en el navegador.

La base del comercio Kiosco de Ponce conservaba sus productos, ventas y cierres al revisarla; la falla observada era compatible con una copia local incompleta. **La sincronización autenticada en los dos dispositivos del comercio no pudo repetirse desde esta sesión**, porque aquí no se dispone de sus sesiones ni de su almacenamiento local. Por eso la comprobación pública anterior no equivale a confirmar que ambos equipos ya muestran todos los datos.

Para recibir REV43 en una pestaña abierta, recargar `https://micomercio.ar/beta/` y esperar la descarga inicial. No borrar los datos del navegador. Si sigue apareciendo el aviso, registrar una captura y la hora para identificar la solicitud que falló.
