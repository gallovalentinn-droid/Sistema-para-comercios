# Mercado Pago público — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Execution approved by user 15/11/2026; implement and produce report.

**Goal:** conectar cuentas OAuth, cobrar QR y comprobar transferencias con backend público.
**Architecture:** dos Edge Functions, Postgres privado transaccional, cliente REV97 contra endpoint Supabase. Conserva SQLite local para Docker.
**Tech Stack:** Deno, Web Crypto, PostgreSQL 17, Supabase Auth y F5, HTML/JS.
**Spec:** docs/superpowers/specs/2026-11-15-mercadopago-publico-design.md (aprobado).

## Global Constraints

No exponer secretos. Conservar lector y UX Docker. Credenciales cifradas con clave dedicada. Autoridad F5 real. No dinero real sin aprobación de importe/cuenta. No habilitar comprobación de transferencias hasta validar cobertura del proveedor. Sin cambios en tablas financieras anteriores. Informar código/local/público por separado.

## Review Focus

- Callback repetido y contexto revocado: una sola conexión, validación vigente.
- Workers concurrentes y timeout: exclusión durable, no doble cobro ni verificación.
- Renovación ambigua: no reutilizar refresh token como si se supiera su estado.
- Cliente sin sesión/backend sin secretos: estado pendiente honesto, manual disponible.
- Fallo de guardado o recarga: recuperación y cálculo original conservados.

### Task 1: Backend público y persistencia

Files: nuevas supabase/functions/mercadopago/index.ts, mercadopago-callback/index.ts, _shared/mp-*.mjs; migración SQL y tests/mercadopago-publico*. Interfaces: POST JSON conserva acciones y respuesta del conector local; accounts agrega capabilities.transferVerification boolean. accounts.configured solo cuando secretos presentes. OAuth callback fijo /functions/v1/mercadopago-callback. Only owner manages connections; sales permission verifies/QR. Clave MP_TOKEN_ENCRYPTION_KEY, MP_CLIENT_ID, MP_CLIENT_SECRET; MP_TRANSFER_VERIFICATION_ENABLED false hasta aceptación real.

- [x] Escribir y ejecutar pruebas RED de permisos/state/cifrado/carreras y validación de pagos.
- [x] Implementar funciones y persistencia transaccional con exclusión cross-worker e idempotencia.
- [x] Pruebas Node completas y PostgreSQL local aislado: RLS/ACL, state single use, cuentas principales, mismo pago/venta, renovación concurrente y fallos de proveedor.
- [x] Revisión de tarea: especificación y calidad; corregir importantes.

### Task 2: Cliente público

Files: beta/mercadopago.js, beta/index.html, beta/sw.js, tests/browser-mercadopago-conexion.cjs y nuevos tests de transporte/capacidades. Interfaces: en micomercio.ar usar SUPABASE_URL/functions/v1/mercadopago; en localhost conservar /api/mercadopago. JWT sesión y apikey. Solo dueño monta administración. No Developers link en producción; estado pendiente claro. Callback devuelve estado y recarga cuentas. Capacidad false oculta consulta ingresos, QR según configuración/caja.

- [x] Regresión RED de transporte, falta de configuración, autorización y capacidades.
- [x] Implementar preservando snapshot/pending/stock.
- [x] Actualizar identidad REV97 edición 2026-11-15-mp-publico-r1 y SW rev97-r1; actualizar expectativas y manifiesto.
- [x] Suite completa y navegador ambos anchos, revisión de tarea.

### Task 3: Integración, despliegue e informe

- [x] Revisión independiente de conjunto y correcciones con regresiones.
- [x] Aplicar migración aislada e instalar funciones nuevas; no modificar leer-factura.
- [x] Comprobar endpoints públicos: CORS, JWT, state inválido, ausencia de fugas y ACL; configurar secretos privadamente cuando usuario pueda ingresarlos.
- [x] Publicar cliente solo contra endpoint existente; comprobar hashes y navegador público con escrituras bloqueadas.
- [x] Entregar informe con pruebas ejecutadas, URL de retorno, límites, pendientes de credenciales/cobros reales, reversión y fuentes.

Aceptación real pendiente: crear/elegir caja y probar QR/cobertura de ingresos con proveedor. OAuth real confirmado. No se realizaron cobros reales del agente.
