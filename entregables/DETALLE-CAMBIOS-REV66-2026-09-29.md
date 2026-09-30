# MiComercio REV66 — la lista de Productos vuelve a verse como antes

Fecha: 29/09/2026.
Base: REV65 publicada (`b39e6e5`).

## Por qué

Desde REV62, la lista de Productos cambió en tres aspectos:

- Los productos sin foto dejaron de mostrar el recuadro con la inicial. Por eso los nombres sin foto empezaban más a la izquierda que los que tienen foto.
- El stock pasó a decir «Sin stock · 0» y «Bajo · 3».
- En pantallas anchas, «Historial» y «Archivar» quedaron solo con ícono.

La lista resultaba confusa y desprolija. REV66 vuelve al aspecto de REV61.

## Qué cambia

1. **Foto o inicial en todos los productos.** Un producto sin foto vuelve a mostrar su inicial en el mismo recuadro que la foto, así todos los nombres quedan alineados en la misma columna.
2. **Stock como antes.** El recuadro muestra solo la cantidad: en rojo si es 0 o menos, y en gris en los demás casos. Debajo siguen «mín» e «ideal».
3. **Acciones con texto en pantallas anchas** (más de 1904 px): «Editar», «Ajustar», «Historial» y «Archivar» vuelven a verse con su nombre. En pantallas de hasta 1904 px siguen como íconos compactos, igual que en REV61.
4. **Sin corte a la derecha.** REV65 había pasado «Historial» y «Archivar» a íconos para que no se cortaran con códigos o rubros muy largos. En su lugar, REV66 acota esas dos columnas en pantallas anchas:
   - un código de más de ~15 dígitos se recorta con «…»;
   - un rubro de más de ~25 letras se recorta con «…»;
   - en los dos casos el texto completo aparece al pasar el cursor;
   - mientras se seleccionan productos, la columna Código se oculta.

   Los rubros y códigos habituales (por ejemplo, «TOMATES Y CONSERVAS» o un EAN de 13 dígitos) se ven completos.

**Sin cambios:** buscador y «Filtros», modo «Seleccionar», vista de celular con «Ver detalles», ventas, stock, caja y datos. No hay migraciones SQL.

## Archivos

- `beta/index.html`:
  - `miniFoto` (inicial cuando no hay foto);
  - celda de stock;
  - CSS de la tabla para pantallas de 1905 px o más;
  - clase `product-selecting` en la tabla mientras se selecciona;
  - `title` con el código y el rubro completos;
  - `packageRevision:66`.
- `beta/sw.js`: caché `micomercio-beta-6.0.0-f6-rc2-rev66`.
- `integrity-manifest.json`: revisión 66 y hashes nuevos.
- `tests/beta-productos-como-antes-rev66.test.cjs` (nueva) y `tests/beta-products-numeric-table.test.cjs` (stock como antes); pruebas de identidad pasadas a REV66.
- `entregables/pruebas-navegador-REV62/qa.cjs`: la comprobación de stock se adaptó al formato restaurado.
- `entregables/pruebas-navegador-REV66/`: prueba de navegador y capturas a 1920, 1366 y 390 px.

## Verificación

- **Pruebas automáticas:** 272 de 272 aprobadas.
- **Integridad:** correcta en 20 archivos, sin secretos. Sintaxis correcta y ESLint sin identificadores indefinidos.
- **Navegador (Chromium, sin red externa):**
  - `pruebas-navegador-REV66/productos.cjs` pasa a 1920, 1366 y 390 px: todas las filas con foto o inicial, nombres alineados, stock solo con la cantidad, «Historial» con texto a 1920 px y sin desplazamiento horizontal.
  - Pasa también la prueba de esfuerzo de REV65 (`pruebas-navegador-REV65/qa.cjs`), con códigos de 19 dígitos, rubros de 38 letras, costos de $966.667 y «Abrir atado», a 1366, 1919, 1024 y 390 px, con y sin selección.
  - Siguen pasando los recorridos de REV62, REV63 y REV64.
- **Límite:** las pruebas usan datos ficticios y no se conectan al servidor. Después de publicar, conviene abrir Productos en la computadora del mostrador y comprobar que se vea igual que en las capturas.
