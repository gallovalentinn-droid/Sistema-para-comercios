# MiComercio — REV80 (01/10/2026)

Base: paquete REV79, SHA-256 `ae33708713b8fdc76ade0e3bbf14bed227e6b5685c4fc1cba7267a4b80edfeb2`. Corrección de los cinco hallazgos de la revisión recibida. Conserva las funciones integradas de REV78 y REV79.

## Cambios verificados en código

| Hallazgo | Resultado en REV80 |
|---|---|
| H-01: talle de pañales descartado | P, M, G, XG y XXG identifican presentaciones distintas. Otro talle o uno sin confirmar no se elige automáticamente, tampoco por la descripción de IA. Incluye PAÑ abreviado y MX8U pegado al paquete. |
| H-02: SALDO A FAVOR tratado como deuda | Saldo a favor, crédito y nota de crédito quedan como ajustes cuyo signo debe revisar la persona. Se conserva el total impreso y se muestra la advertencia; no se resta como deuda ni se modifica el costo del producto. |
| H-03: comparación lenta con historial grande | Agrupa los movimientos por producto una vez por consulta. La búsqueda entre turnos espera 180 ms y reúne pulsaciones. Mantiene los cortes globales, turnos simultáneos, llegadas tardías, faltantes, decimales y detalle original. |
| H-04: capturas en la raíz | Las 15 capturas anteriores se movieron a `entregables/capturas-historicas/`. Las nuevas pruebas guardan sus capturas dentro de sus carpetas. La raíz del paquete queda sin PNG. |
| H-05: deuda contada como sin elegir | Las filas financieras omitidas no incrementan ese contador ni generan el aviso rojo. Los productos pendientes sí cuentan; las elecciones manuales siguen cargándose. |

La protección de talles se aplica al contexto de pañales, identificable por el impreso o el catálogo. No convierte los códigos MX20/GX20 de otros productos en embalaje; las unidades de peso siguen conciliándose como antes. Una elección humana guardada en la memoria conserva su comportamiento existente.

Identidad del HTML, caché del service worker, manifiesto y seis pruebas de identidad alineados en REV80. No cambian Edge Functions, SQL, migraciones ni permisos del servidor respecto de REV79.

## Verificación local

- **414/414 pruebas en Windows**, cero fallos: 27 nuevas (8 de talles, 10 financieras y 9 de rendimiento/búsqueda), además de las 387 anteriores. Se reprodujeron fallos antes de corregirlos.
- **25/25 archivos de integridad**, sin secretos privados detectados por el verificador.
- Navegador local: talles con tres contradicciones y tres controles; 12 escenarios financieros a 1366/390 px; configuración de Compras, empleado sin historial y WhatsApp del cierre, stock por turnos, lector REV77 en 14 pasos, nueve escenarios financieros y tres identidades REV78, Resumen REV76 y regreso a la foto REV54 sin duplicar unidades.
- Se adaptaron dos esperas del recorrido de stock para esperar el resultado visible de la búsqueda diferida. El primer intento del arnés antiguo esperaba actualización inmediata y falló por esa espera; el recorrido actualizado pasa.
- Catálogo autorizado disponible localmente: **721 productos**, sin incluir su exportación en la entrega. Conserva 47/50 y 41/45 automáticos correctos, cero incorrectos; Mi Barrio 3/8 automáticos y otros 5 con la opción correcta; 23/23 contraejemplos anteriores sin elección errónea. **6.298 mutaciones**, cero fallos según el oráculo del generador, con y sin descripción.
- Revisión independiente: sin bloqueos pendientes del cambio integrado. La comparación de stock conserva el resultado en el benchmark completo, las combinaciones de prueba y 200 fixtures adicionales comprobadas por el revisor.

Con datos sintéticos de 850 productos, 120 turnos disponibles y 100.000 movimientos, el dibujo inicial síncrono en Chrome pasó de una mediana de **8.234 ms a 122 ms**; incluyendo layout, de **8.480 ms a 323 ms**. Una ráfaga de 11 entradas produce un solo repintado, con resultado en 294 ms. Son mediciones de este equipo en un arnés local; el informe y el JSON detallan las condiciones.

Pruebas y benchmark de stock funcionan desde el paquete extraído sin requerir otra carpeta REV79. El comparador de referencia se reconstruye desde los fragmentos originales incluidos en el parche. Comprobación rápida: `node tests/stock-performance-rev80-benchmark.cjs --verify-sources`.

Evidencia y parches: `entregables/respuesta-revision-REV79/`. Escenarios nuevos y capturas sintéticas: `entregables/pruebas-navegador-REV80/`. Todas las pruebas: `node --test tests/*.test.cjs`. Integridad: `node tools/verificar-integridad.cjs`.

## Entorno público y pendientes

**No publicado ni verificado en la beta pública durante esta tarea. No se modificó Supabase.** Antes de publicar la integración, comparar el backend con el desplegado y validar la beta pública. La función con `pagosACuenta`, incorporada en REV78, debe acompañar el cliente si todavía no está desplegada.

Siguen pendientes Gemini real, nuevas facturas reales y dos dispositivos físicos. Los renglones negativos rechazados por el lector, el descuento global que incluye deuda y el acceso Ver en Caja sin ventas son problemas heredados fuera de esta corrección; no se declaran resueltos. Los turnos interrumpidos mantienen el alcance REV79: se comparan cuando ya se cargaron desde Caja.
