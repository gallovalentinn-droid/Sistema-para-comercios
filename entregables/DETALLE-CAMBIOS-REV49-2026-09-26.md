# MiComercio — cambios de REV49

Fecha: 26/09/2026

## Cambios

1. **Más opciones en Productos:** el menú ahora es compacto y oscuro, con íconos y filas similares a la referencia enviada. Se conservan Importar Excel/CSV y Exportar catálogo a Excel. Se quitó la opción Exportar catálogo a CSV.
2. **Nombre de la acción:** «Cambiar precios» se reemplazó por «Cambio masivo de precios».
3. **Formulario de cambio masivo:** se organiza en tres pasos: elegir productos, definir el ajuste y revisar el resultado. El selector de rubro o proveedor aparece sólo cuando corresponde. Se mantienen aumento o disminución, porcentaje o monto fijo, redondeo, alcance y posibilidad de deshacer.
4. **Sólo precios de venta:** se eliminó la elección de costo y la aplicación masiva ya no cambia costos ni genera movimientos de costo. Los costos siguen actualizándose al cargar facturas. La vista previa compara precio actual y nuevo, muestra margen previsto y advierte si un precio nuevo queda por debajo del costo.
5. **Validación:** una disminución porcentual superior al 90 % queda bloqueada también al intentar aplicar el lote. Se corrigieron los mensajes de error de Excel para que no sugieran una opción CSV ausente.
6. **Publicación:** el HTML, la caché del service worker, el manifiesto de integridad y las pruebas declaran REV49.

## Verificación

- **Código:** revisé las tres acciones visibles, el circuito de precios de venta y la ausencia de una ruta de cambio masivo de costo.
- **Local:** 187 de 187 pruebas aprobadas; sintaxis del cliente válida; integridad correcta de 14 archivos; `git diff --check` sin errores. La prueba nueva comprueba que un lote cambia precios de venta sin tocar costos y que una baja inválida no se aplica.
- **Beta pública:** después de publicar `60cfad4` en `main`, los SHA-256 de `beta/index.html` y `beta/sw.js` descargados de `https://micomercio.ar/beta/` coincidieron exactamente con los archivos REV49 locales. No se realizó una prueba visual autenticada del formulario ni se modificaron datos reales de comercios.

El ZIP de REV49 contiene el sistema, las pruebas, las dependencias locales, las migraciones y los informes versionados hasta esta revisión.
