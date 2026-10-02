# MiComercio — Comparar turnos REV81 (02/10/2026)

Base: REV80 publicada, commit 3c4be33. Diseño basado en el boceto aportado por el usuario y su aprobación: la cuenta completa debe verse sólo dentro del detalle.

## Presentación

- Cada producto muestra stock al abrir → al cerrar y su diferencia; no muestra la cuenta aritmética en el resumen.
- Los turnos elegidos se ordenan por fecha. Selectores y encabezados conservan fecha, horario, responsable y estado; los turnos abiertos son provisionales.
- Entre turnos presenta el neto de los movimientos realmente registrados en el intervalo, incluyendo ventas de otras cajas. El detalle conserva cada operación, incluso si se compensan y el neto es cero.
- Ver detalle expande la cuenta y el listado con fecha, tipo, cantidad y responsable. Puede abrirse tocando la fila o con el botón usando teclado. La cuenta incluye por separado las operaciones de otras cajas/sin turno durante el horario.
- Sólo con avisos permite encontrar stock negativo, datos no disponibles, operaciones externas, fechas fuera de horario y sincronización posterior. Conserva búsqueda por producto/código y filtro de rubro.
- En celular se muestran tarjetas, sin desplazamiento horizontal, con un botón explícito para abrir/cerrar el detalle.
- Las listas por producto y sin turno se generan al desplegarse, para mantener ligero el resumen.

## Exactitud

Se conserva el comparador de REV79/80 y su reconstrucción de stock global. El detalle usa los movimientos por fecha para explicar los saldos globales y mantiene identificados los movimientos propios fuera de horario. Una operación externa de neto cero sigue visible y genera aviso. Los turnos superpuestos no tienen un intervalo artificial. Los datos incompletos reconocidos siguen invalidando ambos saldos; sin base histórica o apertura aproximada no se inventa stock.

Se corrigió un hallazgo de la revisión independiente: sin nombre de actor, un movimiento remoto se mostraba como Este dispositivo por un fallback heredado. El nuevo detalle muestra Responsable no disponible. No se infiere el actor a partir del empleado que cerró la caja.

## Verificación

**En código:** HTML, service worker y manifiesto REV81; integridad correcta en 25 archivos. No cambian SQL, permisos del servidor, migraciones ni funciones de Supabase.

**Localmente:** 423/423 pruebas en Windows. Las nueve pruebas nuevas comprueban orden sin mutación, extremos del intervalo, ventas entre turnos, superposición, operaciones externas compensadas, cuenta por horario, faltantes de ventas, avisos, decimales y complejidad acotada. El recorrido de navegador verifica resumen contraído, expansión por fila/Enter/Espacio, carga diferida, selección cronológica, búsqueda, filtro, movimiento remoto sin actor, móvil, sólo lectura y restricción de empleado. Se observaron fallos antes de implementar la comparación y antes de corregir la atribución falsa del responsable.

Rendimiento sintético en Chromium: 850 productos, 120 turnos disponibles, dos comparados, 100.000 movimientos, una muestra. Dibujo síncrono de la nueva pantalla: 288,6 ms; once pulsaciones de búsqueda: 0,5 ms de manejadores y una actualización diferida. La referencia histórica REV79 tarda 7.718,7 ms en dibujar y 64.591,6 ms en los once manejadores. Estas cifras describen el arnés local, no el comercio real. Se conserva un baseline de UI REV80 para reconstruir la referencia histórica sin depender de otra carpeta de entrega.

**Entorno público:** estos cambios todavía no se publicaron ni se probaron en la beta pública. El navegador local usa datos sintéticos y bloquea el backend; no carga operaciones reales, envía WhatsApp ni consume Gemini. Continúan pendientes las pruebas reales con dispositivos físicos.

## Evidencia y reproducción

- `tests/beta-stock-ux-rev81.test.cjs`
- `tests/browser-stock-rev81.cjs` y `tests/browser-fixture/`
- `entregables/comparar-turnos-REV81/resumen-1366.png`
- `entregables/comparar-turnos-REV81/resumen-390.png`
- `entregables/comparar-turnos-REV81/detalle-1366.png`
- `entregables/comparar-turnos-REV81/detalle-390.png`
- `entregables/comparar-turnos-REV81/rendimiento.json`

Ejecutar la suite con `node --test tests/*.test.cjs`; el navegador con `node tests/browser-stock-rev81.cjs`. El recorrido usa Playwright y Chrome; PW y CHROME permiten indicar otros ejecutables/runtimes. `node tools/verificar-integridad.cjs` verifica el manifiesto. El benchmark permite BENCH_OUTPUT para guardar un informe nuevo sin reemplazar la evidencia histórica.
