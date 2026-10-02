# Diagnóstico del lector de facturas — 02/10/2026

## Resultado

La causa dominante de los fallos recientes está confirmada en producción: Gemini devuelve errores de disponibilidad y límites. La aplicación los presenta con un mensaje genérico que no permite distinguirlos de una factura ilegible. No se encontró evidencia de que estos fallos recientes sean rechazos del emparejador o de la validación del contenido de la factura.

Se hizo una investigación de sólo lectura. No se modificó ni desplegó el lector, no se cambió el cupo ni se invocó Gemini para esta revisión. Se preservaron los cambios locales de comparar turnos REV81.

## Verificado en el entorno público

La función `leer-factura` está ACTIVE, versión 19, con verificación JWT activa. Sus tres archivos son exactamente iguales a los locales; se compararon sus contenidos y hashes:

| Archivo | SHA-256 |
| --- | --- |
| leer-factura/index.ts | 42cbce5bef9d815c923a7efe8cd87602f9725aad426e6e5d7385a6103f8d41a2 |
| _shared/f5-auth-core.mjs | 1b9bac90205dab22c89e01d9c0e1a5e94151fdd1804b0d91f69c108abd6b4e99 |
| _shared/f6-invoice-reader.mjs | d9696958c4ed337ac0b2cd2113934681a089c0da778dcec21e8d306715302e13 |

Ventana de logs de ejecución: 01/10/2026 18:51:17 UTC a 02/10/2026 18:51:17 UTC, equivalente a 15:51:17 de Argentina en ambos días.

| Evento del proveedor registrado | Cantidad | Interpretación |
| --- | ---: | --- |
| F6_GEMINI_PROVIDER_ERROR, HTTP 503, UNAVAILABLE | 24 | Google no pudo atender la solicitud; no hubo lectura para validar. |
| F6_GEMINI_PROVIDER_ERROR, HTTP 429, UNKNOWN | 38 | Google rechazó por límites; los logs actuales no permiten distinguir límite por minuto de cuota diaria. |

No aparecen eventos F6_GEMINI_PROCESSING_ERROR ni F6_IA_TELEMETRY_ERROR en ese conjunto consultado. La consulta de respuestas HTTP del lector muestra 37 respuestas 429, 23 respuestas 503 y 5 respuestas 200 en la misma ventana. Son fuentes diferentes que no coinciden fila por fila; no se infiere una cantidad adicional de solicitudes a partir de la diferencia.

Las reservas de octubre del comercio con mayor actividad muestran 66 intentos, 5 con resultado registrado, límite 100 y 34 restantes al consultar. El otro comercio del proyecto muestra 2 intentos, 1 con resultado y 98 restantes. No se incluyen identificadores ni datos de facturas en este informe. El cupo mensual de la aplicación no estaba agotado. Los errores 429 consultados se registraron como fallos de Google, no como LIMITE_IA_MENSUAL.

