# Ingresos visibles y transferencias CVU — Implementation Plan

> Ejecución en esta sesión sobre la copia de publicación existente. El usuario aprobó el boceto y pidió avanzar con implementación y pruebas de MODO.

**Goal:** Mostrar ingresos en Vender y Caja, seleccionar y confirmar explícitamente uno sin reutilizarlo, admitir la categoría CVU observada sin relajar los controles financieros.

**Architecture:** Conservar Auth/F5, cuenta cifrada, claim durable y recibo único existentes. Consultar pagos approved sin filtrar operation_type en el proveedor, luego admitir únicamente money_transfer o account_fund/bank_transfer/cvu. La consulta de historial no registra ventas. Claim vuelve a consultar el pago individual.

**Tech Stack:** JS del cliente actual, núcleo ESM Edge, RPC privada existente, Node y Playwright.

**Spec:** Boceto aprobado cobros-transferencias.html y conversación del 16/11; este documento registra las decisiones de implementación delegadas.

## Restricciones
- Sin secretos, cambios de negocio públicos, nuevas transferencias del agente ni modificación de la rama antigua.
- REV101 y SW alineados, manifiesto regenerado al terminar.
- No afirmar QR MODO interoperable a partir de una transferencia CVU.
- Conservar bandera de claim deshabilitada hasta validar el caso real; historial de lectura disponible para personal con autoridad de venta.

## Diseño aprobado y decisiones
Vender conserva el modal y estilos existentes, con pestañas transferencia/QR. Consultar ingresos muestra acreditación, fecha, importe y uso, selección explícita seguida de Registrar venta con este ingreso. Mientras consulta muestra indicador inmediato. Caja agrega consulta de ingresos de la cuenta sin permitir vincular un ingreso fuera de un ticket. Mantener la confirmación manual diferenciada y recuperación del cobro pendiente. Se reutiliza la infraestructura existente en lugar de crear una tabla o conciliación paralela.

## Review Focus
Cuenta cambiada durante consulta; doble clic/claim concurrente; fallo al consultar uso; reembolso parcial con estado aprobado; lista recortada sin afirmar ausencia.

### Task 1: Categorías CVU y lectura segura
- [ ] RED: validador CVU, rechazos de combinaciones similares, reembolso, receptor/moneda/importe, búsquedas sin filtro de operación e historial sin claim.
- [ ] GREEN: mp-core.mjs Provider.searchTransfers y acción income-history, receipts con recorte explícito y fallo de uso propagado.
- [ ] Verificar Node backend y SQL sintético.

### Task 2: Vender y Caja
- [ ] RED: navegador elige ingreso sin registrar; confirma una vez; ingreso usado deshabilitado; consulta lenta visible; Caja solo lectura; cuenta cambiada no usa selección vieja.
- [ ] GREEN: mercadopago.js, punto de montaje Caja y estilos index.html. Conservar QR, manual, recuperación.
- [ ] Verificar 1366/390 y regresiones MP.

### Task 3: Integración y cierre
- [ ] Ejecutar suite completa con Docker y escenarios de navegador afectados.
- [ ] Revisión independiente del diff y controles financieros.
- [ ] Actualizar identidad REV101/SW y manifiesto; documentar evidencia local/pública por separado.
- [ ] Preparar publicación revisable; prueba real pendiente sin crear venta ni mover dinero automáticamente.

## Ledger
Inicio: fuente origin/main a2beeb0, copia publicacion-docker-mp, servidor declarado v7; revalidar antes de despliegue. No se publica ni habilita flag por inferencia del boceto.
