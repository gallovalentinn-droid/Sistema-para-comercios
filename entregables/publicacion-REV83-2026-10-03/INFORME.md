# Publicación REV83 — lector GPT y respaldo Gemini

Estado en preparación final de publicación web, 03/10/2026.

## Verificado en código

GPT-6 Luna principal con las reglas de lectura corregidas y validación de importes; Gemini 3.8 Flash de respaldo ante fallos transitorios identificados. Un solo cupo por lectura y máximo dos solicitudes secuenciales, plazo conjunto de 90 segundos. Sectores superpuestos preparados en beta con resolución y tamaño acotados. Contrato de factura y revisión antes de cargar conservados. Sin credenciales en fuente ni paquete.

Revisión independiente: un hallazgo sobre insuficiencia de cuota en error.type, corregido mediante pruebas rojas y verdes. Se comprobó además que un 429 desconocido y una credencial inválida no activan respaldo.

## Verificado localmente

459/459 pruebas aprobadas; integridad de 28 archivos. Interfaz de computadora (1366 px) y celular (390 px) con la foto aportada: tres sectores, 5.003.457 bytes adicionales, diagnósticos OpenAI/Gemini y apertura de revisión; tres invocaciones simuladas independientes y cero escrituras de productos.

Pruebas reales anteriores del adaptador: 38/38 renglones de la foto de referencia con códigos, cantidades, precios, descuentos y unidades por presentación correctos, sin inventar el total ausente de la página 1/2. Estas llamadas locales no equivalen a una lectura autenticada en la beta pública.

## Verificado en el servidor público

Migración `rev83_lector_doble` aplicada. La telemetría admite ambos modelos; privilegios de ejecución: anon=false, authenticated=false, service_role=true. Prueba transaccional de contrato GPT aprobada sin registrar datos.

Edge Function `leer-factura` v21 ACTIVE, JWT requerido; sus cinco archivos coinciden exactamente con la fuente local. Falta confirmar OPENAI_API_KEY en los secretos privados del servidor y realizar una lectura autenticada por la beta.

Publicación web y ZIP: pendientes de completar en esta tarea.
