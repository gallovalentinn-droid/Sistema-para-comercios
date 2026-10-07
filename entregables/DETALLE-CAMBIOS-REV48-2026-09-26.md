# MiComercio — cambios de REV48

Fecha: 26/09/2026

## Cambios

1. **Barra lateral:** Compras aparece arriba de Productos.
2. **Pestañas de Compras:** Cargar factura ocupa el primer lugar y es la vista inicial. Para pedir queda en segundo lugar. Si un usuario sólo tiene permiso para pedir, se abre esa pestaña; si sólo puede cargar facturas, se abre la de factura.
3. **Aviso de productos para pedir:** el contador rojo ya no aparece junto a Compras en la barra lateral ni en la pestaña de factura. Sólo se muestra en la pestaña Para pedir cuando está abierta y hay productos que alcanzaron el mínimo.
4. **Publicación:** la identidad del cliente, la caché y el manifiesto de integridad se actualizaron a REV48.

## Verificación

- **Código:** se revisaron el orden de navegación, las condiciones de aparición del contador y los permisos de ambas pestañas.
- **Local:** 184 de 184 pruebas aprobadas; sintaxis del cliente válida; integridad correcta de 14 archivos; `git diff --check` sin errores. La prueba de Compras cubre el orden, la vista inicial y que el contador aparezca únicamente al abrir Para pedir.
- **Beta pública:** después de publicar `4bd55aa` en `main`, los SHA-256 de `beta/index.html` y `beta/sw.js` entregados por `https://micomercio.ar/beta/` coincidieron exactamente con los archivos locales REV48. La pestaña pública disponible estaba en la pantalla de ingreso, por lo que no se realizó una prueba visual autenticada de Compras ni se modificaron datos reales.

El ZIP de REV48 contiene el sistema, las pruebas, las dependencias locales, las migraciones y los informes incluidos en el repositorio hasta esta revisión.
