# Pedido de cambios · Lector de facturas

MiComercio · para la próxima revisión (REV84) · 03/10/2026

9 cambios · 5 prioridad alta · 2 media · 2 baja

**Objetivo.** Que el lector no cargue stock ni costos equivocados sin que alguien lo vea, y que no quede fuera de servicio por una fila dudosa o por un problema de la cuenta de OpenAI. El criterio central: **cuando el lector no puede saber algo, pregunta y no deja cargar hasta que se resuelva**; no decide solo y no descarta toda la factura.

**Base.** Auditoría `auditoria-lector-REV83-2026-10-03.md` (hallazgos H-01 a H-08) y la evaluación del 03/10/2026 que la contrastó con el repositorio. Este pedido no cambia nada: es la especificación para quien prepare REV84.

### Contenido

1. Por qué: lo que se comprobó
2. Resumen de cambios
3. Detalle de cada cambio (hoy / cambio / criterios)
4. Reglas
5. Casos de prueba
6. Decisiones abiertas
7. Fuera de alcance y tareas que no son de código

## 1. Por qué: lo que se comprobó

| Qué pasa hoy | Evidencia |
|---|---|
| Una fila cuyo importe no cuadra rechaza las 38 filas de la factura | Reproducido con respuestas simuladas (37 bien, 1 con $1 de diferencia). Ya pasó en una lectura real: fila 1, causa numérica todavía sin demostrar |
| 2 packs de pañales «X8U» a $5.000 se preparan como 16 unidades a $625, y la fila queda en «Coincide» | Reproducido con nombres del catálogo real. Igual con salchichas «X 12 UN»: 5 a $3.000 pasan a 60 a $250 |
| Una fila de $100 con $21 de impuesto se prepara con costo $100 | Reproducción `extraTax`: el impuesto y el subtotal se usan para validar y después se eliminan |
| Con la clave de OpenAI vencida, sin saldo o con el modelo no encontrado, el lector falla aunque Gemini esté disponible | Reproducido: 401, saldo agotado, 404 y 429 sin código reconocido no llaman al respaldo |
| El cupo se reserva antes de leer y no se libera si la lectura falla | Reservas anteriores sin resultado: su causa necesita investigación |
| Si GPT consume sus 60 segundos, a Gemini le quedan 30 | Presupuesto confirmado en el código. Gemini tardó 54 s en la factura de 38 filas |
| Los tres sectores en PNG pesan 5.003.457 bytes | En JPEG calidad 0,9: 769.743 bytes (6,5 veces menos) |

**Lo que no está probado y condiciona el pedido:**

- La causa del rechazo de la fila 1 en la lectura real.
- Que los sectores en JPEG se lean igual de bien que en PNG. La medición es de tamaño, no de lectura.
- Por qué algunas reservas anteriores no tienen resultado. Puede ser una falla del proveedor, una validación rechazada, una solicitud interrumpida o una falla al registrar.

## 2. Resumen de cambios

| ID | Cambio | Hallazgo | Dónde | Prioridad |
|---|---|---|---|---|
| **L1** | Cuando el renglón trae un número de pack, preguntar «¿Lo contás por pack o por unidad?» y no cargar hasta que se responda | H-04 | Servidor + revisión | Alta |
| **L2** | Una fila cuyo importe no cuadra se marca y se corrige en la revisión; no se rechaza la factura entera | H-01 | Servidor + revisión | Alta |
| **L3** | Conservar el impuesto y el subtotal de cada fila hasta la revisión, y calcular el costo según la regla que se decida | H-08 | Servidor + revisión | Alta |
| **L4** | Usar Gemini cuando OpenAI falla por clave, saldo o configuración, con aviso para quien administra | H-03 | Servidor | Alta |
| **L5** | El cupo mensual cuenta lecturas que devolvieron una factura; los intentos y las lecturas en curso se limitan aparte | H-02 | Servidor + base | Alta |
| **L6** | El mismo control de importes para las lecturas que entran por Gemini o en HEIC | Observación de la auditoría | Servidor | Media |
| **L7** | Más tiempo total, para que el respaldo tenga tiempo útil | H-05 | Servidor + cliente | Media |
| **L8** | Sectores en JPEG | H-06 | Cliente | Baja |
| **L9** | Documentar la versión desplegada y ordenar el recorrido de REV82 | H-07 | Informes y pruebas | Baja |

