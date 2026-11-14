# Lector de facturas con IA · hallazgos y correcciones locales (10/11/2026)

Base: `origin/main` cb1c9fc (REV94). Todo es local, con respuestas sintéticas: no hubo llamadas a OpenAI ni a Gemini, no se tocó Supabase y no se publicó nada. Nada de esto rige en producción hasta publicar la función y la app.

**Estado de las pruebas (verificado localmente):**

- 523 pruebas unitarias y de función Edge (`tests/*.test.cjs`);
- 11 recorridos de navegador `tests/browser-lector-*.cjs`, incluido el nuevo `browser-lector-recuperacion.cjs`, que falla contra la app sin estos cambios.

**Identidad:** REV95, edición `2026-11-10`, cache del service worker `micomercio-beta-6.0.0-f6-rc2-rev95` y manifiesto regenerado con `tools/actualizar-integridad.cjs`. `node tools/verificar-integridad.cjs` da «Integridad correcta: 33 archivos».

## Publicación REV95 · 10/11/2026, con autorización expresa del usuario

- **Web.** `d0bd95b` enviado a `main` como avance directo desde `cb1c9fc`. Verificado públicamente sin caché en `micomercio.ar`: `beta/index.html`, `beta/sw.js`, `integrity-manifest.json` e `index.html` coinciden con el candidato (normalizando saltos de línea); revisión 95 y cache `rev95`.
- **Función.** `leer-factura` pasó de v29 a **v30**, ACTIVE, con JWT requerido. Los seis archivos desplegados son idénticos a los del repositorio (normalizando saltos de línea). El preflight CORS desde `https://micomercio.ar` responde 204.
- **Escenarios en la beta pública.** `tests/browser-lector-recuperacion.cjs` corrido contra `https://micomercio.ar/beta/` (REV95 confirmada en la página), para OpenAI y Gemini simulados, a 1366 y 390: aprobado. Es una prueba sintética: Supabase reemplazado por un stub, sin sesión real, sin lecturas pagas y sin compras.
- **No se hizo:** lecturas reales con proveedores, migraciones SQL ni cambios de secretos.

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

## S2 · El respaldo Gemini no responde · cambio de modelo publicado (migración y función v31)

**Medición real del 11/11/2026**, autorizada por el usuario. Llamadas directas a Google desde una máquina local, con el pedido que arma el código del lector (modo revisión) y una factura ficticia de 36 filas; no pasaron por Supabase ni usaron datos de comercios.

| Modelo | Respondió | Lecturas sin errores | Tiempo |
| --- | --- | --- | --- |
| `gemini-3.8-flash` (el desplegado) | 0 de 7; tampoco con un texto mínimo | — | 100 s sin respuesta, o 503 |
| `gemini-3.5-flash-lite` | 14 de 15 (un 503) | 14 de 14, incluidas 4 con imagen degradada | 10 a 19 s |
| `gemini-3.1-flash-lite` | 5 de 5 | 3 de 5 (un precio mal leído, marcado por el control) | 12 s |
| `gemini-3.6-flash` | 3 de 5 (dos 503) | 3 de 3 | 15 a 20 s |

La clave es válida y el modelo figura disponible: el fallo es del servicio para ese modelo, no del pedido. Un reintento adicional contra `gemini-3.8-flash` no habría ayudado.

**Cambio preparado.**

- `F6_INVOICE_MODEL` pasa a `gemini-3.5-flash-lite`.
- `REV95-LECTOR-RESPALDO.sql` agrega ese modelo a la lista que acepta `f6_service_registrar_resultado_lectura_factura`. Sin esa migración, una lectura del respaldo se entregaría pero su resultado no quedaría registrado. Conserva `gemini-3.8-flash` para poder volver atrás.
- Prueba: `tests/edge-lector-respaldo-rev95.test.cjs` exige que el modelo de la función esté en la lista de la migración.

**Estado al 11/11/2026, con autorización expresa del usuario para la migración y el push.**

- **Migración aplicada en producción** (`rev95_lector_respaldo`). Verificado: la función SQL acepta la lista nueva, el resto de su definición es idéntico al anterior y conserva dueño, `security definer` y permisos (`postgres`, `service_role`).
- **Repositorio enviado a `main`.** La web sigue en REV95; cambia el manifiesto de integridad por el extractor y la migración nueva.
- **Función desplegada el 11/11/2026, con autorización expresa del usuario y revisión de Codex sobre `20a172e`.** `leer-factura` pasó a **v31**, ACTIVE, con JWT requerido. Los seis archivos desplegados son idénticos a los del repositorio (normalizando saltos de línea), con `gemini-3.5-flash-lite` como respaldo.
- **Lectura real sobre v31, hecha por el usuario el 11/11 a las 18:56.** La función arrancó y respondió 200: OpenAI (`gpt-6-luna`), un intento, 7 filas, 49,4 s hasta registrar el resultado, sin llamadas pendientes ni filas con importe discrepante en los registros. No acredita la compra ni lo que mostró la pantalla de revisión.
- **Sin comprobar todavía:** una lectura real del respaldo a través de la función pública. Solo ocurre con una sesión de la app y cuando OpenAI falla.

**Límites.** Pocas muestras, de una sola franja horaria, con una factura impresa y nítida: mide disponibilidad más que calidad con fotos reales.

## S2/S3 · El respaldo se activó y falló en producción · corrección preparada en local, sin publicar

**Evidencia pública del 12/11/2026 (función v31).**

