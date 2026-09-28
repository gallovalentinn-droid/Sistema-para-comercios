# MiComercio REV58 — reintentar toda la sincronización con un solo toque

**Base:** repositorio `main` en `98bd5ae` (REV57).
**Alcance:** solo el cliente (`beta/index.html`) y la identidad REV58. **No requiere migraciones** ni cambios en Supabase.

## Por qué

Después de que el mostrador perdió la sesión el 27/09, cada venta quedó trabada en la cola en estado `dead_letter_v4`. Para recuperarlas, había que abrir **Soporte → Ver sincronización y licencia** y tocar «Reintentar» **en cada operación, una por una**. El botón general «Reintentar sync» no servía: solo enviaba las pendientes y dejaba las trabadas.

## Qué cambió

1. **Panel «Sincronización y excepciones».**
   - El botón «Reintentar sync» ahora se llama **«Reintentar todo»**.
   - Con un toque vuelve a poner en cola las operaciones reintentables del comercio actual y procesa la cola.
   - Incluye las operaciones en *dead-letter*, en espera de revisión, bloqueadas, en reintento y pausadas por licencia (estas últimas, solo si la licencia está operable). Un cierre normal con una operación anterior descartada permanece para resolución mediante cierre con excepción.
   - Las operaciones se reencolan en su orden original.
   - El reintento conserva el identificador de cada operación. En producción, las RPC de venta y cierre consultan el registro de operaciones procesadas antes de aplicar una operación repetida.
   - Mientras trabaja, el botón muestra «Reintentando…». Al terminar aparece un aviso claro:
     - «Reintentamos 4 operaciones. Todo sincronizado.»;
     - «… Quedan N pendientes de envío; se enviarán cuando haya conexión y una sesión válida.»;
     - «… Todavía quedan N con problemas: si dice «JWT» o «sesión», volvé a ingresar y tocá otra vez.».
2. **Barra lateral.** Cuando aparece «Falta subir a la nube», el botón «Reintentar ahora» intenta las operaciones V4 y luego sube la copia. Si el reintento falla, muestra el error en lugar de anunciar éxito.
3. **Alcance por comercio.** El panel, el indicador y el resumen del reintento muestran solamente las operaciones del comercio abierto. Sin comercio resuelto, el lote no modifica la cola.
4. **Sin cambios:**
   - Se mantiene el botón «Reintentar» de cada operación elegible, salvo el cierre normal que requiere resolución por excepción.
   - «Descartar» sigue exigiendo motivo y un reintento previo.
   - El procedimiento de cierre con excepción no cambia.

## Ajustes hechos durante la revisión del parche

- Se evitó reintentar, tanto en lote como individualmente, un cierre normal si antes hubo una operación descartada en su misma caja; el panel muestra solamente «Cerrar con excepción» para ese caso.
- El lote exige que el comercio esté identificado y el panel y el indicador muestran solamente su cola.
- El acceso rápido deja de anunciar «Todo sincronizado» si falla el reintento de operaciones V4 o la subida de la copia.
- El aviso distingue las operaciones pendientes de envío de las realmente confirmadas.
- Si falla la lectura final de la cola, se informa el error; ya no se interpreta como cero pendientes ni se anuncia una sincronización completa.
- Si el indicador no puede leer la cola local, permanece visible y dice «pendientes sin verificar».
- Se corrigió la ruta inicial del arnés de navegador y se añadieron aserciones al escenario visual.

## Uso en el Kiosco de Ponce

1. Volver a ingresar con poncetiago20, sin borrar los datos del navegador.
2. Recargar la página: aparece REV58.
3. Abrir **Soporte → Ver sincronización y licencia → Reintentar todo**. Si la barra lateral muestra «Reintentar ahora», también se puede usar ese acceso. Revisar cuántas operaciones quedaron pendientes o con problemas antes de cerrar la página.

## Archivos

- `beta/index.html`:
  - nuevas funciones `f33ReintentarTodo` y `f33MensajeReintentoTodo`;
  - botón del panel;
  - botón de la barra lateral;
  - `packageRevision:58`.
- `beta/sw.js`: caché `micomercio-beta-6.0.0-f6-rc2-rev58`.
- `integrity-manifest.json`: revisión 58 y hashes nuevos.
- `tests/beta-reintentar-todo-rev58.test.cjs` (nueva):
  - que existan los botones;
  - que se reencolen en orden solo las operaciones reintentables del comercio actual (excluye confirmadas, otro comercio y pausadas sin licencia);
  - que el procesamiento sea único;
  - los mensajes, los errores del acceso rápido, el alcance por comercio y la protección de cierres con excepción.
- Pruebas de identidad actualizadas a REV58.
- `entregables/pruebas-navegador-REV58/`: prueba de navegador y capturas.

## Verificación

- **Pruebas automáticas:** 245 de 245 aprobadas, incluidas las regresiones añadidas durante esta revisión.
- **Integridad y sintaxis:** 19 archivos correctos, sin secretos privados detectados; tres scripts de la beta con sintaxis válida.
- **Navegador local (Chromium, sin red externa, a 1366 y 390 px):**
  1. Tres ventas y un producto quedan en `dead_letter_v4` con «PGRST303 | JWT expired», como en el mostrador.
  2. El panel muestra 4 problemas.
  3. Un toque en «Reintentar todo» las pasa a `pendiente_v4`: 0 problemas y 4 pendientes de envío.
  4. El aviso indica que siguen pendientes hasta recuperar conexión y sesión válida.
  5. No hubo errores de página.
- **Arnés de navegador:** ahora sirve la beta del repositorio por defecto. La ejecución visual requiere Playwright y Chromium; el resto de la suite no depende de ellos.
- **Base pública, solo lectura:** `operaciones_procesadas` tiene clave primaria por comercio e identificador de operación; las RPC de venta y cierre usan `private.reservar_operacion`. No se creó una venta ni se reintentó una operación real.
- **Límite de la prueba:** el arnés no confirma operaciones en Supabase. El envío final con una sesión renovada deberá observarse en un dispositivo del comercio.
- **Beta pública:** `beta/index.html` y `beta/sw.js` en `https://micomercio.ar/beta/` coinciden byte por byte (SHA-256) con los archivos de REV58 publicados en `main`. La lectura pública fue sin caché. No se hizo un reintento autenticado con ventas reales del comercio; esa confirmación sigue pendiente en el dispositivo con una sesión renovada.
