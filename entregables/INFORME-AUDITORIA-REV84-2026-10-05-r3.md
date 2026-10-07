# Auditoría REV84 — tercera entrega, 05/10/2026

R-01 a R-04 corregidos y verificados localmente. Esta entrega prepara el paquete r3; la corrección pública y las lecturas reales permanecen pendientes. El ZIP r2 se conserva intacto: SHA-256 `035542bfcb8033ea2b9acd2e904d3d1a5bc552ac082a7252c1487a11b7829f1d`, cotejado con el archivo y su registro externo.

## Verificado en código

| Hallazgo | Corrección |
|---|---|
| R-01 | En la revisión REV84, cualquier bulto mayor que 1 informado por la IA requiere una decisión válida, aunque el texto no revele el pack. Antes de decidir se conserva la cantidad impresa sin multiplicarla. Se ofrece el número sugerido cuando está entre 2 y 144. La decisión guardada se reutiliza solo para el mismo proveedor, producto y pack; la memoria vieja o sin columnas de decisión no autoriza conversiones. |
| R-02 | Desplegable y candidato usan la misma selección. Conservan el bulto visible; un cambio de producto invalida la decisión y vuelve a bloquear hasta confirmar. Seleccionar de nuevo el mismo producto conserva una decisión vigente. |
| R-03 | El detector compartido excluye decimales y medidas GRS, KGS, LT, LTS, CM3, MG, M y MTS, además de las anteriores. No devuelve sugerencias mayores que 144. Si la IA propone un valor mayor, se pide cantidad manual sin ofrecer un botón que multiplique por ese valor. |
| R-04 | Una fila de mercadería sin producto indica «Elegí cuál es» si tiene candidatos, o «Sin coincidencia» si no los tiene. Conserva el bloqueo y el descarte expreso. |

No se pretende reconocer todos los formatos de texto: para los no reconocidos se verifica también el bulto de la IA. Los paréntesis siguen excluidos del detector por posibles códigos; `(X40)` requiere decisión cuando la IA informa 40. Una medida con IA en 1 no pregunta; si la IA informa un bulto mayor, pregunta aun cuando parezca una medida. Una cantidad manual puede ser de 1 a 1000, con confirmación explícita; 144 limita únicamente la sugerencia automática. Las filas cero y no mercadería siguen sin cargarse automáticamente, pero conservan evidencia para exigir una decisión si la persona las convierte en mercadería. Conservan como fijo el descuento global que ya les asignó el lector; esa parte no vuelve a repartirse sobre los demás productos.

Identidad: REV84, edición `2026-10-05-r3`; caché `micomercio-beta-6.0.0-f6-rc2-rev84-r3`. HTML, service worker, manifiesto y prueba de identidad alineados. Migraciones y adaptadores de proveedores sin cambios respecto de r2; cambia su detector compartido de evidencia. Se conservan reglas de importes, impuestos, cupo y tiempos de subida.

## Verificado localmente

- Suite Node completa final: **507/507**, sin fallos ni omisiones. Las cinco regresiones funcionales iniciales fallaron contra r2 antes de corregir; dos adicionales reprodujeron los caminos de reclasificación y reparto detectados durante la revisión. La primera suite sin permiso de puertos locales dio 498/499 por `EACCES` en el arnés; se repitió con acceso a localhost. La primera suite r3 dio 503/505 por dos comprobaciones anteriores de implementación/caché, actualizadas a la selección común y la edición. La suite intermedia dio 505/505; después de las dos correcciones de revisión, la final dio 507/507.
- R-01: ambos adaptadores con respuestas sintéticas pasan por el cliente real: `2.25X6`, `2,25LTX6`, `(X40)`, `6U`, `6X473`, `36X118G` y descripción sin pack. Se verifica bloqueo, cantidad previa, decisiones pack/unidad y conservación del importe. Se comprueba memoria propia, cambio de proveedor/pack y columnas de decisión ausentes.
- R-03: medidas de la auditoría, decimales, límite 144/145, medida junto a pack y caja excesiva. No se usa proveedor real para estas pruebas.
- Navegador nuevo: **12/12 casos**, seis en cada ancho 1366/390: selección por ambos caminos, rótulos/descarte, cuatro descripciones con bulto solo informado por IA, cambio de producto, promoción de filas cero/financieras y sugerencia 750. Sin errores de página ni desborde horizontal.
- Ocho recorridos anteriores del lector: auditoría r2, revisión, reintento, subida, compatibilidad REV83, costos, diagnóstico REV82 y proveedores REV83. Todos aprobados en 1366/390; costos **6/6 en cada ancho**. IA, sesión y nube simuladas, red externa bloqueada.
- SQL real local PostgreSQL **18.4**: memoria y cupo, idempotencia, RLS, compatibilidad, concurrencia y reversión aprobados. Sin cambios de SQL ni ejecución en producción.
- Integridad: **33 archivos críticos**, comprobación de hashes y búsqueda de secretos privados aprobadas. La entrega excluye credenciales, fotos y datos privados.
- Revisión independiente única: detectó el camino de filas inicialmente cero/financieras y la inclusión accidental de su descuento en el reparto; ambos reproducidos y corregidos con pruebas. Evaluación final sin hallazgos accionables restantes dentro de R-01 a R-04. No se atribuye al revisor la verificación del navegador, que en su entorno se bloqueó por permisos.

## Verificado en el entorno público

Consulta de solo lectura del 05/10 (hora argentina): beta HTTP 200, web y caché REV83; Supabase confirma `leer-factura` ACTIVE v23 con JWT requerido. Esta consulta confirma el estado vigente, no la corrección pública r3.

No hubo publicación, migraciones públicas, llamadas a OpenAI/Gemini ni escrituras públicas. Repetir el escenario corregido en la beta requiere desplegar previamente la revisión y autorizar la lectura real. Siguen pendientes por separado memoria/cupo, comparativas pagas y medición temporal del gateway; no se presenta la subida lenta como corregida en producción.

Limitación de actualización: el aviso de versión compara el número REV y no la edición. Una pestaña r2 abierta no avisa del paso a r3 hasta recargar; r2 no fue publicada y el salto público REV83→REV84 sí cambia ese número. No se amplió ese mecanismo en esta corrección local.

## Integridad de la entrega

`entregables/VERIFICACION-ZIP-REV84-2026-10-05-r3.json` se incluye dentro del ZIP con pruebas de fuente y hashes críticos. `INDICE-ARCHIVOS-REV84.json` enumera todos los archivos del paquete. El registro externo `HASH-ZIP-REV84-2026-10-05-r3.json` informa el SHA-256 final, el cotejo fuente/ZIP/extracción y la suite completa repetida sobre la extracción. Así se evita incluir el hash del propio ZIP dentro del ZIP.
