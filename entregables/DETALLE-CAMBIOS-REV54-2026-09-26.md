# MiComercio — cambios REV54 (26/09/2026)

**Base:** `MiComercio-Sistema-Completo-REV53-2026-09-26.zip`

**Alcance:**

- el lector de facturas: la ventana «Cargar factura de compra» y la revisión de la lectura con IA;
- la identidad REV54.

No se tocaron Caja, Ventas, la sincronización, la base de datos ni las migraciones.

---

## 1. Chequeo de REV53

Antes de cambiar nada revisé el paquete REV53 tal como vino:

- **Pruebas e integridad:** 218 de 218 pruebas aprobadas. Integridad correcta de 16 archivos, sin secretos.
- **A1 · Promociones «Llevá y pagá»:** `REV53-PROMOCIONES-CANTIDAD.sql` acepta `porcentaje = 0` solo para una promoción de producto con regla NxM válida (N de 2 a 99, M menor que N). El 0 % común y los porcentajes mayores a 100 se siguen rechazando. **Correcto.**
- **A2 · Apertura rechazada:** la nueva versión de `REV52-CAJA-TRASPASO.sql` ya no lanza una excepción si el último cierre cambió. Registra `apertura_requiere_revision` y el cierre que tenía el servidor. Además, cualquier error de los datos adicionales de apertura o cierre queda como alerta (`rev52_meta_alerta`) sin revertir la operación principal. **Correcto.**
- **M1 · Consulta al abrir el turno:** si la consulta se cuelga, a los 5 s pasa a «No pudimos consultar la nube. Contá la plata actual para abrir» y deja abrir. Si falta la migración, avisa que la nube necesita la actualización y también deja contar y abrir. **Correcto.**
- **Otros cambios que confirmé:**
  - el cierre guarda quién lo hizo;
  - «Dejo plata» aparece primero;
  - «1 venta» en singular;
  - las diferencias con centavos;
  - «Recargo sobre costo».
- **Observación:** si el cierre anterior se hizo sin conexión y todavía no subió a la nube, la apertura siguiente dice «El último cierre necesita revisión». Pedir que se cuente es correcto (es el criterio de REV53), pero el texto confunde. Algo como «El último cierre todavía no se sincronizó. Contá la plata actual» sería más claro. No lo cambié en esta revisión.
- **Pendiente de siempre:** las migraciones REV52 y REV53 siguen **sin aplicar** en Supabase, así que la beta publicada todavía tiene el problema de «Llevá y pagá». El orden de publicación del informe REV53 sigue vigente.

---

## 2. Error visual del lector de facturas

### Qué se veía

Después de leer una factura con IA, la pantalla «Cargar factura de compra» mostraba el nombre del producto **una letra por renglón**, con la fila enorme y la tabla desbordada hacia los costados. Captura: `capturas-REV54/1-carga-antes-despues-1366.png`, arriba.

### Por qué pasaba

- La ventana medía como máximo 820 px, pero la tabla tiene 8 columnas: producto, cantidad, unidades por bulto, precio unitario, descuento, venta nueva, «se carga» y quitar. Siete de ellas tenían ancho fijo.
- El nombre del producto tenía permitido cortarse en cualquier letra, así que el navegador le daba a esa columna lo mínimo posible: unos 10 px.
- La versión en tarjetas, que sí se lee bien, solo se activaba cuando **la pantalla entera** medía menos de 760 px. No dependía del tamaño de la ventana de la factura, así que en una computadora nunca aparecía.
- La revisión de la lectura tenía el mismo problema, con 7 columnas.

### Qué cambié

1. **Ventana más ancha cuando hay productos.**
   - La ventana de la factura crece hasta 1200 px, o el ancho de la pantalla menos 32 px.
   - Mientras solo se ve la foto, mantiene el tamaño chico de antes.
   - La revisión de la lectura siempre usa la ventana ancha.
2. **El nombre tiene un ancho mínimo.**
   - La columna del producto no baja de 230 px.
   - Un nombre largo se corta en renglones, pero nunca letra por letra.
3. **Tarjetas según el ancho de la ventana, no de la pantalla.**
   - Si la tabla tiene menos de 960 px disponibles (notebook chica, tablet o ventana del navegador achicada), cada producto pasa a mostrarse como tarjeta:
     - nombre arriba, a todo el ancho, con la foto y el stock;
     - los campos debajo, en una grilla de 3 columnas con su rótulo (2 columnas en celular);
     - la «×» para quitar el producto en la esquina.
   - Con más espacio, se ve la tabla completa.
4. **Detalles:**
   - El aviso «No coincide con el total de la factura» se parte en renglones en lugar de salirse de la pantalla en celular.
   - En la revisión, la columna «Emparejado con» pasó de 190 a 240 px, para que se lea el producto elegido.
5. **Corrección que apareció en las pruebas.** Si una fila estaba marcada como «+ Crear producto nuevo» y se cambiaba cualquier número de esa pantalla, la lista volvía a mostrar «— No cargar esta fila —», aunque internamente seguía siendo «nuevo». Ahora muestra la opción correcta. Ya pasaba en REV53, y con el botón «volver» se habría notado más.

### Resultado medido

Con 18 productos leídos, incluido `SPEEDXLUNLIMITEDX473CCX6U-SP`:

