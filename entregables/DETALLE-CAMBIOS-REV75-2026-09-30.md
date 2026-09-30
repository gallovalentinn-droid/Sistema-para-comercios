# MiComercio — cambios REV75 (30/09/2026)

**Base:** REV74 (`MiComercio-Sistema-Completo-REV74-2026-09-30.zip`, SHA-256 `8b5d0b52…9b75`), que nunca se publicó.

**Motivo:** la revisión de REV74 pidió, antes de considerar la publicación:

- **R74-01 (P1):** en un pack, los tamaños de los componentes intercambiados se toman como el mismo producto. «Pack Nivea Crema 75g Jabon 125g» se elegía solo como «…Crema 125g Jabon 75g»;
- **R74-02 (P2):** la descripción de la IA saltea la regla nueva de datos sobrantes. «Fideos Luchetti Codito 45 500gr» con la descripción «Fideos Luchetti Codito 500gr» quedaba en «Coincide»;
- **R74-03 (P2):** el oráculo deja que números sueltos tapen medidas contradictorias («10g 500ml 20» contra «20g 500ml 10»);
- además, que los trasplantes pierden la palabra de cantidad del donante.

**Alcance:** el emparejador (componentes y la rama de la descripción), el evaluador (oráculo, generadores y prueba con descripción) y la identidad REV75. No cambian la memoria, la migración (`REV71-ALIAS-FACTURA.sql`), las pruebas SQL, la Edge Function, Caja ni Ventas. Fuera del bloque del emparejador, el HTML solo cambia `packageRevision`.

---

## 1. Reproducción

`respuesta-revision-REV74/antes-despues.txt` (script: `reproducir.cjs`, se corre sobre cualquier paquete con su propio oráculo).

| Caso | REV74 | REV75 |
|---|---|---|
| Pack Nivea Crema **75g** Jabon **125g**, con «…Crema 125g Jabon 75g» en el catálogo | Coincide | Elegí cuál es; el pack marcado «(otra presentación)» |
| Combo Jugo Naranja **2L** Jugo Manzana **1L** | Coincide | Elegí cuál es |
| PACK NIVEA CREMA 75G 125G · NIVEA CREMA 75G · JABON NIVEA 75G · PACK NIVEA 75G 125G | Coincide | Elegí cuál es |
| Controles: CREMA 125G JABON 75G · JABON 75G CREMA 125G · CREMA 125G 75G · combo con X6 · combo en otro orden con nombres · SUSPENSION 60ML 200MG | Coincide | Coincide (sin cambios) |
| Fideos 45 500gr · Gomitas 620gr · Queso 35gr · CIG.MARLB.BOX X10, **con** la descripción sin ese dato | Coincide | Elegí cuál es (igual que sin descripción) |
| Controles con descripción: SPEED LATA · FERNET 750CC · FID.LUCH.COD 500GR X20 · GOMITAS SUELT | Coincide | Coincide (sin cambios) |
| Oráculo: 4 elecciones incorrectas (fertilizante con números sueltos, pack, combo, componente suelto) | Las acepta | Las rechaza |

**Causas:**

- **R74-01:** `rev74Conciliar` cruza las medidas por tipo y valor en todo el nombre, sin saber a qué componente pertenece cada una. Los dos lados tienen {125 g, 75 g}, así que la conciliación queda completa.
- **R74-02:** la regla de datos sobrantes y la del número que decide se aplicaban solo al mejor candidato de lo impreso. La rama que acepta la propuesta de la descripción miraba incompatibilidad, palabras y cobertura, pero no esas dos reglas.

---

## 2. Cambios en el emparejador (`beta/index.html`, bloque `REV70_EMPAREJADOR`)

### 2.1 Cada medida con su componente (R74-01)

`rev75Componentes` guarda, junto a cada medida, las palabras que la preceden. En el primer tramo, solo la última palabra nombra el componente: «Pack Nivea Crema 125g» da *crema*, porque «pack nivea» nombra al producto entero.

`rev75CompararComponentes` se aplica solo cuando uno de los dos lados tiene **dos o más medidas del mismo tipo**:

