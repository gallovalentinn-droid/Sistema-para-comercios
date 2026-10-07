# REV86 — presentación clara y revisión compacta

Pedido: identificar pack/unidad claramente y reducir la sobrecarga del lector. Publicación cubierta por la autorización previa del usuario de migrar y publicar.

## Verificado en código

- Cinco columnas en la revisión. Presentación «Pack xN», «Unidad» o «Presentación a revisar»; cantidad impresa y resultado de stock visibles.
- Correcciones de presentación en «Cambiar» y precio/descuento en «Editar costo», plegadas normalmente. Las filas con stock pendiente abren la elección cuando tienen producto y muestran «Por confirmar» hasta resolverla.
- Conversión automática solamente con pack explícito, IA coincidente y catálogo que identifica el mismo pack o un producto individual. Texto/IA discordantes, presentación ambigua, catálogo contradictorio, producto nuevo, kg y cantidades excesivas requieren decisión. Elecciones manuales vigentes tienen prioridad.
- Indicios de catálogo como 6X710ml, LTX6, 6U, (X6), x750U y packs contradictorios impiden inferir una botella individual. Hallazgo P1 de la revisión independiente reproducido con prueba fallida antes de corregir y aprobada después. Única pasada de revisión; sin otros hallazgos accionables.
- Costo final visible con dos decimales; cálculo interno y costo de operación conservan su precisión. Se mantienen descuentos, impuestos internos y bloqueos por diferencias. Los dos campos quitados en REV85 siguen ausentes.
- HTML/manifiesto REV86 edición 2026-10-06, caché rev86; 33 archivos críticos verificados. Sin cambios de SQL, función, prompt, modelo ni reservas.

## Verificado localmente

513/513 pruebas completas. Navegadores a 1366/390: presentación, revisión, auditoría inicial, doce casos r3, seis casos de costos por ancho, reintentos en ambos modos, proveedores/sectores, subida, diagnóstico y actualización desde REV83. Sin errores de página ni desbordamiento en los escenarios afectados. Conservados los controles financieros y costos con tres decimales al generar operaciones simuladas.

Los primeros intentos de la suite encontraron un bloqueo de localhost y una conversión accidental de saltos de línea; se corrigió el formato sin cambiar lógica ajena y la ejecución completa autorizada pasó. Las expectativas de identidad y acciones de navegador se actualizaron para la edición vigente y los controles plegados.

## Entorno público

Fuente publicada: e6b950b44fffcdcfeda5e26d31f6bb808e8ad64b. Pages 37409635976 completó con success. HTML/SW/manifiesto públicos HTTP 200 e idénticos por SHA-256 a la fuente local (web-hashes.json).

Recorrido público aprobado a 1366/390: packs/unidades y catálogo contradictorio, elección manual, revisión y bloqueos financieros, doce casos r3, seis casos de costos por ancho y auditoría inicial. Sin errores de página ni desbordamiento en los escenarios afectados. Evidencia en los registros públicos y VERIFICACION.json. La navegación utiliza los archivos públicos reales y sustituye Supabase por un stub; no prueba una lectura autenticada real ni la escritura del stock público.

## Alcance de la evidencia

Pruebas con respuestas y productos sintéticos, Supabase simulado y escrituras externas bloqueadas. No se hicieron llamadas pagas ni compras/stock reales. No se modificó la extracción de IA ni se midió su precisión con otra foto. Las diferencias numéricas de la captura del usuario siguen sujetas a revisión con la factura original; simplificar la interfaz no demuestra corregir esos importes. Capturas del usuario y catálogo real no publicados. ZIP REV84 histórico conservado.