| Pantalla | REV53 | REV54 |
|---|---|---|
| Computadora 1366 px: ancho de la columna del producto | 108 px, desborde lateral | 267 px en la carga y 379 px en la revisión, sin desborde |
| Pantalla de 1024 px | Tabla apretada con desborde | Tarjetas, sin desborde |
| Celular 390 px | Desborde lateral | Tarjetas de 2 columnas, sin desborde |

---

## 3. Volver un paso atrás

La carga con IA ahora muestra los pasos arriba: **1 · Foto → 2 · Revisar lectura → 3 · Confirmar carga**. Cada pantalla tiene un botón para volver al paso anterior.

**En «Revisar lectura», el botón «← Volver a la foto»:**

- Vuelve a la pantalla de la foto para elegir otra.
- Lo que se había cargado a mano antes de sacar la foto se conserva.
- No se agrega nada de la lectura descartada.

**En «Confirmar carga», el botón «← Volver a revisar»:**

- Vuelve a la revisión con **las mismas filas y los cambios que se habían hecho ahí**: productos emparejados, cantidades, precios y «crear nuevo».
- No vuelve a llamar a la IA, así que no consume otra lectura.
- Saca de la factura lo que había agregado esa lectura. Al tocar de nuevo «Cargar a la factura», no se duplica nada.
- Si ya se cambió algo en esta pantalla (cantidades, precios de venta, etc.), el primer toque avisa: «Si volvés a revisar la lectura, se descartan los cambios que hiciste en esta pantalla. Tocá otra vez para confirmar». Hay que tocar de nuevo dentro de los 6 s. Así no se pierde trabajo por un toque accidental.

**Qué no cambia:**

- La carga manual (sin IA) no tiene pasos, así que no muestra estos botones.
- «Cancelar», «Descartar» y «Confirmar factura» funcionan igual que antes.

**Cómo está hecho:**

- Al abrir la revisión se guarda una copia de la factura en ese momento: productos, encabezado y productos nuevos pendientes.
- Al pasar a la carga se guardan también las filas revisadas.
- Volver restaura **una copia nueva** de esa memoria. En las pruebas apareció un error en el que la memoria quedaba enlazada con la factura en curso y se duplicaban productos; quedó corregido y tiene una prueba propia.

---

## 4. Archivos modificados

| Archivo | Cambio |
|---|---|
| `beta/index.html` | Estilos del lector (ventana ancha, tarjetas por ancho de ventana, ancho mínimo del nombre, aviso de total). Pasos y botones de volver en `abrirRevisionFactura` y `panelIngreso`. Memoria del paso anterior (`facturaIA`, `copiaFactura`, `restaurarFactura`). Opción «crear nuevo» conservada. `packageRevision:54` |
| `beta/sw.js` | Caché `micomercio-beta-6.0.0-f6-rc2-rev54` |
| `integrity-manifest.json` | Revisión 54 y hashes nuevos |
| `tests/beta-lector-facturas-rev54.test.cjs` | **Nueva prueba:** estilos del lector, botones de volver, opción «crear nuevo» y que volver no modifique la memoria del paso |
| `tests/beta-compras-navigation.test.cjs` | Carga las funciones de memoria nuevas en su contexto |
| `tests/beta-products-ux-redesign.test.cjs`, `tests/beta-cash-ux-redesign.test.cjs`, `tests/beta-auditoria-rev29-regressions.test.cjs` | Identidad REV54 y firma nueva de `panelIngreso` |
| `entregables/capturas-REV54/` | Capturas antes y después |
| `entregables/pruebas-navegador-REV54/` | Scripts de navegador usados para verificar |

---

## 5. Verificación

- **Pruebas automáticas:** 221 de 221 aprobadas (218 de REV53 más 3 nuevas).
- **Integridad:** correcta en 16 archivos, sin secretos. El script principal compila y ESLint no encuentra identificadores indefinidos.
- **En navegador (Chromium, sin red externa):**
  - `t40_factura.cjs`: 18 productos con nombres largos, a 1366, 1024 y 390 px. Sin desborde lateral en la revisión ni en la carga. Tabla en computadora y tarjetas en pantallas angostas.
  - `t42_volver.cjs`: recorrido completo:
    1. producto cargado a mano;
    2. lectura con IA;
    3. revisión editada;
    4. carga;
    5. volver sin cambios, con la edición conservada;
    6. cargar otra vez, sin duplicar;
    7. cambio en la carga, con aviso y doble toque;
    8. volver a la foto, con lo manual conservado;
    9. nueva lectura y confirmación.

    Resultado final: Coca-Cola +12 unidades; producto nuevo con stock 24, precio $2.900 y costo $1.958,33.
  - Escribir cantidades y precios con el teclado (Tab o clic afuera) en las dos pantallas no genera errores. Lo mismo en REV53.
  - **Regresión:**
    - Compras: orden de pestañas, pestaña inicial según permisos, precio obligatorio en productos nuevos.
    - Las 12 secciones a 1366 y 390 px.
    - Los 196 botones, sin errores nuevos.
    - Apertura de Caja con y sin conexión: F1 a F7, y el límite de 5 s.

---

## 6. Para publicar

REV54 no necesita migraciones propias. Se publica igual que REV53:

1. respaldo de la base;
2. `REV52-CAJA-TRASPASO.sql`, en la versión de este ZIP;
3. `REV53-PROMOCIONES-CANTIDAD.sql`;
4. `beta/index.html` y `beta/sw.js` juntos.

Después de publicar, conviene probar en la beta una factura real con IA: revisar, volver a la foto, volver a revisar y confirmar.

No publiqué esta revisión ni hice cambios en Supabase.
