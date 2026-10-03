# Lector doble REV83 Implementation Plan

> For agentic workers: use superpowers:executing-plans inline, as authorized by the request to apply the corrected reader to beta and deliver the complete system ZIP.

**Goal:** Publicar el lector GPT corregido como principal y Gemini como respaldo.
**Architecture:** Un único punto de entrada autentica y reserva el cupo. Un módulo compartido selecciona el proveedor, valida su respuesta y permite un solo respaldo por fallo transitorio dentro de 90 segundos. La beta prepara tres sectores superpuestos de la misma foto para GPT.
**Tech Stack:** JavaScript, Deno/Supabase Edge Functions, PostgreSQL, Node tests, Canvas.
**Spec:** `entregables/prueba-openai-2026-10-03/CORRECCION-LECTOR.md` y pedido explícito del usuario de aplicar en beta y entregar ZIP.

## Global Constraints
- No claves en código, registros, ZIP ni respuestas. OPENAI_API_KEY solo en configuración privada del servidor.
- Una reserva de cupo, máximo dos solicitudes secuenciales; timeout conjunto de 90 segundos.
- Conservar contrato de factura, filas repetidas, cantidades y precios visibles, revisión previa a cualquier carga.
- Conservar compatibilidad con clientes sin sectores y despliegues que solo tienen Gemini configurado.
- Alinear identidad de build, service worker, manifiesto y pruebas en REV83.

## Review Focus
- Límites temporales frente a saldo agotado o credenciales inválidas: respaldar solo fallos transitorios.
- Lecturas incompletas o importes incoherentes: rechazar sin cargar productos ni repetir llamadas.
- Foto sin total visible, renglones repetidos y packs: respetar datos impresos.
- Imagen que el navegador no decodifica: enviar original sin sectores, sin bloquear HEIC.
- Fallo del proveedor o telemetría: no filtrar texto privado y registrar el proveedor que produjo el resultado.

### Task 1: Orquestación y telemetría
**Files:** `_shared/f6-invoice-providers.mjs`, `leer-factura/index.ts`, `_shared/f6-invoice-reader.mjs`, `REV83-LECTOR-DOBLE.sql`, `tests/edge-lector-proveedores-rev83.test.cjs`.
**Interface:** `readInvoiceWithProviders({input,openaiApiKey,geminiApiKey,fetchImpl,now,totalTimeoutMs,primaryTimeoutMs})` devuelve `{invoice,iaUsage,model,provider,fallbackUsed}` o error seguro `{code,status,diagnostic}`. Validación admite imageParts opcional, hasta 3 PNG/JPEG/WebP y 8 MB adicionales en total. La RPC acepta exactamente Gemini 3.8 Flash y GPT 6 Luna conservando permisos.
- [x] Agregar pruebas de principal, respaldo por 503/conexión/timeout/429 temporal, exclusión de saldo/credenciales/validación, agotamiento del plazo y límites de sectores; observar rojo.
- [x] Implementar el módulo y conectar una sola reserva y telemetría del modelo real; observar verde y regresiones anteriores.
- [x] Preparar migración idempotente que amplía solo la lista de modelos preservando autorización y cupos.

### Task 2: Beta y pruebas
**Files:** `beta/index.html`, `beta/sw.js`, `integrity-manifest.json`, pruebas correspondientes y navegador REV83.
**Interface:** `f83SectoresFactura(imageBase64,mediaType)` devuelve tres sectores superpuestos, máximo 2048 px por dimensión, hasta escala 2, o [] si no decodifica o excede el presupuesto. Mensajes usan proveedor de la respuesta, sin texto externo.
- [x] Probar sectores de foto válida, imagen no decodificable, diagnóstico OpenAI/Gemini y revisión sin escrituras; observar rojo.
- [x] Integrar sectores, mensajes y REV83; actualizar hashes.
- [x] Ejecutar todas las pruebas locales, navegador escritorio/móvil e integridad. Revisión independiente antes de publicar.

### Task 3: Publicación y entrega
**Files:** contexto, informe de publicación y ZIP limpio en entregables.
- [ ] Verificar secreto privado del servidor (usuario configurándolo), aplicar migración y desplegar función con JWT.
- [x] Publicar beta, confirmar versión/hashes, repetir flujo público y registrar límites de verificación real.
- [x] ZIP de archivos versionados y nuevos archivos necesarios, sin secretos, fotos privadas ni entregables históricos. Verificar contenido/hash e integridad extraída.

## Registro de ejecución

- Implementación directa en el checkout existente por pedido explícito de aplicar en beta. Archivos ajenos sin incorporar.
- 459/459 pruebas y 28 hashes; escenarios 1366/390 locales y públicos aprobados.
- Revisión independiente detectó saldo por error.type. Pruebas de saldo/429 desconocido/credenciales RED→GREEN y suite completa verde.
- Migración y Edge v21 publicadas, permisos conservados; cinco archivos desplegados idénticos. Pages 37144385820 success.
- La configuración privada de OPENAI_API_KEY depende del usuario: conector no dispone de gestión de secretos; asistido con enlace y portapapeles. Lectura autenticada pública pendiente.
- ZIP verificado: 228 archivos sin credenciales, comparación SHA-256 de cada archivo e integridad 28/28; suite extraída 459/459.