**Orden.** Primero L1, L2 y L3 (evitan stock y costos mal cargados). Después L4, L5, L6 y L7 (disponibilidad). L8 y L9 entran en la misma revisión. L6 va junto con L4: si más lecturas pasan por Gemini, no pueden entrar sin el control de importes.

## 3. Detalle de cada cambio

### L1 · Pack o unidad: preguntar, no decidir · Alta

**Hoy.** Si la descripción impresa dice «X 8 U», «X 12 UN» o parecido, el servidor pisa el dato del modelo y pone ese número como unidades por bulto. Sirve para una caja de alfajores que se vende por unidad. Falla cuando el producto del catálogo es el pack: multiplica el stock y divide el costo, y la fila queda en «Coincide».

**Cambio.**

- El servidor deja de forzar las unidades por bulto. Devuelve por separado lo que dice la factura (cantidad y precio tal como están impresos) y el número de pack detectado en la descripción.
- Si hay un número de pack y no hay memoria de ese proveedor para ese producto, la fila queda en un estado nuevo, **«Falta resolver»**, con la pregunta **«¿Lo contás por pack o por unidad?»** y sin opción marcada.
- Cada opción muestra el resultado antes de elegir: «Por pack: entran 2 a $5.000» / «Por unidad: entran 16 a $625».
- La respuesta se guarda en la memoria del proveedor. La próxima factura de ese proveedor con ese producto la aplica sin preguntar y muestra cómo se contó, con opción de cambiarlo.
- El nombre del producto en el catálogo no se usa para decidir: no demuestra cómo se lleva el stock.

**Criterios de aceptación.**

- Con una fila en «Falta resolver», el botón de cargar está deshabilitado y dice cuántas filas faltan.
- Una fila con número de pack nunca queda seleccionada automáticamente la primera vez.
- Corregir la respuesta en una factura posterior actualiza la memoria.
- Renglones sin número de pack se comportan como en REV83.

### L2 · Importes que no cuadran: marcar la fila, no rechazar la factura · Alta

**Hoy.** El lector de OpenAI compara, por fila, `cantidad × precio − descuento + impuesto` contra el subtotal impreso. Si una fila no coincide, rechaza toda la lectura con `ROW_AMOUNT_MISMATCH`, no usa el respaldo y la reserva de cupo queda gastada.

**Cambio.**

- La lectura se devuelve completa. Las filas que no cuadran vienen marcadas, con la evidencia: cantidad, precio, descuento, impuesto, subtotal impreso y la diferencia.
- En la revisión, esas filas aparecen como **«El importe no cuadra»**, con los números a la vista y editables. La diferencia se recalcula mientras se corrige.
- Una fila marcada se resuelve de dos maneras: corrigiendo los valores hasta que cuadre, o sacándola de la carga.
- **La tolerancia no cambia** (medio centavo por unidad, mínimo dos centavos).
- No se pasa la lectura a otro proveedor para esquivar el control.
- El diagnóstico de REV82 se conserva: fila, campo y referencia quedan registrados.

**Criterios de aceptación.**

- 37 filas bien y 1 con $1 de diferencia: llegan las 38 a la revisión, 1 marcada.
- Con una fila marcada sin resolver, no se puede cargar.
- Una lectura con filas marcadas cuenta como lectura con resultado (ver L5).
- Si ninguna fila cuadra, la revisión lo avisa arriba de todo («Ningún importe coincide: revisá la foto»), sin cargar nada por defecto.

### L3 · Impuestos de la fila: conservar el desglose · Alta

**Hoy.** `impuestoFila` y `subtotal` sirven para el control de importes y después se eliminan del resultado. La revisión prepara como costo el precio sin el impuesto, aunque la factura lo cobre aparte.

**Cambio.**

