# Detalle de cambios UX en Productos — revisión 25

Fecha de verificación: 18 de septiembre de 2026.

## Resultado

Se rediseñó la sección **Productos** para que las acciones principales sean más claras, el primer uso tenga una guía concreta y la carga de facturas priorice la lectura mediante una foto sin perder el procedimiento manual existente.

## 1. Encabezado con catálogo cargado

- **Cargar factura** pasó a ser la acción principal y muestra una insignia **IA**.
- **Nuevo producto** permanece visible como acción secundaria.
- **Cambiar precios** e **Importar Excel/CSV** se agruparon dentro de **Más opciones**.
- El menú se puede cerrar haciendo clic fuera o con la tecla `Escape`; al cerrarlo con teclado, el foco vuelve al botón que lo abrió.
- En pantallas angostas, los botones se redistribuyen para evitar recortes.

Código:

- `beta/index.html`, líneas 148–160: estilos del grupo de acciones, menú e insignia IA.
- `beta/index.html`, líneas 318–325: adaptación del encabezado a pantallas angostas.
- `beta/index.html`, líneas 4167–4199: apertura, cierre y eventos del menú.
- `beta/index.html`, líneas 4200–4255: estructura y conexión de las acciones del encabezado.

## 2. Estado inicial para comercios sin productos

Cuando el comercio todavía no tiene productos, se reemplaza la tabla vacía por una pantalla de bienvenida con tres caminos:

1. **Importar Excel/CSV**.
2. **Cargar factura** mediante foto.
3. **Cargar un producto a mano**.

Este estado se muestra únicamente mientras `db.productos.length === 0`. En cuanto existe el primer producto, vuelve la vista normal del catálogo.

Código:

- `beta/index.html`, líneas 161–170: estilos del estado inicial.
- `beta/index.html`, líneas 4188–4193: conexión de sus tres acciones.
- `beta/index.html`, líneas 4200–4255: detección del catálogo vacío y composición de la pantalla.
- `beta/index.html`, líneas 4257–4273: contenido del estado inicial y retorno a la tabla normal.

## 3. Modal de carga de factura

- El modal abre mostrando primero una tarjeta grande para elegir o sacar una foto.
- El texto explica que la lectura intenta completar productos, cantidades y precios y que el usuario revisa el resultado antes de confirmar.
- La carga manual queda disponible mediante **¿Preferís cargar los productos a mano?**.
- Si la lectura automática no encuentra productos o falla, la carga manual se despliega para que el trabajo pueda continuar.
- **Confirmar factura** permanece deshabilitado hasta que exista al menos un producto en la factura.
- La tarjeta de foto admite activación por clic, `Enter` y barra espaciadora.
- Durante la lectura cambia solamente el estado del botón; el selector de archivo y sus eventos permanecen montados.

Código:

- `beta/index.html`, líneas 171–185: estilos del modal, tarjeta de foto y carga manual.
- `beta/index.html`, líneas 330–331: adaptación del modal a pantallas angostas.
- `beta/index.html`, líneas 5370–5442: estructura, apertura manual, accesibilidad y eventos.
- `beta/index.html`, líneas 5533–5588: lectura de la foto, mensajes y alternativa manual.
- `beta/index.html`, líneas 5684–5687: sincronización del botón de confirmación con el contenido.

## 4. Iconografía, versión y caché

- Se añadieron iconos coherentes para cámara y carga de archivos.
- La identidad del paquete se incrementó a la revisión 25.
- El caché del service worker también se incrementó a `rev25` para que el navegador descargue la interfaz nueva.

Código:

- `beta/index.html`, línea 503: `packageRevision: 25`.
- `beta/index.html`, líneas 2794–2795: iconos de cámara y carga.
- `beta/sw.js`, línea 2: caché `micomercio-beta-6.0.0-f6-rc2-rev25`.

## 5. Pruebas y vista previa

- Se agregó una prueba automatizada específica para las cuatro reglas centrales del rediseño.
- La vista previa de notebooks ahora permite revisar: catálogo cargado, menú abierto, catálogo vacío, carga de factura con foto y carga manual.
- El puerto de la vista previa puede configurarse para evitar conflictos durante las comprobaciones.

Código:

- `tests/beta-products-ux-redesign.test.cjs`, líneas 19–69: pruebas del encabezado, estado inicial, modal y caché.
- `tests/notebook-preview.cjs`, líneas 20–113: escenarios visuales nuevos y puerto configurable.

## Verificación

### Verificado en código

- El estado inicial depende de que no existan productos.
- Las acciones conservan sus funciones anteriores.
- La carga manual continúa disponible y se abre automáticamente ante una lectura sin resultados.
- El número de revisión del HTML y el caché offline están alineados.

### Verificado localmente

- **51 pruebas aprobadas de 51**, sin errores.
- El script principal de `beta/index.html` compila correctamente.
- La vista previa para notebook confirmó que la página queda contenida y los textos son legibles.
- Se revisaron visualmente las cinco variantes nuevas: catálogo cargado, menú abierto, catálogo vacío, factura por foto y factura manual.

### Verificado en el entorno público

- La beta pública entrega `packageRevision: 25`.
- El service worker público entrega el caché `micomercio-beta-6.0.0-f6-rc2-rev25`.
- Se abrió la sección Productos con el catálogo real y se comprobó visualmente el nuevo encabezado.
- Se abrió **Más opciones** y se verificaron **Cambiar precios** e **Importar Excel/CSV**.
- Se abrió **Cargar factura** y se verificó la vista inicial por foto, la alternativa manual cerrada y el botón de confirmación deshabilitado mientras la factura está vacía.
