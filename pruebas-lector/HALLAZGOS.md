# Lector de facturas con IA · hallazgos y correcciones locales (10/11/2026)

Base: `origin/main` cb1c9fc (REV94). Todo es local, con respuestas sintéticas: no hubo llamadas a OpenAI ni a Gemini, no se tocó Supabase y no se publicó nada. Nada de esto rige en producción hasta publicar la función y la app.

**Estado de las pruebas (verificado localmente):**

- 523 pruebas unitarias y de función Edge (`tests/*.test.cjs`);
- 11 recorridos de navegador `tests/browser-lector-*.cjs`, incluido el nuevo `browser-lector-recuperacion.cjs`, que falla contra la app sin estos cambios.

No se cambió la identidad de build ni el service worker: eso corresponde al momento de publicar.

## H1 · El descuento general dejaba `NaN` en renglones finales con importe cero · corregido

Sin base restante ya no se reparte nada. Prueba: `tests/edge-lector-descuento-filas-cero.test.cjs`.

## H2 · Subtotal o impuesto mal leído trababa la fila · corregido

**Antes.** La fila quedaba en «El importe no cuadra» sin forma de corregir el dato causante. Cargarla exigía falsear el precio, y se cargaba un costo equivocado.

**Ahora.**

- Las filas que cuadran siguen sin mostrar subtotal ni impuesto, como se decidió en REV85.
- La fila que no cuadra muestra lo que dice la factura, lo que da la cuenta y la diferencia.
- En esa fila se pueden corregir el subtotal y el impuesto.
- El botón «El subtotal está mal leído» descarta el subtotal y usa cantidad × precio − descuento + impuesto. Muestra el importe y exige la confirmación «Confirmé cuánto pago por este producto».
- Lo leído por la IA (`subtotalIa`, `impuestoIa`) se conserva aparte de la corrección, y la fila corregida lo muestra.

## H3 · Una celda atípica descartaba toda la factura · corregido en modo revisión

Fuera del modo revisión, el contrato estricto no cambia.

| Caso | Servidor | App |
| --- | --- | --- |
| Cantidad, precio o subtotal negativos | Marca `ajuste` y conserva el signo; no recibe descuento general | Fila de solo lectura «Ajuste: no se carga». No es deuda anterior ni cambia stock o costos. Su importe entra con signo en la comparación con el total impreso. Se puede dejar de tener en cuenta, o convertir en producto si la IA se equivocó |
| `unidadesPorBulto` en 0 o no entero | Pasa a 1 con `bultoDesconocido` y `packAmbiguo` | «Presentación a revisar»: no se puede cargar hasta elegir cómo entra el stock |
| `producto` vacío | Llega con `productoVacio` | «Sin nombre: elegí el producto». Ni el emparejador ni la memoria eligen, y la elección no se recuerda |
| `impuestoFila` negativo | Se conserva con signo | Se controla contra el subtotal como cualquier fila |

**Siguen rechazando la lectura:**

- números como texto;
- valores fuera de rango;
- descuento de fila negativo;
- más de 200 filas.

## Aviso de cuenta del proveedor principal

**Antes.** Si OpenAI rechazaba la clave y el respaldo también fallaba, la app solo mostraba el error del respaldo.

**Ahora.** Dueño y admin ven «Aviso para administración: OpenAI rechazó la clave del lector…». Aplica también a falta de saldo, permisos y modelo no encontrado. El detalle del error agrega la categoría del primer intento. Nunca se muestra texto crudo del proveedor.

## Pendiente, fuera de este cambio

- **Total del encabezado de la compra.** Cuando hay ajustes, sigue saliendo del total impreso. Falta decidir si el total a comparar en el paso 3 debe descontarlos.
- **Reintento adicional a Gemini.** Requiere ampliar el contrato de intentos (reserva, contabilización y límites en SQL). Queda para después de recuperar OpenAI y medir lecturas reales.
- **Los siete 429 del 06/11.** Siguen sin correlacionar.
- **Rechazo de la credencial de OpenAI (S1).** Se corrige en la cuenta del proveedor y en el secreto de la función.

## Sondas

| Archivo | Qué muestra |
| --- | --- |
| `sonda-descuento-global.mjs` | La salida del servidor para H1 |
| `sonda-renglones-atipicos.mjs` | La salida del servidor para H3 |
