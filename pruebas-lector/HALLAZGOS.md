# Lector de facturas con IA · hallazgos de prueba (10/11/2026)

Base: `origin/main` cb1c9fc (REV94). Todo es local, con respuestas sintéticas: no hubo llamadas a OpenAI ni a Gemini, no se tocó Supabase y no se publicó nada.

**Línea base.** Antes de cualquier cambio pasaban:

- las 181 pruebas unitarias y de función Edge del lector;
- los 10 recorridos de navegador `tests/browser-lector-*.cjs`.

## H1 · El descuento general deja `NaN` en los últimos renglones · corregido

**Qué pasa.** El reparto del descuento general divide por la base restante. Si los dos o más últimos renglones tienen importe 0 (por ejemplo, regalos con cantidad 0), esa base llega a 0 antes del último renglón. La división 0/0 da `NaN`, y `descuento` y `descuentoGlobalAsignado` viajan como `null`.

**Alcance.**

| | |
| --- | --- |
| Dónde | `supabase/functions/_shared/f6-invoice-reader.mjs`, en el reparto del descuento general |
| Proveedores | OpenAI y Gemini |
| Modos | Con y sin revisión |

**Impacto.** Bajo: la app REV94 vuelve a repartir el descuento por su cuenta y carga el total correcto. Lo comprobó `sonda-revision-navegador.cjs`, caso B.

**Cambio.** Sin base restante no se reparte nada.

**Prueba de regresión:** `tests/edge-lector-descuento-filas-cero.test.cjs`.

## H2 · Un subtotal mal leído traba la fila o obliga a cargar un costo falso · abierto

**Qué pasa.**

- El subtotal impreso es la evidencia contra la que se controla cada fila.
- En la revisión no se muestra, no se puede editar y no se ve la diferencia.
- Si la IA leyó mal el subtotal, la fila queda en «El importe no cuadra» aunque cantidad y precio estén bien.
- Para cargar el producto sin excluir la fila, la única salida es falsear el precio hasta que cuadre con el subtotal mal leído.

**Reproducción.** En `sonda-revision-navegador.cjs`, caso A, se cargan 12 a $800 con el subtotal leído como 96.000. La fila se destraba con un precio de $8.000 y el costo cargado es $8.000 por unidad, diez veces el real.

**Contradice la especificación aceptada de REV84:**

- L2: «con los números a la vista y editables. La diferencia se recalcula mientras se corrige».
- L3: el impuesto y el subtotal impreso «llegan hasta la revisión y se muestran».

**Mitigación parcial.** Si el producto ya tenía costo, aparece el aviso «Antes costaba…».

## H3 · Una sola celda atípica descarta toda la lectura · abierto

**Qué pasa.** En modo revisión, cualquiera de estos casos rechaza la factura completa con `FACTURA_NO_RECONOCIDA`, en los dos proveedores:

- devolución con cantidad negativa;
- bonificación con precio negativo;
- nota de crédito con subtotal negativo;
- `unidadesPorBulto` en 0;
- renglón sin descripción;
- percepción negativa.

**Consecuencias.**

- La llamada paga a la IA ya se hizo.
- No se usa el respaldo con el otro proveedor.
- El cupo mensual no baja (L5 lo cubre).

**Reproducción:** `sonda-renglones-atipicos.mjs`.

**Contradice el criterio central de la especificación:** ante un dato dudoso, el lector pregunta y no descarta toda la factura.

## Sondas

| Archivo | Qué prueba |
| --- | --- |
| `sonda-descuento-global.mjs` | H1, en el servidor |
| `sonda-renglones-atipicos.mjs` | H3 |
| `sonda-revision-navegador.cjs` | H2 y H1 de punta a punta: salida real del extractor del servidor y revisión en la app, sin red externa |
