# Publicación REV83 — lector GPT y respaldo Gemini

Beta REV83 publicada, 03/10/2026. OPENAI_API_KEY configurada y verificada en Supabase: GPT es el principal para JPEG/PNG/WebP y Gemini es el respaldo para fallos transitorios identificados; HEIC/HEIF se envía a Gemini.

## Verificado en código

GPT-6 Luna principal con las reglas de lectura corregidas y validación de importes; Gemini 3.8 Flash de respaldo ante fallos transitorios identificados. Un solo cupo por lectura y máximo dos solicitudes secuenciales, plazo conjunto de 90 segundos. Sectores superpuestos preparados en beta con resolución y tamaño acotados. Contrato de factura y revisión antes de cargar conservados. Sin credenciales en fuente ni paquete.

Revisión independiente: un hallazgo sobre insuficiencia de cuota en error.type, corregido mediante pruebas rojas y verdes. Se comprobó además que un 429 desconocido y una credencial inválida no activan respaldo.

## Verificado localmente

459/459 pruebas aprobadas; integridad de 28 archivos. Interfaz de computadora (1366 px) y celular (390 px) con la foto aportada: tres sectores, 5.003.457 bytes adicionales, diagnósticos OpenAI/Gemini y apertura de revisión; tres invocaciones simuladas independientes y cero escrituras de productos.

Pruebas reales anteriores del adaptador: 38/38 renglones de la foto de referencia con códigos, cantidades, precios, descuentos y unidades por presentación correctos, sin inventar el total ausente de la página 1/2. Estas llamadas locales no equivalen a una lectura autenticada en la beta pública.

## Verificado en el servidor público

Migración `rev83_lector_doble` aplicada. La telemetría admite ambos modelos; privilegios de ejecución: anon=false, authenticated=false, service_role=true. Prueba transaccional de contrato GPT aprobada sin registrar datos.

Edge Function `leer-factura` v21 ACTIVE, JWT requerido; sus cinco archivos coinciden exactamente con la fuente local. OPENAI_API_KEY guardada correctamente en los secretos privados del servidor con autorización del usuario. La copia pegada contenía texto adicional; se extrajo el valor completo y se comprobó que la huella SHA-256 registrada coincide con la clave local previamente probada. No se muestra ni se incorpora la credencial al informe o paquete. Lectura autenticada posterior aprobada, con límites detallados abajo.

Beta pública https://micomercio.ar/beta/ verificada: GitHub Pages run 37144385820 completado con éxito, commit d5308f022387a101047a34bee32a51b9d6bfa598. HTML SHA-256 16432e21bf045dfd3211a830d63e503e4c22f937ba11a9c4c828ffff020647b2; service worker SHA-256 22600c331eee1038f158ffbe2dbf45276e8fc9421c2f41a3aac2d329680cbc3c. Ambos idénticos a la fuente local.

Recorrido repetido sobre el HTML público en 1366/390 con respuestas simuladas: sectores de la foto, diagnóstico OpenAI, resultado Gemini y revisión de factura; cero escrituras. No equivale a una llamada autenticada real al lector. CORS permitido de micomercio.ar: HTTP 204; POST sin JWT: HTTP 401.

## Lectura autenticada real y rechazo observado

Tras configurar el secreto se observó la referencia bdcc6b0d-13b0-48eb-b725-bc7286f6ef11: OpenAI, validación, ROW_AMOUNT_MISMATCH en subtotal de fila 1, sin respaldo. No se conservan sus valores crudos y no se confirmó que fuera la misma foto aportada. No se cambió código ni se relajó el control de importes.

Se repitió la foto original de Honre/Masmelos: lectura local real aprobada en 42,500 segundos, y lectura autenticada en la beta aprobada. La telemetría de la operación 2f97400c-7c34-40c3-bf4e-8a87136c364e confirma gpt-6-luna, 38 productos y registro de resultado a las 19:19:20 UTC del 03/10/2026. Los 38 códigos, cantidades, precios, descuentos y unidades por bulto de la revisión pública coinciden con la referencia manual. No se confirmó compra ni se aplicó stock. Las evidencias con datos de la factura son privadas, locales y excluidas del paquete. La repetición exitosa no prueba una corrección definitiva del fallo anterior.

## Entrega actualizada

ZIP: entregables/MiComercio-Sistema-Completo-REV83-2026-10-03.zip. Contiene fuente del sistema y actualizaciones SQL, pruebas e instrucciones; excluye secretos, datos de comercios, fotografías privadas, archivos Git y paquetes históricos. Archivo de hashes SHA-256 dentro del ZIP y comprobación de integridad de la extracción. Conserva el servidor existente; no incluye una copia de la base de producción.

Verificación del paquete completada: 228 archivos, cada archivo idéntico a la fuente por SHA-256; integridad 28/28 y 459/459 pruebas repetidas desde la extracción independiente. El primer armado omitía archivos de evaluación usados por las pruebas; se incluyeron los recursos versionados y el paquete final pasó toda la suite.