- El impuesto y el subtotal impreso de cada fila llegan hasta la revisión y se muestran.
- El costo que se carga sale de una única regla (R3), que depende de la **decisión abierta 1**: si el costo del comercio incluye impuestos o no.
- La revisión muestra los dos números por fila: lo que dice la factura y lo que se va a guardar como costo.

**Criterios de aceptación.**

- Fila de $100 con $21 de impuesto y subtotal $121: la revisión muestra los tres valores y el costo resultante según la regla elegida.
- El total de la revisión coincide con el total impreso de la factura, o se muestra la diferencia.
- Facturas sin impuesto por fila se comportan como en REV83.

**Bloqueado** hasta definir la decisión abierta 1.

### L4 · Respaldo cuando el problema es la cuenta de OpenAI · Alta

**Hoy.** El respaldo se usa ante caídas (5xx), límite de frecuencia identificado, tiempo agotado o falla de conexión. No se usa ante clave vencida o inválida (401), saldo agotado, modelo no encontrado (404) ni 429 sin código reconocido.

**Cambio.**

- Pasan a Gemini: 401, saldo agotado (`insufficient_quota`), modelo no encontrado (404) y 429 sin código reconocido.
- En esos casos se registra un diagnóstico para quien administra (qué falló en OpenAI), sin mostrar al comercio mensajes crudos del proveedor ni datos de la clave.
- La lectura que salió por respaldo queda registrada con el modelo que la hizo y el motivo.
- Respuesta incompleta, negativa a leer y errores en los datos devueltos **no** entran en esta regla; se tratan aparte (decisión abierta 4).
- Como máximo un pase al respaldo por lectura. No se reintenta el mismo proveedor de forma automática.

**Criterios de aceptación.**

- Con OpenAI respondiendo 401, saldo agotado o 404: la lectura sale por Gemini y queda el diagnóstico.
- Si Gemini también falla, el aviso al comercio nombra el paso y el motivo, como en REV82.
- El respaldo pasa por el mismo control de importes (L6).

### L5 · Cupo: contar lecturas, no intentos · Alta

**Hoy.** El cupo se reserva antes de llamar a la IA y no se libera si la lectura falla. Cada error gasta una lectura del mes.

**Cambio.**

- Tres conceptos separados:
  - **Intento:** cada llamada. Tiene su propio límite, para evitar abuso.
  - **Lectura en curso:** reserva temporal, con límite de concurrencia y vencimiento.
  - **Lectura con resultado:** la que devolvió una factura. Es la única que descuenta del cupo mensual.
- Si la lectura falla, la reserva se libera. Si la solicitud se interrumpe, la reserva vence sola.
- Se conservan los límites de intentos y de concurrencia.
- **No se borran registros ni se reponen cupos de meses o lecturas anteriores.**

**Criterios de aceptación.**

- Una lectura que falla en el proveedor no descuenta del cupo mensual.
- Dos lecturas simultáneas no pueden superar el cupo.
- Una ráfaga de intentos fallidos se corta por el límite de intentos.
- Los registros existentes no cambian.

**Requiere cambio en la base de datos:** necesita autorización expresa antes de aplicar cualquier migración.

### L6 · El mismo control de importes para Gemini y HEIC · Media

**Hoy.** El control de importes por fila solo se aplica al camino de OpenAI. Una lectura por respaldo o en HEIC entra sin él.

**Cambio.** El control se aplica sobre el resultado, sin importar qué modelo lo produjo, y marca filas igual que en L2.

**Criterios de aceptación.**

- La misma respuesta simulada con una fila que no cuadra produce la misma marca por los dos caminos.
- Si el modelo de respaldo no devuelve el subtotal de una fila, esa fila se marca como «sin subtotal para comparar», no como correcta.

### L7 · Tiempo para el respaldo · Media

**Hoy.** 90 segundos en total; OpenAI puede usar hasta 60 y a Gemini le quedan 30 o menos.

**Cambio.**

