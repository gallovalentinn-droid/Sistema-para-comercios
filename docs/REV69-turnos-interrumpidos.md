# REV69 — turnos interrumpidos sin arqueo

## Objetivo

Mostrar las ventas de turnos que se perdieron al recargar la aplicación sin crear un cierre ni inventar dinero contado. Explicar por separado el efectivo de esos turnos que se incorporó a un cierre posterior. El cierre original conserva sus importes y su traspaso.

## Modelo

- Un segmento de caja puede terminar como `interrumpido_sin_arqueo`, con fecha, motivo y constancia de quién registró la interrupción. No recibe `closed_at_device` ni una fila en `cierres_caja`.
- Las operaciones de ese segmento permanecen vinculadas al segmento. Una operación tardía ocurrida antes de la interrupción puede sincronizarse; una operación posterior debe rechazarse.
- Un ajuste de tipo `efectivo_arrastrado_turno_interrumpido` referencia un único segmento de origen y un cierre real del mismo comercio. Una restricción única impide registrar dos ajustes para el mismo segmento.
- Solo los ajustes confirmados modifican la **explicación** del esperado y la diferencia en la pantalla. No cambian el cierre, su conteo, retiros, dinero dejado para la próxima apertura ni la función que consulta el último traspaso.
- El historial intercala cierres e interrupciones por fecha. En una interrupción muestra ventas y `Sin arqueo`, nunca un contado o diferencia ficticia.
- El estado de revisión de un cierre no se borra por resolver un ajuste de arrastre. La diferencia residual continúa visible.

## Reparación de casos existentes

La migración estructural no modifica datos de ningún comercio. Cada reparación se ejecuta por separado, con verificaciones de ventas, cobros, egresos, apertura y cierre real antes de escribir. Una reparación puede registrar un ajuste confirmado cuando se conoce el efectivo efectivamente trasladado. Cuando no se conoce, registra solo la interrupción y deja la conciliación monetaria pendiente.

## Verificación

Pruebas de cálculo y estado de revisión, historial sin arqueo, restricción de unicidad, aislamiento por comercio, sincronización de operaciones anteriores a la interrupción y rechazo de posteriores. Ejecutar toda la batería local y comprobar la beta pública después de desplegar.
