# Lector de facturas con IA · hallazgos y correcciones locales (10/11/2026)

Base: `origin/main` cb1c9fc (REV94). Todo es local, con respuestas sintéticas: no hubo llamadas a OpenAI ni a Gemini, no se tocó Supabase y no se publicó nada. Nada de esto rige en producción hasta publicar la función y la app.

**Estado de las pruebas (verificado localmente):**

- 523 pruebas unitarias y de función Edge (`tests/*.test.cjs`);
- 11 recorridos de navegador `tests/browser-lector-*.cjs`, incluido el nuevo `browser-lector-recuperacion.cjs`, que falla contra la app sin estos cambios.

**Identidad del candidato (preparada en local, no publicada):** REV95, edición `2026-11-10`, cache del service worker `micomercio-beta-6.0.0-f6-rc2-rev95` y manifiesto regenerado con `tools/actualizar-integridad.cjs`. `node tools/verificar-integridad.cjs` da «Integridad correcta: 33 archivos». La función pública sigue en v24 y la web pública en REV94: REV95 no está reservada ni publicada.

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

## Revisión de Codex sobre def617e · corregido

| Obs. | Problema | Corrección |
| --- | --- | --- |
| R1 | Al reclasificar un ajuste como producto se perdía la evidencia de bultos, y se cargaba sin preguntar | La fila de ajuste se arma con la misma función que las filas normales: conserva `porBultoIa`, `packDetectado`, `packAmbiguo` y `bultoDesconocido`. Reclasificada, exige decidir cómo entra el stock |
| R2 | Un ajuste sin nombre reclasificado se guardaba en memoria | La marca `sinNombre` se conserva en la fila de ajuste; no se recuerda |
| R3 | El paso 3 mostraba como error la diferencia ya explicada por los ajustes | El total impreso se conserva. El paso 3 concilia mercadería cargada + ajustes tenidos en cuenta contra ese total (`remitoHeader.ajustesTicket`). Una diferencia real, o un ajuste excluido, vuelve a mostrarse |
| R4 | La prueba de memoria usaba una estructura inválida | Usa `rev70MemoriaVacia()`, con control positivo y dos negativos |

Regresiones en `tests/browser-lector-recuperacion.cjs`.

## Pendiente, fuera de este cambio
- **Reintento adicional a Gemini.** Requiere ampliar el contrato de intentos (reserva, contabilización y límites en SQL). Queda para después de recuperar OpenAI y medir lecturas reales.
- **Los siete 429 del 06/11.** Codex los correlacionó (ver `ENTREGA-CODEX-PENDIENTES-2026-11-10.md`): corresponden al límite propio de seis llamadas a proveedores en cinco minutos, agotado por tres lecturas fallidas que usaron OpenAI y Gemini. No requieren cambio de código; los límites no se tocan.
- **Rechazo de la credencial de OpenAI (S1).** El usuario informó que creó una clave nueva. Falta comprobar que esté cargada como secreto `OPENAI_API_KEY` de la función y que una lectura real funcione.
- **Publicación.** Función y web, con verificación pública posterior. Requiere autorización expresa.

## Sondas

| Archivo | Qué muestra |
| --- | --- |
| `sonda-descuento-global.mjs` | La salida del servidor para H1 |
| `sonda-renglones-atipicos.mjs` | La salida del servidor para H3 |
