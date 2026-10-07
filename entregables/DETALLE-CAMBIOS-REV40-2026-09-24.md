# MiComercio — Caja en cero después de un cierre

**Entrega:** REV40, 24/09/2026. Incluye el sistema completo y las correcciones acumuladas de REV38 y REV39.

## Problema comprobado

Al cerrar una caja, el cierre conservaba correctamente sus ventas y su arqueo. Sin embargo, la apertura siguiente volvía a tomar los fondos predeterminados guardados en Configuración. Eso podía mostrar un saldo inicial anterior en **Debería haber**, aunque el turno nuevo aún no tuviera ventas.

En el comercio revisado, el cierre de las 15:26 del 24/09 guardó los importes esperados de $37.100 en caja general y $94.800 en cigarrillos. Después hubo otro tramo de ventas; no se alteraron esos registros ni el cierre histórico.

## Cambio

- Al confirmar un cierre, el dispositivo guarda que la próxima apertura de **esa misma caja** debe empezar con $0 en general y $0 en cigarrillos.
- La marca sobrevive a una recarga y se consume al crear el siguiente turno. También rige para la reapertura automática al terminar un cierre.
- La apertura manual posterior al cierre muestra ambos fondos en $0. El operador puede escribir un fondo distinto si realmente deja efectivo para el nuevo turno.
- Los fondos predeterminados siguen disponibles para aperturas iniciales; cerrar otra caja no los borra ni traslada su reinicio a una caja diferente.
- El cierre guardado, sus conteos, las ventas anteriores y los egresos anteriores permanecen asociados al turno original.
- El texto de Caja explica que el nuevo turno comienza en cero.

## Verificación

**Verificado en código:** el inicio del turno tomaba `fondoCaja` y `fondoCajaCigarros` de Configuración después de cerrar. La separación de movimientos por segmento ya existía y se mantuvo.

**Verificado localmente:** la nueva prueba reprodujo el fallo antes del cambio (fondos de $5.000 y $95.000 en lugar de cero). Tras la corrección, verificó la recarga entre cierre y apertura, la conservación del cierre y que otra caja no herede el reinicio. La apertura manual ofrece cero en ambas cajas. Pasaron 149/149 pruebas y el verificador de integridad comprobó los 14 archivos del manifiesto.

**Entorno público:** al preparar esta entrega, `https://micomercio.ar/beta/` seguía en REV37. Las dos migraciones de REV38 se aplicaron y se verificaron en Supabase antes de publicar. La nueva lógica de Caja se comprobará contra el archivo público REV40 después del despliegue; el recorrido autenticado con un cierre real queda pendiente. El turno que ya estaba abierto antes de instalar esta versión conserva el fondo con que fue creado; el reinicio en cero se aplica después de su próximo cierre. No se modificaron importes de producción.

## Para aplicar

Publicar REV40, renovar la caché de la beta y verificar con una caja de prueba: cerrar un turno con fondos y ventas, recargar antes de abrir el siguiente, abrirlo y confirmar que **Fondo inicial** y **Debería haber** sean $0 antes de registrar ventas.
