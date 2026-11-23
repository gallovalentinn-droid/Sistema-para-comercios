# Presentaciones y cobro Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aplicar los cinco cambios de UX aprobados sin cambiar stock ni cobros.
**Architecture:** Reutilizar las presentaciones guardadas y el estado del panel de Mercado Pago. Cambiar solo búsqueda, detalle, orden y visibilidad inicial del botón.
**Tech Stack:** HTML/JavaScript, Node test runner, Chrome con proveedores simulados.
**Spec:** docs/superpowers/specs/2026-11-23-presentaciones-cobro-design.md

## Global Constraints

Sin publicación, SQL ni operaciones reales. Mantener HTML, identidad, SW y manifiesto alineados. Conservar peso libre y stock compartido. No generar QR ni confirmar ventas por seleccionar un medio.

## Review Focus

- Presentación eliminada mientras el resultado está visible: no agregar un tamaño distinto.
- Varias presentaciones y peso libre: cantidades, costos y envases conservados.
- Cuenta lenta, fallida o sin capacidad QR: botón visible durante carga, ninguna creación prematura.
- Catálogo móvil/oscuro: detalle legible y datos alineados con encabezados.
- Cambiar/cerrar el cobro durante carga: no restaurar controles de otro panel.

## Task 1: Presentaciones y catálogo

**Files:** beta/index.html; tests/beta-venta-presentaciones-peso.test.cjs; tests/browser-presentaciones-catalogo.cjs.
**Interfaces:** consumir preciosPorPeso y nombrePresentacionPeso; conservar elegirResultado/agregarAlTicket.
- [x] Agregar regresiones de presentación directa y detalle con dos tamaños y peso libre; observar RED.
- [x] Ordenar opciones y columnas; listar presentaciones con peso y precio, sin duplicar productos.
- [x] Verificar precios y stock de ticket, detalle y alineación a 1366 y 390; observar GREEN.

## Task 2: Caja y QR inmediato

**Files:** beta/index.html; beta/mercadopago.js; tests/browser-mercadopago-selector.cjs; tests/browser-presentaciones-catalogo.cjs.
**Interfaces:** conservar mpMontarCobro, mpPreparar y generarQR; consumir capacidades remotas sin esperar para mostrar el botón.
- [x] Reproducir QR oculto con accounts demorado y la ganancia visible en Caja.
- [x] Mostrar QR sin generar cobros; bloquear ejecución hasta conocer la capacidad y la cuenta. Quitar solo la tarjeta de ganancia de Caja.
- [x] Verificar respuesta fallida/pausada, cambios de panel y un único QR con doble clic.

## Task 3: Integración y entrega local

**Files:** beta/index.html; beta/sw.js; integrity-manifest.json; entregables/INFORME-PRESENTACIONES-COBRO-2026-11-23.md.
- [x] Actualizar identidad local y manifiesto con las herramientas existentes.
- [x] Ejecutar todas las pruebas Node, SQL local cuando Docker esté disponible, y recorridos afectados de navegador.
- [x] Revisar el diff con un revisor independiente y corregir hallazgos importantes con regresiones.
- [x] Registrar resultados y límites; dejar la copia local disponible, sin publicar.
