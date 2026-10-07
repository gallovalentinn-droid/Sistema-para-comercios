# REV88 — confirmación consistente de Caja

La apertura conserva cualquier turno que ya esté abierto al confirmar. El cierre prepara la operación antes de agregar el registro al historial; una excepción de autoridad o preparación deja el turno abierto y permite reintentar. Al pulsar y confirmar se valida el mismo segmento y el mismo arqueo: movimientos, fondos y modelo de caja. Una pantalla vieja exige revisar de nuevo en lugar de cerrar otro turno, usar importes desactualizados o duplicar el cierre.

## Verificado en código

Cambio acotado a la web; sin migración ni modificación de registros operativos en Supabase. HTML/manifiesto REV88 edición 2026-10-07, caché rev88. Una revisión independiente detectó un cambio de modelo no cubierto por la huella; reproducido con prueba que fallaba y corregido incluyendo el modelo efectivo. Las pruebas específicas ejecutan los handlers reales de la aplicación.

## Verificado localmente

521/521 pruebas completas e integridad de 33 archivos. Ocho regresiones nuevas: preparación fallida, operación ausente, confirmación de otro turno, movimientos recibidos durante confirmación, cambio de modelo, doble confirmación, cierre estable y apertura demorada sobre turno recuperado. Seis escenarios en navegador a 1366/390, con tres turnos consecutivos y operaciones persistidas en IndexedDB, referencias y arqueos conservados. Datos sintéticos, Supabase simulado y red externa bloqueada.

## Entorno público

Fuente publicada en main: 9fa4f33923841754f20ab5115cfc2d25086f205f. Pages 37566462632 completó con success. HTML, service worker y manifiesto públicos HTTP 200 e idénticos por SHA-256 a la fuente. Los seis escenarios de Caja y las tres operaciones de cierre persistidas pasaron en el navegador sobre la beta pública a 1366/390. Supabase simulado, datos sintéticos y escrituras externas bloqueadas; no se crearon cierres ni movimientos en el comercio real.

## Límites

Los fallos anteriores están reproducidos y corregidos. La investigación de un cierre histórico acumulado confirma el registro y sus movimientos, pero no conserva el error local exacto ni los arqueos intermedios para probar cuál fue el desencadenante o separar importes físicos entre turnos. No se alteraron ventas, conteos, retiros ni fondos históricos. La evidencia de ese comercio se conserva sólo en un informe privado excluido de Git; la conciliación requiere datos reales de sus turnos. Las pruebas públicas simuladas tampoco reemplazan un cierre real desde el dispositivo afectado.
