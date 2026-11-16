# REV100 — acreditación y consultas de Mercado Pago

La validación QR admite las dos variantes de detalle de orden pagada presentes en la documentación de Mercado Pago: `processed` y `accredited`. Conserva la comprobación de cuenta, referencia, importe, transacción única y acreditación, y rechaza reembolsos y estados incompatibles. El diagnóstico del servidor identifica la condición fallida mediante valores de una lista cerrada, sin registrar datos de la respuesta.

Las consultas automáticas mantienen los controles disponibles. Una acción del usuario espera la consulta en curso y vuelve a comprobar que el intento y el panel siguen vigentes. Tras errores sucesivos, las consultas se espacian hasta quince segundos. Se conservan generación visible, recuperación e idempotencia de la venta.

Cliente REV100, edición `2026-11-16-mp-acreditada-r1`, caché `rev100-r1`. El servidor se desplegó primero como `mercadopago` v6; el cliente se publica en una segunda etapa. El callback conserva v5.

La verificación incluye Node con SQL sintético aislado y recorridos a 1366/390 de generación, reintento, consulta sin bloqueo, clic en espera, cancelación, recuperación tras recarga y recuperación terminal. Estos recorridos usan proveedor y sesión simulados; sus resultados no sustituyen las pruebas reales del proveedor.

La interoperabilidad con MODO y la cobertura de transferencias directas siguen pendientes de validación separada. No se agregan webhooks ni reembolsos automáticos. El cambio de interfaz no acredita una reducción medida de la latencia de Mercado Pago.