| Inicio | OpenAI | Gemini `3.5-flash-lite` | Total |
| --- | --- | --- | --- |
| 13:06:09 | respondió, 17 filas (12 con importe discrepante) | no se usó | 54 s |
| 13:07:32 | sin respuesta a los 60 s | 503, unos 9 s después | 70 s |
| 13:08:52 | sin respuesta a los 60 s | 503, unos 7 s después | 67 s |
| 13:38:21 | sin respuesta a los 60 s | 503, unos 7 s después | 68 s |

**Lectura.** Las lecturas reales buenas de OpenAI tardaron 38, 49 y 54 s, y el lector le daba 60 s fijos: el corte quedaba justo. Es una hipótesis; el registro no dice cuánto habría tardado. Gemini falló rápido con 503 las tres veces. En las mediciones directas del 11/11, cada 503 fue seguido por una respuesta buena en el intento siguiente.

**Cambio preparado.**

- **Más tiempo para el principal.** OpenAI recibe hasta 90 s cuando el plazo conjunto (135 s) deja 40 s para el respaldo; nunca menos de 60 s. Con poco margen se comporta como antes.
- **Un reintento a Gemini.** Solo ante un 503, una vez por lectura. Espera lo que indica el proveedor (`Retry-After`, 30 s en producción) o 3 s si no indica nada. Se omite si esa espera, 4 s de admisión y 25 s de lectura mínima no caben en el plazo restante. No se reintenta un tiempo agotado, un 429 ni una respuesta inválida.
- **Contrato de intentos.** `REV95-LECTOR-REINTENTO.sql` admite hasta tres intentos por lectura (columnas y tabla de intentos) y agrega la RPC `f6_service_ampliar_intento_lectura_factura_rev95`. **La reserva inicial y los límites de frecuencia no cambian** (una o dos plazas; 6 llamadas en 5 minutos, 30 en una hora).
- **La plaza extra se pide recién al reintentar**, bajo el mismo candado que la reserva y contando las plazas ya admitidas de otras lecturas. Sin capacidad, sin la RPC (base sin migrar) o ante un error, se informa el fallo original sin otra llamada.
- **Diagnóstico.** `iaRetryUsed` en la respuesta, `retryUsed` en el error y el evento `F6_IA_RETRY` en los registros.

**Revisión de Codex sobre `51bf3b5` · corregido.**

| Obs. | Problema | Corrección |
| --- | --- | --- |
| R1 | El reintento esperaba siempre 3 s e ignoraba el `Retry-After` de Gemini | Espera el valor indicado y solo reintenta si cabe en el plazo. Regresiones con 30 s, con tiempo suficiente e insuficiente |
| R2 | Reservar tres plazas por anticipado podía rechazar otra lectura solapada (`2 + 3 + 2 = 7`) | La reserva vuelve a ser de dos; la tercera se pide al necesitarla con una RPC atómica. Regresión SQL con dos llamadas previas y dos lecturas solapadas |

**Consecuencia del reparto del plazo, decidida y a la vista.** El reintento con 30 s de espera cabe cuando OpenAI falla rápido (como con la clave rechazada del 04 al 10/11: quedan más de 120 s). No cabe cuando OpenAI agota sus 90 s (quedan unos 38 s), que es el caso del 12/11: ahí la mejora es el tiempo extra del principal, no el reintento. Se priorizó darle tiempo a OpenAI porque es el que venía respondiendo, para evaluar si el corte a los 60 s era demasiado temprano; las mediciones disponibles no prueban que un proveedor sea en general más preciso que el otro. Con 70 s para el principal el reintento puede entrar en algunos casos, dependiendo de la demora de Gemini y del presupuesto efectivo; no alcanza para todos los incidentes observados (`135 − 70 − 7 = 58`, menor que los 59 necesarios).

**Revisión de Codex del 13/11 sobre `9fbde0c`:** R1 y R2 cerradas en código y localmente, sin nuevos bloqueos; aprobación técnica con hasta 90 s para OpenAI. No incluye migración, despliegue, push ni llamadas pagas.

**Verificado localmente.** 531 pruebas unitarias; 11 recorridos de navegador; integridad; y `node tests/sql-lector-rev84.cjs --cupo --reintento` sobre PostgreSQL local: migraciones aplicadas dos veces, ampliación única y en orden, cuarto intento rechazado, topes de 5 minutos y de una hora intactos, lecturas solapadas admitidas y registro del modelo de respaldo.

**No acreditado.** Que 90 s alcancen para las facturas que hoy agotan la espera, ni que esperar 30 s recupere a Gemini. Solo se verá con lecturas reales después de publicar.

**Para publicar:** migración (optativa en el orden, necesaria para que exista el reintento), despliegue de la función y nueva revisión de Codex. La web no cambia.

## Pendiente, fuera de este cambio
- **Reintento adicional a Gemini.** Requiere ampliar el contrato de intentos (reserva, contabilización y límites en SQL). Queda para después de recuperar OpenAI y medir lecturas reales.
- **Los siete 429 del 06/11.** Codex los correlacionó (ver `ENTREGA-CODEX-PENDIENTES-2026-11-10.md`): corresponden al límite propio de seis llamadas a proveedores en cinco minutos, agotado por tres lecturas fallidas que usaron OpenAI y Gemini. No requieren cambio de código; los límites no se tocan.
- **Rechazo de la credencial de OpenAI (S1).** Resuelto por el usuario con una clave nueva: Codex registró una lectura real con resultado de OpenAI el 10/11 a las 22:55, antes de esta publicación.
- **Lectura real sobre REV95 y v30.** Todavía no hubo ninguna. Tampoco hay medición real de Gemini. Requieren autorización para llamadas pagas.

## Sondas

| Archivo | Qué muestra |
| --- | --- |
| `sonda-descuento-global.mjs` | La salida del servidor para H1 |
| `sonda-renglones-atipicos.mjs` | La salida del servidor para H3 |