- **Emparejamiento:** cada medida del renglón se empareja con la del producto cuyas palabras propias coinciden, y pesa más la palabra más cercana a la medida. En «JABON 75G CREMA 125G», *jabon* dice de qué es el 75.
- **Otra presentación:** el mismo componente con otra medida es otra presentación («crema 75g» contra «crema 125g»).
- **Sin palabras que lo digan:** solo vale el mismo orden con los mismos valores. «125G 75G» coincide; «75G 125G» pregunta.
- **Menos componentes:** si el renglón nombra menos componentes que el producto, puede ser el producto suelto y se pregunta. Por ejemplo, «JABON NIVEA 75G» contra el pack.
- **Medidas de distinto tipo:** la dosis y el volumen de «200mg 60ml» no entran en esta regla y siguen valiendo en cualquier orden.

### 2.2 La descripción pasa por las mismas reglas (R74-02)

`bloqueo` junta en una sola función la regla del número o la medida que decide (REV72 y REV73), la de datos sobrantes (REV74) y la de componentes dudosos (REV75). Se aplica igual a dos cosas:

- al mejor candidato de lo impreso;
- al producto que propone la descripción, medido contra el texto impreso.

**Resultado:** una descripción que omite un dato impreso (45, 620GR, 35GR, X10) ya no elimina la necesidad de elegir. Si aclara sin tapar datos, sigue resolviendo, por ejemplo con SPEED LATA o con FID.LUCH.COD 500GR X20.

---

## 3. Evaluador (`evaluacion-emparejador-REV75/`)

### 3.1 Oráculo (R74-03)

- **Contradicción explícita:** si después de emparejar medida con medida quedan una del texto y una del producto del mismo tipo, es una contradicción. Ningún número suelto puede taparla.
- **Componentes, con código propio:** si un lado tiene dos o más medidas del mismo tipo, cada una tiene que corresponder al mismo componente. Si no se puede saber, tienen que estar en el mismo orden. Y el texto no puede nombrar menos componentes que el producto.
- **Lo que se mantiene:** los casos válidos siguen aceptados: 600 contra 600mg, 600MG contra «Actron 600», el embalaje y el orden de dosis y volumen.

### 3.2 Generadores

- **Mutaciones:** se agrega el intercambio de los valores de dos medidas del mismo tipo (Crema 125g Jabon 75g → Crema 75g Jabon 125g).
- **Trasplantes:** conservan la palabra de cantidad del donante. REV74 armaba «Ibuprofeno Actron comprimidos 600mg 10»; REV75 arma «Ibuprofeno Actron 600mg 10 comprimidos».
- **Con descripción (nuevo, por R74-02):** cada texto se prueba dos veces, solo y con la descripción de la IA igual al nombre del producto. En las mutaciones es el nombre original; en los trasplantes, el producto que dio las palabras. Es el peor caso: la IA «corrige» el renglón hacia el catálogo y omite el dato alterado.

### 3.3 Resultados con el mismo oráculo (catálogo real, 720 productos)

Son 3.144 textos mutados y 7.180 trasplantes; cada uno se prueba dos veces, sin descripción y con descripción.

| Revisión | Mutaciones: elige solo el original | Mutaciones: elige solo otro que no explica | Trasplantes: elecciones que no explica | De ellas, con descripción |
|---|---|---|---|---|
| REV71 | 1.639 | 10 | 504 | 246 |
| REV72 | 156 | 5 | 243 | 177 |
| REV73 | 0 | 2 | 186 | 175 |
| REV74 | 0 | 0 | 175 | 175 |
| **REV75** | **0** | **0** | **0** | **0** |

**Qué cambia respecto de REV74:**

- **Sin descripción,** REV75 elige exactamente lo mismo en los trasplantes.
- **Con descripción,** deja de elegir solos 131 textos distintos:
  - 111 son elecciones que el oráculo no explica;
  - 20 son casos en los que lo impreso solo ya preguntaba, porque un número de paquete puede decidir (por ejemplo, «Cigarrillo Marlboro Crafted Box x10» con «Cigarrillo Marlboro x10» en el catálogo). Ahora la descripción tampoco lo saltea.
- **R74-01 no cambia nada con el catálogo real:** ningún producto tiene dos medidas del mismo tipo. Se prueba con datos sintéticos.

---

## 4. Archivos