La documentación oficial de [errores de Interactions API](https://ai.google.dev/gemini-api/docs/api-errors) distingue rate_limit_exceeded/too_many_requests de quota_exceeded y describe service_unavailable como indisponibilidad o sobrecarga. La [guía de diagnóstico de Gemini](https://ai.google.dev/gemini-api/docs/troubleshooting) recomienda esperas crecientes entre reintentos cuando el error permite reintentar. Esa documentación apoya la interpretación; los detalles de la cuota de Google de este proyecto no fueron consultados.

## Verificado en código

1. **Aviso genérico en el navegador.** `leerFacturaFoto` distingue tamaño, formato, límite mensual, timeout y FACTURA_NO_RECONOCIDA. IA_NO_DISPONIBLE y IA_AGOTADA_TEMPORALMENTE caen ambos en «No pude leer la factura automáticamente. Cargala a mano abajo». El mensaje no explica que falló el proveedor.
2. **No hay reintento controlado del proveedor.** La función hace una sola solicitud a Gemini. Si recibe 503 o 429, devuelve el fallo inmediatamente; no hay espera creciente ni recuperación dentro de la misma lectura.
3. **Los fallos también consumen cupo.** La RPC reserva una lectura antes de llamar al proveedor. El registro queda aunque Google falle y no haya resultado. El cliente genera un requestId nuevo cada vez que el usuario vuelve a intentar, por lo que cada intento manual vuelve a consumir cupo. Es el contrato actual de intentos, no un doble conteo espontáneo.
4. **Clasificación insuficiente de 429.** El clasificador reconoce RESOURCE_EXHAUSTED/cuota, pero el código actual rate_limit_exceeded puede quedar UNKNOWN. No se registra el código estructurado del proveedor ni Retry-After. Por eso no puede afirmarse si los 429 históricos corresponden a solicitudes por minuto o a cuota diaria. El cuerpo original del error no se conserva.
5. **La validación rechaza la lectura completa.** Una sola fila con cantidad/precio negativos, unidadesPorBulto menor a 1, números como texto o campos numéricos faltantes produce F6_GEMINI_OUTPUT_INVALID para toda la factura. Un descuento global mayor que la base de mercadería también lo hace. Una respuesta incompleta produce F6_GEMINI_INCOMPLETE. Son posibles causas adicionales, pero no se observaron como causa de los fallos recientes.
6. **La función confunde algunos errores con una factura ilegible.** Errores 400/422 del proveedor se convierten en FACTURA_NO_RECONOCIDA aunque puedan ser parámetros inválidos; diversas excepciones dentro de procesamiento también se agrupan en ese código. Es una debilidad del diagnóstico, sin esos estados registrados en la ventana consultada.

El modelo configurado es gemini-3.8-flash, salida máxima 16.384 tokens, espera máxima del proveedor 90 s e imagen máxima 8 MB. Los resultados exitosos recientes descartan una incompatibilidad permanente del modelo, de la autenticación o del esquema para todas las solicitudes. No descartan problemas ocasionales o imágenes concretas.

## Verificado localmente

- 27/27 pruebas focales del lector y tratamiento financiero aprobadas.
- `entregables/diagnostico-lector-2026-10-02/reproducir-validacion.cjs`: lectura válida aceptada; seis variantes sintéticas rechazadas por validación; respuesta incompleta rechazada; clasificación rate_limit_exceeded reproducida como UNKNOWN.
- Las reproducciones no acceden a la red ni usan facturas reales.

## Prioridad de corrección propuesta

Primero distinguir en pantalla indisponibilidad de Google, límite temporal, cuota de Google y factura no reconocida. Luego registrar el código estructurado del proveedor sin guardar imágenes, textos de factura, credenciales ni cuerpos completos de error. Incorporar reintentos acotados sólo para errores transitorios y con una sola reserva por acción del usuario; no reintentar una cuota diaria agotada como si fuera saturación.

Separadamente, revisar el contrato del cupo para decidir si fallos sin lectura deben seguir consumiéndolo; modificar esa regla requiere mantener protección contra abuso y concurrencia. Si se quiere una alternativa de modelo, revisar antes compatibilidad del esquema y telemetría: la RPC actualmente exige exactamente gemini-3.8-flash, por lo que no alcanza con cambiar una constante.

La tolerancia a filas inválidas necesita un diseño que las marque para revisión y conserve su origen, sin asignar productos ni alterar dinero/stock automáticamente. No conviene aceptar silenciosamente valores negativos como si fueran una compra normal.

## Límite de la conclusión

Se comprobó el fallo proveedor → función con logs reales, el estado del cupo y el código desplegado. No se reprodujo desde la sesión autenticada del usuario ni se examinó una foto nueva contra Gemini durante esta investigación. El mensaje exacto mostrado al usuario se pidió para contrastar el síntoma; no es necesario para la causa dominante ya observada.
