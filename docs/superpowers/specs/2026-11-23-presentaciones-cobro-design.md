# Presentaciones, catálogo y cobro

Diseño aprobado por el usuario el 23/11/2026.

- Vender muestra cada presentación por peso configurada como opción propia y la agrega directamente al ticket con su precio y envase existentes. Todas usan el stock compartido en kg. Se conserva una opción explícita de peso libre.
- Productos ordena sus columnas: Producto, Stock, Código, Rubro, Costo, Venta, Margen, Acciones. El detalle lista todas las presentaciones configuradas con peso y precio.
- Caja deja de mostrar Ganancia estimada; no se alteran los cálculos de Resumen.
- Transferencia/QR muestra el botón QR inmediatamente, incluso mientras carga las cuentas. No genera cobros automáticamente; mantiene la validación de cuenta y capacidades antes de generar un QR.

## Enfoque

Reutilizar `preciosPorPeso`, el catálogo y el flujo financiero actuales. No crear productos duplicados ni nuevas tablas. La alternativa de duplicar productos rompe el stock compartido; la de mantener solo el selector genérico no cumple la venta directa aprobada.

Trabajo local sobre d4a4d84; sin push, publicación, migraciones ni operaciones de negocio reales. Probar escritorio/móvil y claro/oscuro, con proveedores de pago simulados. Una prueba local no acredita el entorno público.
