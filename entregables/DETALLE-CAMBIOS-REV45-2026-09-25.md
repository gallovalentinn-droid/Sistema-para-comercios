# MiComercio — cambios de REV45

Fecha: 25/09/2026

## Qué cambió

- La barra lateral muestra **Compras** en el lugar que ocupaba **Para pedir**. Conserva el contador de productos que necesitan reposición, sin sumar otra fila al menú.
- Compras tiene dos pestañas: **Para pedir**, con el pedido existente, y **Cargar factura**.
- Cargar factura presenta dos caminos claros: **Leer factura con IA** y **Cargar a mano**. Ambos usan la misma revisión y confirmación de mercadería.
- El acceso «Cargar factura» de Productos lleva a la pestaña de Compras.
- Los permisos existentes se respetan por separado: `reposicion_ver` habilita Para pedir y `productos_editar` habilita la carga de facturas. Un empleado sólo ve las pestañas permitidas.
- Si la IA propone crear un producto, queda pendiente durante la revisión y se incorpora al catálogo recién al confirmar la factura. Descartar la carga no altera el catálogo.
- Identidad de `beta/index.html`, caché de `beta/sw.js`, manifiesto de integridad y pruebas alineados en REV45.

## Alcance

Esta revisión organiza los flujos de compra existentes. No incorpora un historial de facturas como documentos consultables ni conserva imágenes de facturas. El historial de ingresos de stock sigue funcionando como antes.

## Verificación

- **Código:** revisados la navegación, el aislamiento de permisos y el momento de alta de productos propuestos por IA.
- **Local:** 175 de 175 pruebas aprobadas; sintaxis del cliente válida; integridad correcta de 14 archivos. Vista de Compras revisada con datos sintéticos en 1366 × 768 y 500 × 844.
- **Beta pública:** REV45 no se publicó en esta entrega; el flujo nuevo no se verificó en el dominio público.