| Archivo | Cambio |
|---|---|
| `beta/index.html` | En el bloque `REV70_EMPAREJADOR`:<ul><li>`rev75Componentes` y `rev75CompararComponentes`;</li><li>los componentes se guardan en el índice y en el renglón;</li><li>la contradicción o duda de componentes se aplica en `rev70Puntaje`;</li><li>`bloqueo` se aplica al candidato impreso y a la rama de la descripción;</li><li>`evaluar` devuelve también el producto indexado.</li></ul>También cambia `packageRevision:75` |
| `beta/sw.js` | Caché `micomercio-beta-6.0.0-f6-rc2-rev75` |
| `tests/beta-lector-componentes-rev75.test.cjs` | **Nuevo, 6 pruebas:**<ul><li>R74-01;</li><li>controles de R74-01;</li><li>R74-02 con y sin descripción, y sus controles;</li><li>el oráculo contra elecciones incorrectas y correctas;</li><li>mutación con intercambio de componentes y descripción;</li><li>trasplantes con palabras de cantidad y descripción.</li></ul>**Sobre REV74 fallan 4 de 6.** Pasan los controles y la prueba del oráculo, que no depende del emparejador |
| `tests/beta-lector-procedencia-rev74.test.cjs`, `tests/beta-lector-medidas-rev73.test.cjs` | Usan el evaluador de REV75 |
| `tests/*` (6 archivos) | Identidad REV75 |
| `entregables/evaluacion-emparejador-REV75/` | Antes estaba en `REV74/`. Cambian el oráculo y los generadores, la prueba corre con descripción y se suman 3 contraejemplos con artículos reales (23 en total; REV74 elegía mal los 3). También se actualizan el LEEME y los resultados |
| `entregables/pruebas-navegador-REV75/` | Antes estaba en `REV74/`. Suma el paso 13: el pack con tamaños cambiados y los fideos 45 con descripción quedan en «Elegí cuál es»; los controles coinciden |
| `entregables/respuesta-revision-REV74/` | Reproducción antes y después |
| `integrity-manifest.json` | Revisión 75 |

---

## 5. Verificación

- **Pruebas automáticas:** 333 de 333 aprobadas (327 de REV74 más 6 nuevas). No las ejecuté en Windows.
- **Integridad:** correcta en 25 archivos, sin secretos. ESLint da los mismos 18 avisos heredados (`module` y `require`).
- **SQL (Postgres 16 local):** `REV71-ALIAS-FACTURA.sql` aplicada dos veces, 11 de 11. La migración, las pruebas SQL y `supabase/functions/` son idénticas a REV74.
- **Catálogo real** (720 productos; no se incluye en el paquete):
  - ajuste: 47 de 50 elegidos solos y bien, 0 mal, 3 para elegir con el correcto entre las opciones;
  - control: 41 de 45 elegidos solos y bien, 0 mal, 4 para elegir con el correcto;
  - productos que no están en el catálogo: 0 elegidos solos;
  - contraejemplos de las cinco revisiones: 23 de 23 sin elección automática errónea;
  - nombres exactos: 673 elegidos solos, todos con su propio producto, y 47 para elegir, igual que en REV72 a REV74;
  - mutaciones y trasplantes, con y sin descripción: 0, 0 y 0 (ver 3.3).
- **Navegador (Chromium):** `lector-emparejador-rev75.cjs` recorre los 13 pasos sin errores de consola. El mismo script sobre REV74 falla en el paso 13. La regresión de REV54 da lo mismo que antes: `t40` sin desborde a 1366 y 390 px, y `t42` con 37 unidades.
- **Reproducciones anteriores:** los scripts de `respuesta-revision-REV70` a `REV73` dan la misma salida del emparejador sobre REV74 y sobre REV75.

**Límites:**

- **Detección de componentes:** usa las palabras que **preceden** a cada medida. Si un nombre las escribe después («Pack 125g crema 75g jabon»), la asociación puede no coincidir con la del texto. En ese caso el resultado es conservador: se pregunta. Lo probé con «PACK CREMA 125G JABON 75G» contra ese producto, que queda para elegir.
- **Oráculo:** usa la misma idea de componentes que el emparejador, pero con código propio. Por eso no es un control totalmente independiente de esa decisión de diseño.
- **Descripción de la IA:** se prueba con descripciones fijas (el nombre del catálogo), no con respuestas reales de Gemini.
- **Catálogo:** la revisión midió sobre 721 productos; acá son 720.
- **Pendientes:** siguen las pruebas con dos dispositivos reales, con facturas reales y contra Gemini. La nube y la IA de los recorridos son simuladas.

---

## 6. Para publicar

Igual que en REV71 a REV74:

1. Respaldo de la base.
2. `REV71-ALIAS-FACTURA.sql`.
3. `leer-factura` con `supabase/functions/` (sin cambios desde REV70).
4. `beta/index.html` y `beta/sw.js`, juntos.

No publiqué ni hice cambios en Supabase.
