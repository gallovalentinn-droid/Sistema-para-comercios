# MiComercio — correcciones REV34

**Fecha:** 23/09/2026  
**Base:** REV33 (`191a6f2`)  
**Alcance:** exportaciones, textos y controles de Productos y Caja.

## Cambios

1. **Resumen → Descargar detalle:** el CSV de productos vendidos usa `;`, decimales con coma, BOM UTF-8 y saltos CRLF. Conserva los textos entre comillas y protege los nombres que podrían interpretarse como fórmulas. Las cantidades y los importes se serializan como números.
2. **Singulares:** Productos y Para pedir muestran «1 producto en el resultado» y «1 producto llegó al mínimo» cuando corresponde. También se ajustaron el encabezado de Productos, los avisos de exportación y «Archivar 1 seleccionado».
3. **Pie lateral:** cuenta sólo los productos activos y lo indica explícitamente; los archivados siguen disponibles en la vista de archivados y en la exportación completa.
4. **Archivo del catálogo:** «Archivado el» se exporta en el formato de fecha y hora visible del sistema, tanto en CSV como en Excel. Es una columna informativa: reimportarla no modifica el estado de archivado.
5. **Historial de cierres:** las diferencias generales y de cigarrillos incluyen el símbolo `$`, con el signo delante del importe.
6. **Cierre de caja:** cuando falta un conteo, aparece junto al botón deshabilitado qué caja hay que contar. Al completar los conteos, el botón se habilita y la ayuda desaparece. Se puede escribir `0` cuando no hay efectivo.
7. **Archivo en lote:** antes de archivar varios productos se muestra una confirmación que explica el efecto sobre la lista activa, los pedidos y los tickets pendientes. Cancelar conserva los productos y la selección.

## Archivos principales

| Archivo | Cambio |
| --- | --- |
| `beta/index.html:3107` | Plurales y cuenta de activos del pie. |
| `beta/index.html:4524` | Etiqueta y confirmación antes de archivar en lote. |
| `beta/index.html:4643` | Contador de Productos; Para pedir en las líneas 6311 y 6342. |
| `beta/index.html:7358` | Formato monetario de diferencias y motivo del cierre; botón y ayuda en las líneas 7510–7558. |
| `beta/index.html:8176` | Fecha de archivo legible; CSV de Resumen en las líneas 8209–8218. |
| `beta/index.html:634`, `beta/sw.js:2` | Identidad y caché REV34. |
| `integrity-manifest.json` | Revisión y hashes del HTML y del service worker actualizados. |
| `tests/beta-rev34-details.test.cjs` | Casos para CSV, fechas, singular, activos, diferencias, ayuda de cierre y confirmación. |
| Pruebas existentes de catálogo, Caja y diseño | Ajustadas para ejercitar las nuevas dependencias y REV34. |
| `tests/notebook-preview.cjs` | Vista local de Caja actualizada para mostrar la ayuda de cierre. |

## Verificación

- **En código:** las siete rutas afectadas usan las funciones corregidas; no se cambió el esquema ni se ejecutaron operaciones de negocio de prueba en Supabase.
- **Localmente:** 119/119 pruebas aprobadas, sintaxis del JavaScript válida, manifiesto íntegro (12 archivos) y vista de prueba sin desbordes ni errores de JavaScript. El botón de cierre mostró el motivo y la prueba funcional comprobó que se habilita al escribir `0`.
- **Beta pública:** el HTML y el service worker entregan REV34. Se confirmó que el pie y el encabezado muestran la misma cantidad de productos activos, que las diferencias del historial incluyen `$`, que el archivo en lote abre una confirmación y que cancelarla no archiva el producto. En Resumen, con un período que tenía ventas, «Descargar detalle» inició la descarga y mostró el aviso de éxito. La última corrección de «1 seleccionado» se comprobó en el código servido públicamente y en las pruebas locales; no se volvió a desbloquear la sesión para repetir ese clic.

## Alcance de la prueba pública

La comprobación pública fue de navegación, selección, cancelación y descarga. No se archivaron productos reales ni se cerró una caja real. El formato de las celdas del CSV y el cambio de estado del botón de cierre se comprobaron con pruebas locales, no con una transacción pública.

Durante el ingreso a Resumen apareció en la consola `Backup nube: Object`. El respaldo local y el estado de sincronización no se analizaron en esta revisión; el aviso queda registrado para diagnóstico separado.
