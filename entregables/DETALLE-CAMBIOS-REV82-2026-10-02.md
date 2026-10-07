# REV82 — diagnóstico visible del lector (02/10/2026)

El usuario pidió identificar primero la causa de los fallos del lector: mostrar claramente por qué falló. Esta revisión incorpora el diseño de Comparar turnos ya aprobado en REV81 y agrega diagnóstico, sin cambiar reintentos, cupo, modelo ni reglas de validación.

## Cambios

- Aviso persistente dentro de Cargar factura, fuera del botón de elegir foto. Detalle desplegable y Copiar detalle; se limpia al comenzar otra lectura.
- Diferencia límites de Google por frecuencia, cupo diario o cuota no especificada del límite mensual del comercio. Un 429 ambiguo no se atribuye a un límite concreto.
- Diferencia indisponibilidad, autorización/configuración, tiempo del proveedor frente al tiempo de espera del lector, conexión, respuesta mal formada, reserva y registro del resultado.
- Si una fila invalida la factura, muestra fila (desde 1), campo y motivo. Se conserva el rechazo estricto; no se acepta una factura parcialmente inválida.
- Respuesta incompleta y lista vacía explicadas; un rechazo de solicitud de Google ya no se presenta como foto ilegible.
- Errores transitorios de Auth no se presentan como sesión vencida. Un recurso ausente de Google no se atribuye automáticamente al modelo.
- Referencia de solicitud para relacionar el aviso con registros del servidor. Sólo categorías conocidas, etapa, estados, fila/campo y espera indicada por Google. No se muestran ni registran fotos, productos, mensajes crudos, credenciales ni errores SQL completos.
- Identidad HTML, caché y manifiesto avanzan juntos a REV82. Sin migraciones ni cambios en datos operativos.

## Verificación local

Se agregaron 11 pruebas de comportamiento: ejecutan el handler real con transporte/Auth/RPC sintéticos, validación real y mensajes reales. Se observaron fallos antes de implementar; cubren reserva única, llamada única, privacidad, éxito, 429, 400, caída, conexión, timeout, respuesta JSON, fila inválida, telemetría, Auth y códigos actuales/legacy. Todos los 434 casos locales pasan.

Navegador a 1366 y 390 px: aviso persistente, detalle, referencia, carga manual, sin desborde y limpieza al segundo intento; sin página con errores. Comparar turnos REV81 conserva su recorrido. Integridad de 25 archivos. La revisión independiente encontró dos clasificaciones confusas; corregidas con regresiones.

Evidencia: `entregables/lector-diagnostico-REV82/`; recorridos `tests/browser-lector-diagnostico-rev82.cjs` y `tests/browser-stock-rev81.cjs`. No se consume Gemini en pruebas sintéticas.

## Publicación

Publicada el 02/10/2026. Se comparó el lector previo v19 con la base REV80; los tres archivos coinciden. El despliegue v20 está ACTIVE, JWT habilitado y sus tres archivos coinciden exactamente con la fuente local. No se aplicaron migraciones ni se escribieron datos operativos.

Web: commit `53e932875050e45399bd18843178267dfdf857d6`, GitHub Pages run `37054355419`, completed/success. HTML público SHA-256 `f6f1177001193dc62810714b3bcd2f67f0601e35b5021a8ecedd5623ef71d195`; service worker `dd55a0633e871496c706b13749862f51b98481c92e6aa4671ff0bdf033e162ef`, ambos iguales al manifiesto REV82.

Comprobación pública: OPTIONS 204 y POST sin sesión 401; lector y Comparar turnos a 1366/390 px sobre el HTML público con sesión, datos y fallos sintéticos. Se bloqueó todo acceso de negocio al backend; sin lecturas de Gemini ni confirmación de facturas. Capturas con prefijo `publico-`. Para repetir los recorridos públicos, configurar `PUBLIC_BETA=https://micomercio.ar/beta/` al ejecutar sus scripts. Esto comprueba la interfaz publicada, no el resultado de una factura real contra Google.

La causa del siguiente fallo real sigue pendiente: el aviso permite copiar su referencia para relacionarlo con los registros. Este cambio mejora el diagnóstico; no confirma que los rechazos de Google estén resueltos. La actualización documental posterior conserva los mismos artefactos publicados.

Referencias del contrato: [Errores Interactions de Google](https://ai.google.dev/gemini-api/docs/api-errors), [manejo de errores de Edge Functions](https://supabase.com/docs/guides/functions/error-handling).
