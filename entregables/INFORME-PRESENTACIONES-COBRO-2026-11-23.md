# Presentaciones, catálogo, Caja y acceso al QR

Preparación local del 23/11/2026. Base d4a4d8429e1d0ba8205a02e56a615e6a4080d295, rama codex/ux-presentaciones-cobro. Diseño aprobado por el usuario. No publicado.

## Resultado

- La búsqueda de Vender ofrece primero los tamaños configurados, con su nombre y precio. Elegir uno agrega una presentación directamente al ticket, con el mismo stock compartido en kg y el costo de envase existentes. No se crean productos duplicados. Peso libre queda al final del grupo; se reserva un lugar al truncar y se puede buscar expresamente por «peso libre». El límite de resultados y la detección de ambigüedad al presionar Enter se mantienen.
- Productos ordena: Producto, Stock, Código, Rubro, Costo, Venta, Margen, Acciones. El detalle muestra todas las presentaciones, con peso y precio, incluidas las antiguas sin nombre explícito. El detalle ocupa una fila aparte para no desplazar los valores y acciones de la fila principal. En móvil se comprobó que el detalle cerrado siga oculto.
- Caja deja de mostrar Ganancia estimada. Se conservan el cálculo y la presentación del resultado en Resumen.
- El botón QR se ve al seleccionar Transferencia/QR, mientras se consultan cuentas. Seleccionarlo no crea un cobro; Mostrar QR sigue bloqueado hasta conocer cuenta y capacidad. Si falla la consulta, QR queda deshabilitado y se informa el error. Una capacidad explícitamente pausada conserva el bloqueo existente. No se generan QR automáticamente.

## Verificación en código y local

- Regresiones observadas fallando antes de corregir búsqueda, columnas, detalle expandido, ganancia en Caja, QR demorado, límite de ocho tamaños y QR habilitado sin efecto tras error.
- Suite final: `MP_SQL_TEST=true PESO_SQL_TEST=true node --test --test-concurrency=1 tests/*.test.cjs`: **730/730, cero fallas y cero omisiones**. SQL contra bases de pruebas locales de Docker; no producción.
- Navegador: **20 recorridos aprobados**. Nueve scripts en 1366 y 390: presentaciones/catálogo, selector MP, capacidades, transferencias automáticas, cierre del panel MP, recuperación MP, atención del catálogo, Caja consistente y Resumen. Dos recorridos adicionales del cambio nuevo en tema claro. El flujo nuevo se comprobó en claro y oscuro, con respuestas de cuentas demoradas, fallidas y pausadas y creación única al doble clic.
- Capturas inspeccionadas en `entregables/ux-presentaciones-capturas/`. Solo datos ficticios. Logs finales: `ux-presentaciones-node-revision.log`, `ux-presentaciones-browser-final-1366.log`, `ux-presentaciones-browser-final-390.log`.
- `node tools/verificar-integridad.cjs`: **48 archivos correctos**, sin secretos privados detectados. `git diff --check` correcto.
- Identidad local: revisión 109, edición `2026-11-23-presentaciones-cobro-local-r3`; caché `micomercio-beta-6.0.0-f6-rc2-rev109-r3`. Manifiesto alineado.

## Revisión independiente y decisiones

Un revisor independiente encontró peso libre inaccesible con ocho tamaños y dos problemas de UX: detalle que desalineaba la fila y QR habilitado sin efecto al fallar cuentas. Los tres quedaron corregidos con regresiones RED/GREEN y suite completa verde; no se realizó una segunda revisión independiente.

Decisiones: conservar una edición local de REV109 hasta decidir publicación; reservar un lugar visible para peso libre; mostrar detalle en fila separada; indicar indisponibilidad del QR en caso de error. Las dos observaciones visuales se trataron como importantes para esta entrega porque afectan directamente la claridad y respuesta de los controles solicitados. No quedaron observaciones menores diferidas de esta revisión.

Los primeros intentos de verificación detectaron expectativas viejas sobre ganancia en Caja y un sufijo de caché incompatible con la convención del repo: se corrigieron y se repitió la suite completa. Una batería de navegador necesitó declarar la ruta local de Playwright; los 20 recorridos finales corrieron con esa dependencia explícita. No se omitieron esos fallos del resultado final.

## Entorno público y límites

No hubo push, despliegue, migraciones ni cambios de secretos. No se hicieron ventas, cierres o cobros reales ni llamadas pagas de IA. Se inició Docker Desktop para las pruebas locales conservando sus contenedores; las pruebas usan catálogos y proveedores de pago simulados.

La aprobación y prueba corresponden a la preparación local. No se ha repetido este cambio en la beta pública porque todavía no se publica. Antes de publicar habrá que cotejar el main actual, integrar cambios posteriores si los hubiera, fijar la identidad definitiva y repetir los recorridos sobre los archivos públicos con pagos simulados.
