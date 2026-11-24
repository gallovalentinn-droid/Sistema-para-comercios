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

## Integración efectiva en Docker — 23/11/2026, r14

Se detectó que la dirección 55383 seguía sirviendo candidato/ (r13), mientras que las cinco mejoras aprobadas estaban solo en el commit local da9b873 del worktree ux-presentaciones-cobro. Recuperar el servidor no había integrado ese commit.

Se aplicó únicamente el parche de interfaz y sus regresiones a candidato/, sin sustituir los cambios anteriores del lector ni sus extractores. Incluye venta directa de presentaciones, columnas reordenadas, detalle separado con presentaciones, retiro de ganancia de Caja y opción QR inmediata. Edición local combinada: 2026-11-23-peso-presentaciones-cobro-r14; caché rev107-r14; integridad 48 archivos. Copia previa de archivos conservada en el directorio local de visualizaciones docker-antes-presentaciones-2026-11-23.

Verificado contra http://127.0.0.1:55383/beta/: HTTP200, edición r14, backend público sustituido por el laboratorio, dos recorridos del cambio nuevo en 1366/390 con pagos simulados. Tres pruebas HTTP del servidor aprobadas. Diez ejemplos multiproducto del lector y recorridos autenticados Docker en ambos anchos aprobados, incluida foto interceptada sin enviarla a IA. Batería del candidato combinado: 754/754 con MP_SQL_TEST=true y PESO_SQL_TEST=true, cero omitidas. La pestaña del usuario se recargó y mostró Producto, Stock, Código, Rubro, Costo, Venta y Margen al desplegar todas las columnas.

Sin publicación, push, migración, cambios de secretos ni operaciones de negocio reales. Contador conservado: 2 de 3 lecturas usadas, una restante. El servidor lee candidato/ en cada pedido; no necesita un reinicio para estos cambios.
## Corrección de selección general y detalle — 23/11/2026, r15

La comprobación anterior cubría elegir la fila de una presentación, pero seleccionarProducto todavía mandaba todos los productos kg a pedirPeso. El caso del usuario sí tenía presentación: helado a $9.000/kg, medio kilo a $7.000 y envase $100. No era una ficha sin configurar. Corregida la selección general y por EAN: con un tamaño se agrega directamente; con varios se elige presentación sin preguntar gramos; el buscador normal lista tamaños y peso libre se pide explícitamente. Sin tamaños se conserva el diálogo de gramos.

El orden pedido ahora es Producto, Rubro, Código, Stock, Costo, Venta, Margen. Ver detalles muestra una fila por presentación con nombre, peso, venta, envase y margen sobre venta. Se incluye el costo proporcional por kg más el envase. Costo 0 se interpreta como pendiente, según el catálogo persistido, y muestra Sin costo.

La revisión única encontró costo vacío convertido en margen y foco del lector activo detrás del selector. Ambos se reprodujeron y corrigieron con regresiones. El selector toma foco neutro y lo devuelve a la búsqueda al elegir o cancelar; un segundo escaneo no agrega productos por detrás. No hubo segunda revisión independiente.

Verificado: 757/757 pruebas del candidato Docker con SQL local y cero omitidas. Diez recorridos de navegador finales: cuatro del flujo nuevo (1366/390, claro/oscuro), catálogo y Caja en ambos anchos y lector autenticado en ambos anchos. Diez ejemplos de lector multiproducto simulados; contador conservado en 2/3. Capturas inspeccionadas. Integridad48 correcta en worktree y candidato. Caso exacto de Docker comprobado en una ventana efímera: helado medio, 0,5 kg, $7.000, sin pregunta de gramos ni venta guardada; no se modificó stock.

Fuente local worktree: 2026-11-23-presentaciones-cobro-local-r4 (rev109-r4). Fuente servida en http://127.0.0.1:55383/beta/: 2026-11-23-peso-presentaciones-cobro-r15 (rev107-r15, base propia del laboratorio). La página abierta antes del cambio necesita recarga. Sin publicación, push, migraciones, secretos nuevos ni llamadas pagas.