- Ampliar el total dejando margen bajo el límite de 150 segundos de Supabase ([límites de Edge Functions](https://supabase.com/docs/guides/functions/limits)).
- **No bajar el tiempo de OpenAI:** hay lecturas reales correctas de unos 42 segundos.
- Propuesta de reparto (decisión abierta 3): 135 s en total, hasta 60 s para OpenAI, el resto para Gemini y 15 s reservados para autenticación y registro del resultado.
- El tiempo de espera del cliente tiene que ser mayor que el del servidor, y la pantalla tiene que avisar que la lectura sigue en curso.

**Criterios de aceptación.**

- Con OpenAI agotando su tiempo, a Gemini le quedan al menos 60 s.
- El resultado y el diagnóstico se registran aunque el respaldo use todo su tiempo.
- La función nunca supera el límite de la plataforma.

### L8 · Sectores en JPEG · Baja

**Hoy.** Los tres recortes se generan en PNG (5 MB en la foto de referencia). Si superan 8 MB se descartan sin aviso.

**Cambio.**

- Generarlos en JPEG de buena calidad (punto de partida: 0,9).
- Si los sectores se descartan por tamaño, queda registrado en el diagnóstico.

**Criterios de aceptación.**

- En la foto de referencia, los tres sectores pesan menos de 1 MB.
- **No se da por validado con la medición de tamaño.** Hace falta comparar lecturas reales PNG contra JPEG de la misma foto (ver sección 7).

### L9 · Documentación y recorrido de REV82 · Baja

- El informe de publicación indica la versión de `leer-factura` que quedó activa y cómo se comprobó. Hoy es la 23; el informe histórico cita la 21.
- `tests/browser-lector-diagnostico-rev82.cjs` exige literalmente la revisión 82 y falla sobre paquetes posteriores. Sacar esa exigencia y conservar sus comprobaciones del aviso de error, o marcarlo como histórico y pasar esas comprobaciones al recorrido vigente.

**Criterio de aceptación.** Todos los recorridos de navegador del paquete pasan sobre REV84.

## 4. Reglas

**R1 · Control de importes.** Por fila: `cantidad × precio − descuento + impuesto` contra el subtotal impreso. Tolerancia: medio centavo por unidad, mínimo dos centavos. Se aplica igual a todos los modelos.

**R2 · Pack.** La factura manda en cantidad y precio impresos. El número de pack es un dato aparte. La conversión depende de la respuesta:

| Respuesta | Cantidad que entra | Costo por unidad de stock |
|---|---|---|
| Por pack | la impresa | el precio impreso |
| Por unidad | impresa × unidades del pack | precio impreso ÷ unidades del pack |

**R3 · Costo.** Una sola regla para todo el lector, según la decisión abierta 1. El desglose (precio, descuento, impuesto, subtotal) se conserva en la revisión en cualquiera de los dos casos.

**R4 · Bloqueo de carga.** No se puede cargar mientras haya filas en «Falta resolver» (L1) o «El importe no cuadra» (L2). Sacar la fila de la carga también la resuelve.

**R5 · Respaldo.** Un solo pase por lectura. Causas: caída, límite de frecuencia, tiempo agotado, falla de conexión y fallas de acceso o configuración (L4).

**R6 · Cupo.** Solo descuenta la lectura que devolvió una factura. Sin efecto retroactivo.

## 5. Casos de prueba

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | PAÑALES HUGGIES CLASIC G X8U · 2 a $5.000, sin memoria | Fila en «Falta resolver», nada marcado, carga bloqueada |
| 2 | Caso 1, elijo «Por pack» | Entran 2 a $5.000. Se guarda en la memoria del proveedor |
| 3 | Caso 1, elijo «Por unidad» | Entran 16 a $625 |
| 4 | Segunda factura del mismo proveedor con el mismo producto | Aplica la respuesta guardada sin preguntar y muestra cómo se contó |
| 5 | SALCHICHAS PATY VIENA X 12 UN · 5 a $3.000, sin memoria | Pregunta. No prepara 60 a $250 por su cuenta |
| 6 | 37 filas bien y 1 con $1 de diferencia | Llegan 38 filas, 1 marcada, carga bloqueada |
| 7 | Caso 6, corrijo el precio hasta que cuadra | La marca desaparece y se puede cargar |
| 8 | Subtotal con IVA y el modelo dejó el impuesto de la fila en 0 | Fila marcada con la evidencia; no se rechaza la factura |
| 9 | Descuento en porcentaje que el modelo no pasó a pesos | Fila marcada con la evidencia |
| 10 | 144 × $1.234,57 contra $177.773,76 (diferencia $4,32) | Fila marcada: no entra en la tolerancia |
| 11 | Fila de $100 con $21 de impuesto, subtotal $121 | La revisión muestra los tres valores y el costo según R3 |
| 12 | OpenAI responde 401 | Lectura por Gemini, diagnóstico para administración |
| 13 | OpenAI sin saldo | Igual que 12 |
| 14 | OpenAI responde 404 de modelo | Igual que 12 |
| 15 | OpenAI agota su tiempo | Gemini dispone de al menos 60 s |
| 16 | Fallan los dos proveedores | Aviso con paso y motivo. El cupo mensual no baja |
| 17 | Lectura por Gemini con una fila que no cuadra | Misma marca que por OpenAI |
| 18 | Dos lecturas simultáneas con una sola lectura disponible | Entra una; la otra se rechaza por cupo |
| 19 | Sectores de la foto de referencia | JPEG, menos de 1 MB en total |
| 20 | Todo el recorrido a 1366 y 390 px | Sin desplazamiento horizontal; preguntas y marcas legibles |

Los casos 1 a 18 se prueban con respuestas simuladas, sin llamar a los proveedores.

## 6. Decisiones abiertas

1. **¿El costo del producto incluye los impuestos de la factura o no?** Bloquea L3. Depende de cómo el comercio toma el IVA y las percepciones; conviene consultarlo con quien lleva la contabilidad del comercio.
2. **¿Se puede cargar una fila que no cuadra dejando un motivo?** Recomendado: no. Solo corregir o sacar la fila.
3. **Reparto del tiempo** (L7): propuesta de 135 s en total, 60 para OpenAI y 15 de margen. A confirmar con los tiempos reales de Gemini; en septiembre hubo una lectura de 72 s.
4. **Respuesta incompleta y negativa a leer:** ¿pasan al respaldo? Recomendado: la incompleta sí, una vez y si queda tiempo; la negativa no, con aviso al comercio.
5. **Límites del cupo** (L5): cuántos intentos por comercio, cuántas lecturas en curso y cuánto dura una reserva antes de vencer.
6. **Calidad de JPEG** (L8): 0,9 como punto de partida, sujeta a la comparación con lecturas reales.

## 7. Fuera de alcance y tareas que no son de código

**No entra en REV84:**

- Renglones negativos, que hoy invalidan toda la lectura.
- Descuento general repartido sobre una fila de deuda.
- Cambios en el emparejador o en la memoria, más allá de guardar la respuesta de L1.
- Reponer cupos ya gastados.

**Tareas aparte:**

- **Clave de OpenAI:** el LEEME de REV83 dice que la clave de prueba vence a los 30 días. La fecha no se verificó en la cuenta. Reemplazarla por una sin vencimiento y revisar el saldo, sin esperar a L4.
- **Lecturas reales:** validar L8 y encontrar la causa del rechazo de la fila 1 requiere lecturas pagas con la foto de referencia. Consumen cupo y necesitan autorización.
- **Términos del servicio:** las fotos de las facturas ahora se envían a OpenAI además de Google.
- **Precio de Gemini en 2027:** la auditoría lo da como dato; no fue contrastado.

Este pedido no modificó la aplicación, las claves, los cupos ni la base de datos.

## Decisiones posteriores aceptadas

Costo final con impuestos incluidos. Memoria y cupo en migraciones independientes. Sin caché de facturas, recuperación remota ni consultas de estado. Admisión deja capacidad para ambos proveedores; respaldo admitido no repite límites. Función compatible con RPC REV83 sin migración de cupo. Cliente anterior rechazado antes de reservar/IA. Registro fallido no pierde una lectura válida. Solo sectores JPEG. Cuatro lecturas pagas intercaladas pendientes de autorización. Reintentar manualmente crea un identificador nuevo; duplicado no vuelve a llamar. Reversión conserva SQL y registros, prueba que REV83 puede reducir cupo por contar fallidas/vencidas, sin compensación automática.
