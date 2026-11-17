# Transferencia automática Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Implementación inline con una revisión independiente final.

**Goal:** Detectar transferencias por venta sin depender de remitentes ni reportes, con QR y Transferencia al mismo nivel.

**Architecture:** Reutilizar inicio y consultas autorizadas por venta; sondeo no bloqueante y propuesta única; claim explícito tras revalidar candidatos. El servidor conserva idempotencia y reduce la ventana a inicio/+30min.

**Tech Stack:** JavaScript existente, Supabase Edge, PostgreSQL/SQLite Docker, Node y Playwright.

**Spec:** docs/superpowers/specs/2026-11-17-transferencia-automatica-design.md

## Global Constraints

Sin cobros nuevos de prueba, secretos, cambios de configuración privada de MP ni relajación de controles financieros. Sin recomendación de QR. Nombre solo opcional. Preservar checkout original y usar candidato .worktrees/publicacion-docker-mp sobre main f5f2c2a.

## Review Focus

Respuesta tardía después de cerrar/cambiar cuenta o sesión; segundo candidato antes de confirmar; recorte interpretado como unicidad; confirmación manual durante consulta; intento previo cancelado/ya cobrado.

## Task 1 — Servidor y retiro de reportes

- [x] Regresión RED: pagos anteriores al inicio rechazados, límites0/+30min y reportes no invocados.
- [x] Eliminar vía reportes de mp-core y pruebas específicas retiradas; conservar respuesta legacy income-senders vacía sin red.
- [x] GREEN: tests de ventana, API pública y Docker.

## Task 2 — Consulta automática y UX

- [x] RED navegador: elegir Transferencia consulta sola, candidato único sin clic de fila, ambigüedad sin autoelección, manual accesible y controles libres.
- [x] Implementar estados y sondeo en beta/mercadopago.js; detener/invalidate al cerrar/scope/cuenta/ticket; reconsulta antes de claim y descartar candidato si cambió.
- [x] QR/Transferencia con misma presentación. Caja sigue lectura de ingresos, nombre solo si viene directamente.
- [x] GREEN1366/390 y adaptar recorridos existentes a comportamiento automático.

## Task 3 — Cierre y publicación

- [x] REV106 HTML/SW/tests/manifiesto; suite Node completa/Docker y recorridos navegador.
- [x] Revisión independiente final; una pasada de correcciones con RED/GREEN.
- [ ] Versionar sobre main, publicar servidor/web y cotejar fuentes/hash; repetir recorridos públicos simulados y observar pantalla real solo si no interfiere con una venta abierta.
- [ ] Informe separado código/local/público y contexto actualizado.

## Ledger

Inicio: diseño aportado por el usuario, ejecución autorizada. No se requiere una nueva aprobación de la misma propuesta. La ventana futura estricta concreta “después de iniciado”; los ingresos anteriores se excluyen incluso si tienen el mismo importe.

Task 1 done: sin-reportes/ventana RED→GREEN, regla pública compartida con Docker.
Task 2 done: sondeo/único/ambiguo/manual/recuperación probados en1366/390.
Final: fixed P1 cierre durante reconsulta — browser-auto con cerrarModalUsuario RED2claims→GREEN1claim; retorno de vigencia y saleId antes/después preparación.
Final: fixed P2 historial100 — 101 anteriores+1 compatible REDtruncated→GREENfalse, solo una lectura used y recorte real preservado.
Task 3 tests: suite completa 720/720 Node con SQLDocker, sin omisiones. Navegador final22/22 a1366/390, sinfallos.
