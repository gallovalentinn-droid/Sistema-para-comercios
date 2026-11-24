# Selección directa y detalle de presentaciones

**Objetivo:** corregir la selección general del producto que todavía pregunta gramos aunque tenga una presentación, y aplicar el nuevo orden y desglose pedidos.

**Diseño:** una presentación única se agrega directamente por la selección general/código. Con varias se muestran los tamaños para elegir, sin inventar uno. La búsqueda normal muestra las presentaciones; peso libre se busca explícitamente. Sin presentaciones se conserva el diálogo de gramos. El catálogo ordena Producto, Rubro, Código, Stock, Costo, Venta y Margen. Cada presentación muestra nombre, peso, venta, envase y margen sobre venta, incluyendo costo por kg y envase. Sin costo conocido no se inventa margen.

- [x] Reproducir selección general y agregar regresiones antes del cambio.
- [x] Corregir selección, orden y desglose en el worktree.
- [x] Integrar el parche en el candidato servido por Docker, conservando el lector y datos.
- [x] Probar selección general, código, tamaños múltiples y peso libre; detalle y orden en escritorio/celular; suite local e integridad.
- [x] Documentar y guardar commit local. Sin publicar ni hacer llamadas pagas.
