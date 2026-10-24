# Presentaciones con stock compartido — Implementation Plan

> Ejecutar en línea con pruebas antes del cambio y revisión independiente antes de publicar.

**Goal:** vender tamaños con precio propio y un stock único en kg.
**Architecture:** presentaciones como agrupaciones de un componente kg, persistidas por el circuito existente de combos; interfaz específica desde Productos y botones en el POS.
**Tech Stack:** HTML/JS actual, Supabase/Postgres existente, Node test y Playwright.
**Spec:** docs/superpowers/specs/2026-10-24-presentaciones-stock-compartido-design.md.

## Restricciones

Base main REV88 aislada. Sin migraciones/Edge/cambios del candidato P0. Identidad REV92 y SW/manifiesto alineados. Datos sintéticos para todas las ventas de prueba. Publicar solo después de todas las pruebas locales y revisión.

## Tareas

- [ ] Pruebas RED de validación, cantidad fraccionaria, edición, ticket y compatibilidad con combos de varios componentes.
- [ ] Helpers y formularios de tamaños desde Productos, edición/desactivación y botones del mostrador.
- [ ] Verificar circuito real de cobro, costo proporcional, stock, anulación y persistencia offline con prueba de navegador en 1366/390.
- [ ] Ejecutar todas las pruebas Node e integridad y recorridos de navegador relevantes.
- [ ] Revisión independiente, resolver hallazgos y congelar artefactos.
- [ ] Commit y publicación fast-forward desde la base publicada, esperar Pages y repetir el escenario sobre beta pública.
- [ ] Informe y contexto, con advertencia de que P0 requiere referencias nuevas.

## Foco de revisión

Porciones mínimas y separador decimal; precios independientes y snapshots históricos; combinaciones de tamaños y cantidad múltiple; producto base archivado/eliminado y permisos; red caída, recarga, anulación y ausencia de doble descuento.
