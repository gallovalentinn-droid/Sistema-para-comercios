# MiComercio — cambios REV33

**Fecha:** 23/09/2026
**Base:** REV32 (`10614fa`)
**Alcance:** correcciones de la auditoría funcional REV32 y preparación de la publicación de la beta.

## Qué cambió

1. **El catálogo conserva unidad, vencimiento y códigos al exportar e importar.** El importador ahora reconoce las columnas `Unidad` y `Vencimiento`, acepta `unidad`/`u` y `kg`, y valida fechas ISO o `DD/MM/AAAA`. Aplica esos datos tanto al crear como al actualizar productos. El lector de CSV propio mantiene los códigos de barras como texto, incluidos los ceros iniciales. La vista previa señala productos por kilo y vencimientos. La plantilla de ejemplo incluye las dos columnas nuevas.
2. **Los ajustes de cierre pendientes se recuperan en instalaciones existentes.** La revisión de los cursores `cierre_ajustes_created` y `cierre_ajustes_resueltos` usa un indicador nuevo. Por eso se ejecuta una vez incluso si el dispositivo ya había completado la revisión de cierres de REV17. El cursor de `cierres_caja` no se reinicia en ese caso.
3. **La barra lateral se puede desplazar en notebooks de poca altura.** Se fijó una altura mínima flexible para la lista y desplazamiento vertical propio. El pie permanece visible. La barra inferior de celulares conserva su desplazamiento horizontal.
4. **El fondo inicial acepta la escritura argentina de importes.** El campo permite `15.000` y `15.000,50`, valida el valor y evita guardar `15` cuando se quiso ingresar `15.000`.
5. **Excel se carga desde el mismo paquete.** La biblioteca que antes venía del CDN quedó en `beta/vendor/`, con su licencia, y se precarga en la caché de la beta. Los CSV se leen sin depender de esa biblioteca.
6. **El CSV se abre por columnas en Excel configurado en español.** La exportación del catálogo usa punto y coma, coma decimal, UTF-8 con BOM y saltos CRLF. Sigue escapando comillas y evitando que textos que empiezan como fórmulas se ejecuten al abrirlos en una planilla.
7. **La migración requerida conserva los permisos de base.** REV31 añade las columnas y funciones necesarias para archivado y turnos. Se cerraron los permisos implícitos de la nueva función privada y del RPC antes de aplicarla a la beta.

## Archivos y líneas principales

| Archivo | Líneas | Cambio |
| --- | ---: | --- |
| `beta/index.html` | 11, 47, 634 | Biblioteca local, menú lateral y revisión de paquete. |
| `beta/index.html` | 3843–3853 | Lectura y validación del fondo inicial. |
| `beta/index.html` | 5070–5170, 5200–5220, 5254–5406 | Mapeo, lectura y aplicación de CSV/Excel, unidad y vencimiento. |
| `beta/index.html` | 8136–8160 | CSV regional y protección de celdas. |
| `beta/index.html` | 9557–9568 | Recuperación independiente de ajustes de cierre. |
| `beta/sw.js` | 2–3 | Identidad REV33 y biblioteca local en caché. |
| `integrity-manifest.json` | 3, 9–13 | Revisión y hashes de 12 archivos. |
| `beta/vendor/xlsx-0.18.5.full.min.js`, `beta/vendor/LICENSE-xlsx-0.18.5.txt` | — | Biblioteca fijada localmente y licencia Apache 2.0. |
| `REV31-MIGRACION.sql` | 59, 92–94 | Permisos explícitos de las funciones nuevas. |
| `tests/beta-rev33-audit.test.cjs` | 19–151 | Pruebas de las seis correcciones y del recorrido exportar→importar. |
| Pruebas previas de productos, Caja y auditoría | — | Identidad REV33 y formato CSV actualizados. |

## Verificación

- **Código:** los seis puntos de la auditoría se contrastaron con esta revisión. El importador conserva `kg`, vencimiento y EAN al crear y actualizar; la reparación de ajustes se ejecuta con el indicador anterior ya activado.
- **Local:** `node --test tests/*.test.cjs` → **111/111** pruebas aprobadas. `node tools/verificar-integridad.cjs` → **12 archivos correctos**, sin secretos privados detectados. La beta local cargó Excel desde `/beta/vendor/` y el navegador no registró errores de JavaScript. Con el CSS de la beta a **1366×720**, el menú tuvo desplazamiento vertical y Soporte quedó visible al llegar al final.
- **Entorno público:** la comprobación de publicación se registra por separado en `INFORME-PUBLICACION-REV33.md`.

## Límites de la importación

- `Estado`, `Archivado el` y `Archivado por` salen en la exportación para consulta, pero **no modifican el archivado** al reimportar. Si se reconstruye un catálogo vacío a partir de una exportación, los productos archivados se crearán activos. La importación de catálogo no reemplaza una copia de seguridad del sistema.
- Un CSV abierto con doble clic en Excel puede perder los ceros iniciales de códigos aunque el archivo exportado y el importador los conserven. Para editar y reimportar con Excel, conviene usar `.xlsx`.
- La importación y los flujos autenticados requieren una comprobación con una sesión autorizada en la beta pública; el detalle de la verificación realizada figura en el informe de publicación.
