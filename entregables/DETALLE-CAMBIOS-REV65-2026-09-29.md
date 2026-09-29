# MiComercio REV65 — tabla de Productos

Fecha: 29/09/2026.

## Problema observado

En la captura de REV64, el nombre y el encabezado de Producto aparecían centrados y la acción Archivar quedaba cortada a la derecha. Las reglas de la tabla trataban la primera columna como si siempre fuera la casilla de selección, aunque normalmente esa casilla no está presente. Otras reglas ocultaban columnas por posición, que cambia al seleccionar productos. Con códigos y precios largos, la anchura de las acciones producía desplazamiento horizontal incluso en una ventana de 1919 píxeles.

## Corrección

- La casilla de selección tiene su propia clase y ocupa 52 píxeles solo cuando está activa. Producto queda alineado a la izquierda.
- El diseño adaptable identifica Código, Rubro, Costo y Margen por su función, sin depender de su posición. En 1366 píxeles ceden Código y Rubro; en 1024 también ceden Costo y Margen, manteniendo visibles nombre, precio de venta, stock y acciones.
- Editar, Ajustar y Abrir atado siguen siendo acciones directas. Historial y Archivar usan iconos compactos en escritorio con etiquetas accesibles y ayuda al pasar el cursor. En celular conservan el texto.
- La identidad de la beta, la caché y el manifiesto de integridad pasan a REV65. No cambian ventas, stock ni datos de comercios.

## Verificación

- **Código:** las columnas de Producto usan clases semánticas; `beta/index.html`, `beta/sw.js` y el manifiesto corresponden a REV65.
- **Local:** 269/269 pruebas de código y verificación de integridad aprobadas. La regresión de navegador reproduce el desborde anterior y comprueba la tabla con datos extensos a 1919, 1366 y 1024 píxeles, con y sin selección. A 390 píxeles comprueba que las acciones secundarias conservan sus nombres. También pasaron los recorridos de REV62 y REV64.
- **Entorno público:** pendiente de comprobar después de la publicación.
