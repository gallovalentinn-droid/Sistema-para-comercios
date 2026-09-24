# MiComercio — recuperación de datos visibles, REV42

**Fecha:** 24/09/2026. **Comercio revisado:** Kiosco de Ponce.

## Lo comprobado

La cuenta y el comercio permanecen activos. En Supabase hay 660 productos vigentes, 63 ventas, 1 cierre de caja y 2 clientes al momento de la revisión. El comercio opera exclusivamente con los registros V4; no existe una copia vigente en `datos_kiosco`. Las consultas observadas de la cuenta llegan al comercio correcto y avanzan con cursores de sincronización.

No hay evidencia de un borrado general en el servidor. No puedo leer la base local del navegador del comercio desde esta sesión. El mecanismo que explica una pantalla vacía con registros remotos presentes se reprodujo localmente: si las colecciones locales quedan vacías pero se conserva un cursor avanzado, el pull anterior sólo pide novedades y omite los registros históricos.

## Corrección

En el primer pull de cada cuenta y comercio, REV42 detecta una colección local vacía con cursor avanzado y comprueba si el servidor todavía tiene registros. Si los tiene, vuelve los cursores al inicio y reconstruye la copia local mediante el pull V4 normal. Conserva los datos y operaciones pendientes del dispositivo. Durante esa reconstrucción incorpora también ventas y egresos confirmados del mismo dispositivo que falten localmente; los identificadores evitan duplicarlos. La marca de recuperación se mantiene si el proceso se interrumpe y se quita al completarse.

La corrección no borra ni modifica productos, ventas, cierres o clientes en Supabase. REV41 sigue fijando en $0 el fondo heredado de una reapertura automática después de un cierre.

## Verificación

- **Código:** identidad de build y caché actualizados juntos a REV42.
- **Local:** las pruebas reproducen el cursor avanzado con catálogo local vacío y la recuperación de una venta y un egreso propios sin duplicación. Batería completa: 156/156; integridad: 14 archivos.
- **Entorno público:** `https://micomercio.ar/beta/` y `beta/sw.js` sirven archivos idénticos a los de REV42 (SHA-256 comprobado). La página abre la pantalla de ingreso sin errores de consola en una sesión sin autenticar. Falta observar la recuperación autenticada en el dispositivo afectado; esta sesión no tiene acceso a su almacenamiento local.

Para aplicar REV42 en un dispositivo con la pestaña abierta hay que recargar la beta y esperar a que termine la recuperación. No borrar datos del navegador ni cerrar caja mientras la pantalla permanezca vacía.
