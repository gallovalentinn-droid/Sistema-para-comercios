# MiComercio · Cambios de UX y exportación del catálogo (REV32)

Fecha: 23 de septiembre de 2026. Esta revisión reúne los cambios de UX de REV31 y suma la descarga del catálogo completo en Excel o CSV. El detalle anterior sigue disponible en `entregables/DETALLE-CAMBIOS-REV31-2026-09-23.md`.

## Qué cambia para quien usa el sistema

### 1. Filtrar por varios rubros

En **Productos** y **Para pedir** se puede marcar más de un rubro en el mismo selector. Las coincidencias se unen: elegir Gaseosas y Aguas muestra productos de ambos. El selector indica cuántos rubros hay elegidos, muestra el número de productos por rubro y ofrece búsqueda cuando hay muchos. Incluye **Seleccionar todos** y **Limpiar**. Se maneja con mouse o teclado (flechas, Espacio y Escape), y el foco vuelve al botón al cerrarlo. Los productos sin categoría se pueden filtrar como “Sin rubro”.

Los filtros se combinan con la búsqueda; su estado queda en la URL. La pantalla muestra cuántos resultados quedan y, si no hay ninguno, explica los filtros activos y permite limpiarlos.

Código principal: `beta/index.html` líneas 71–79, 4412–4496, 4556–4668 y 6231–6271.

### 2. Encontrar y archivar productos poco usados

Productos permite ver los vendidos en los últimos 30 o 90 días, los que no se vendieron en 90 días y los que nunca se vendieron. Se cuentan ventas directas y componentes de combos; las anuladas no cuentan. El filtro de actividad se puede combinar con rubros, texto y estado.

Un producto se puede archivar individualmente o junto con otros productos seleccionados. Desaparece de Vender y Para pedir, pero conserva ventas y movimientos históricos. Los archivados tienen una vista propia para consultarlos y desarchivarlos. Al escanear el código de uno archivado, Vender ofrece recuperarlo. El historial registra quién archivó o desarchivó y cuándo.

Código principal: `beta/index.html` líneas 3108, 3663–3674, 3722, 4260–4261, 4412–4451, 4508–4524, 4606–4668 y 5797–5824.

### 3. Caja por turnos, cuando el comercio lo necesita

El alta pregunta si el comercio maneja la caja por turnos, y la decisión puede cambiarse en Configuración. Si se activa, Vender muestra una pantalla de apertura con fondo inicial y responsable hasta que alguien abra explícitamente el turno; una sesión técnica creada por otra operación no habilita ventas. Al abrir, se vuelve directamente a Vender. Si se desactiva, el flujo anterior continúa.

El aviso de turno largo aparece después de ocho horas por defecto. El umbral se puede configurar entre una y 72 horas. El aviso permite seguir y posponerlo o ir al cierre para abrir uno nuevo; nunca cierra solo y respeta los permisos de Caja.

Código principal: `beta/index.html` líneas 3839–3899, 4260, 4446, 7314–7318, 7543–7545, 8357–8367, 8480–8491 y 12201–12281. La migración necesaria está en `REV31-MIGRACION.sql`.

### 4. Ajustes de stock más seguros

El formulario distingue **Agregar**, **Descontar** y **Fijar el stock real**. Se ingresa una cantidad positiva con botones − y +, y se ve el stock anterior y el resultante antes de guardar. Un resultado negativo se destaca y exige confirmación. El motivo es obligatorio; el movimiento registra usuario y fecha/hora para el historial.

Código principal: `beta/index.html` líneas 4447–4450 y 5737–5795.

### 5. Barra lateral fácil de recuperar

La barra aparece expandida en el primer uso y recuerda después la elección del usuario. El botón de colapsar o expandir queda visible en los dos estados; al estar colapsada, los íconos muestran el nombre de cada sección como ayuda.

Código principal: `beta/index.html` líneas 44–46, 65–70, 619 y 3437–3473.

### 6. Exportar todos los productos a Excel o CSV

En **Productos → Más opciones** hay dos nuevas acciones: **Exportar catálogo a Excel** y **Exportar catálogo a CSV**. Ambas toman el catálogo completo del comercio, incluidos los productos archivados, aunque haya búsqueda o filtros activos. No modifican el catálogo ni requieren conexión con el servidor.

Cada fila incluye nombre, código de barras, rubro, proveedor, costo, precio de venta, stock, mínimo, deseado, unidad, vencimiento, estado y, si corresponde, fecha y responsable del archivo. Excel (`.xlsx`) preserva los códigos de barras como texto, incluso si empiezan con cero. CSV (`.csv`) usa UTF-8 para acentos y protege los textos que Excel podría interpretar como fórmulas; los números negativos siguen siendo numéricos. Los archivos se nombran con la fecha de descarga.

El Excel usa el lector/escritor de planillas que la beta ya cargaba para importar. Si esa biblioteca no está disponible, la aplicación indica usar CSV. La exportación CSV funciona sin esa biblioteca.

Código principal: `beta/index.html` línea 2938 (ícono), 4525–4542 y 4565–4571 (menú y acciones), 8078–8120 (datos, CSV, Excel y descarga). Pruebas: `tests/beta-product-export.test.cjs` líneas 1–46.

## Identidad, comprobaciones y publicación

- La identidad de la beta, la caché offline y el manifiesto de integridad avanzaron juntos a **REV32**: `beta/index.html` línea 634, `beta/sw.js` línea 2 e `integrity-manifest.json` línea 3. No se agregó una migración nueva para exportar: sólo lee los productos que ya tiene el comercio.
- **Verificado en código:** ambas acciones usan `db.productos` completo, no el resultado filtrado; Excel mantiene códigos como texto; CSV incluye activos y archivados y protege texto con apariencia de fórmula.
- **Verificado localmente:** 102 pruebas aprobadas, 0 fallas; sintaxis JavaScript e integridad correctas. En una vista local de notebook se comprobaron las dos opciones dentro de Más opciones y su legibilidad. La vista usa datos de prueba.
- **Entorno público:** REV32 no está publicada ni comprobada allí. Sigue pendiente aplicar `REV31-MIGRACION.sql` antes de publicar REV31/REV32, y luego verificar exportaciones, archivo, turnos y sincronización con una sesión autorizada en la beta pública.
