# MiComercio — corrección del turno abierto antes de REV40

**Entrega:** REV41, 24/09/2026. Complementa REV40 para que el reinicio en cero también alcance al turno que ya estaba abierto cuando se publicó la corrección.

## Causa y cambio

REV40 hacía que el turno siguiente a un cierre naciera con $0 en caja general y cigarrillos. Sin embargo, una caja abierta con la versión anterior conservaba en el dispositivo el fondo predeterminado que había heredado. En el comercio revisado, el fondo guardado en Configuración también había cambiado después de esa apertura, por lo que no bastaba compararlo con la configuración actual.

Al iniciar REV41, el cliente reconoce una reapertura automática anterior sólo cuando encuentra un cierre local de la misma caja y del mismo dispositivo, el turno empezó dentro del minuto posterior y sus fondos coinciden con el **fondo guardado en ese cierre**. En ese caso pone en cero los fondos del turno todavía abierto y guarda la corrección en el dispositivo. Respeta los fondos ingresados manualmente y los turnos sin un cierre anterior identificable. No modifica ventas, egresos ni cierres históricos en Supabase.

## Verificación

**En código:** la corrección se ejecuta al recuperar el estado local antes de presentar la aplicación y queda persistida. La identidad REV41 y el caché del service worker avanzan juntos.

**Localmente:** 151/151 pruebas aprobadas; las pruebas nuevas cubren la reapertura antigua, un cambio posterior de Configuración y la conservación de fondos manuales. El manifiesto de integridad verificó 14 archivos.

**En el entorno público:** `https://micomercio.ar/beta/` y su service worker responden con REV41. Descargados desde la URL pública, ambos archivos tienen exactamente el mismo SHA-256 que los archivos locales probados. No se pudo repetir un cierre autenticado en el dispositivo del comercio ni observar su estado local desde esta sesión.

**Acción en el comercio:** recargar la pestaña de la beta en el dispositivo que tiene el turno abierto. La corrección del fondo de ese turno se aplica al iniciar REV41; revisar en Caja que el fondo figure en $0 antes del próximo cierre. Las ventas del turno continúan en su lugar.
