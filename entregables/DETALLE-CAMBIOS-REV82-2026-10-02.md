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

Pendiente al preparar este documento. La versión activa previa de leer-factura es v19 con JWT habilitado y corresponde a la base REV80. La comprobación pública y el resultado del próximo intento real deben registrarse por separado. Este cambio mejora el diagnóstico: no confirma que los rechazos de Google estén resueltos.

Referencias del contrato: [Errores Interactions de Google](https://ai.google.dev/gemini-api/docs/api-errors), [manejo de errores de Edge Functions](https://supabase.com/docs/guides/functions/error-handling).
