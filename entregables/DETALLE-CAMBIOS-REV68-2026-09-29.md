# MiComercio REV68 — el turno abierto ya no se pierde al recargar

Fecha: 29/09/2026.
Base: REV67 (sin PIN), que incluye REV66 (Productos como antes). Este paquete trae las tres: alcanza con publicar REV68.

## Qué pasaba en el Kiosco de Ponce

Las ventas llegaban completas al servidor (ítems, pagos y totales coinciden), pero algunas quedaban **fuera de todo turno**:

| Turno huérfano | Ventas | Total | Efectivo | Qué pasó |
|---|---|---|---|---|
| 28/09, 08:27 → 14:50 | 46 | $123.423 | $112.997 | Al volver a ingresar (~15:00), la app pidió abrir turno otra vez (15:02) |
| 29/09, 09:14 → 10:50 | 10 | $32.150 | $26.550 | Al recargar la página (10:52), la app pidió abrir turno otra vez (10:54) |

Esas ventas no aparecen en «Vendido en el turno» del turno siguiente, no entran en ningún cierre y su efectivo va a aparecer como sobrante en el próximo arqueo.

## Causa

Cada vez que la app arranca (abrirla, recargarla, tocar «Actualizar» o volver a ingresar), `f3Inicializar()` llama a `f3MigrarPlaceholderSesionLocal()`. Esa función se escribió como una migración única para borrar «marcadores» de turno vacíos de perfiles viejos (pre-FIX4). La condición que usaba era:

- `serverOpened === false`: el sistema **nunca** pone ese valor en `true`, así que se cumple siempre;
- «turno legacy limpio»: solo mira ventas **sin** sesión. Las ventas actuales siempre tienen sesión, así que también se cumple siempre.

Resultado: en cada arranque se borraba el turno abierto normal, aunque tuviera ventas. Se reprodujo en el navegador con 10 ventas: el turno desaparece y la app pide «Abrir turno».

## Corrección

- Nueva regla `f3SesionEsMarcadorViejo`: una sesión solo se considera marcador viejo si **nadie la abrió a mano** (sin `rev31AperturaExplicita` ni `abiertoPor`) y si **no tiene movimientos propios** (ventas, cobros, egresos ni cierres).
- `f3MigrarPlaceholderSesionLocal` y la comprobación de turno abierto de la integración F43 usan esa misma regla.
- No cambian las ventas, la caja, el formato de los datos ni el servidor. No hay migraciones SQL.

## Verificación

- **Pruebas automáticas:** 276 de 276 aprobadas (nueva `tests/beta-turno-no-se-pierde-rev68.test.cjs`).
- **Integridad:** correcta en 20 archivos, sin secretos. Sintaxis correcta y ESLint sin identificadores indefinidos.
- **Navegador:**
  - `pruebas-navegador-REV68/turno-no-se-pierde.cjs` comprueba tres casos:
    - un turno con 10 ventas sobrevive al arranque;
    - un turno abierto a mano sin ventas también sobrevive;
    - un marcador viejo sin movimientos se sigue limpiando.
  - La misma situación sobre REV65, la versión publicada, borra el turno y pide abrir otro.
- **Regresión:** pasan los recorridos de REV58 y de REV62 a REV67, y los 5 cierres de caja del modo «separo cigarrillos» cumplen las reglas del servidor.

## Qué hacer con los turnos que ya quedaron huérfanos

1. **Hoy:** al cerrar la caja, el arqueo va a mostrar un sobrante cercano a **$26.550**, el efectivo de las 10 ventas de 09:19 a 10:50. Anotalo en la explicación de la diferencia.
2. **28/09:** las 46 ventas de 08:27 a 14:50 ($112.997 en efectivo) no quedaron en ningún cierre. Los datos están completos en el servidor; hay que incluirlas en la conciliación pendiente del comercio.
3. **Después de publicar REV68:** recargar la página del mostrador **una sola vez** con el turno abierto y comprobar que no pide abrir turno otra vez.

## Aparte (no afecta ventas)

Cada venta subida genera un error 400 en `registrar_verificacion_shadow_v4` (`F34_OPERACION_V4_NO_CONFIRMADA`). La verificación de diagnóstico busca el tipo `registrar_venta`, pero las operaciones del modo sin conexión se guardan como `registrar_venta_v4:f5_offline`.

Solo se pierde ese registro de diagnóstico: la venta queda bien guardada. Se corrige en el servidor quitando el sufijo `:f5_offline` al comparar. Queda pendiente, porque requiere una migración.
