# MiComercio.ar — contexto de continuidad

Actualizado: 2026-10-02 (America/Argentina/Buenos_Aires)

## Diagnóstico del lector IA — 02/10/2026

El usuario informa rechazos frecuentes y pide revisar posibles causas. Investigación sólo lectura: leer-factura sigue ACTIVE v19/JWT y sus tres archivos coinciden exactamente con supabase/functions/. En la ventana 01/10 18:51:17 UTC a 02/10 18:51:17 UTC, logs de ejecución muestran 24 errores Google 503 UNAVAILABLE y 38 Google 429 UNKNOWN; no se observaron errores de procesamiento/telemetría en ese conjunto. La fuente HTTP presenta 37 respuestas 429, 23 respuestas 503 y 5 respuestas 200; no coincide fila a fila con ejecución y no se usa para sumar solicitudes. Comercio principal: 66 reservas de octubre, 5 resultados, límite 100 y 34 restantes al consultar. Otro comercio: 2/1/100/98. El 429 es del proveedor; el cupo mensual de la aplicación no está agotado.

En código: mensajes genéricos ocultan IA_NO_DISPONIBLE/IA_AGOTADA_TEMPORALMENTE; sin reintentos acotados; reserva previa consume cupo aun con fallo; clasificación no distingue códigos actuales de límite por minuto y cuota diaria. Localmente: 27/27 pruebas focales y reproducciones sintéticas de rechazo completo por una fila inválida (negativa, bulto cero, números como texto, campo faltante o descuento global excesivo). Esta validación es un posible fallo adicional, no la causa observada en los registros recientes.

Informe: `entregables/INFORME-DIAGNOSTICO-LECTOR-2026-10-02.md`; reproducción sin red: `entregables/diagnostico-lector-2026-10-02/reproducir-validacion.cjs`. No se cambió ni desplegó el lector ni el cupo, no se invocó Gemini para el diagnóstico. Se preserva REV81 local. Para una corrección posterior, priorizar mensajes/diagnóstico y recuperación transitoria con una reserva por acción; revisar aparte cupo de fallos y filas inválidas. Un modelo alternativo exige también adaptar el contrato de telemetría que hoy acepta sólo gemini-3.8-flash.

## Comparar turnos — REV81 local, 02/10/2026

El usuario pidió acercar la sección al boceto `boceto-comparar-turnos.html` y aprobó el diseño, con la cuenta completa únicamente dentro del detalle. Se modificó la copia canónica local sobre el commit 3c4be33: resumen al abrir → al cerrar con delta, orden cronológico automático, movimientos entre turnos, filtro sólo con avisos, detalles por producto desplegables con teclado y tarjetas móviles. Se conservan búsqueda/rubro, autoridad de dueño/administrador y vista por período de empleados.

El cálculo REV79/80 no se altera. La cuenta del detalle usa movimientos dentro del horario y separa otras cajas/sin turno; los movimientos propios fuera de horario conservan su atribución y se identifican sin sumarlos a esa cuenta. Los turnos superpuestos no inventan un intervalo. Los datos incompletos/stock sin base/aperturas aproximadas continúan sin presentar saldos falsos. Cuando falta el actor, se muestra Responsable no disponible, incluso para operaciones remotas.

Verificado en código: identidad HTML, service worker y manifiesto REV81, 25 archivos de integridad. Verificado localmente: 423/423 pruebas Windows, navegador sintético sin backend a 1366/390 px (resumen contraído, apertura por fila/teclado, filtro, búsqueda, responsable remoto, datos intactos y empleado); revisión independiente con su único hallazgo corregido. Benchmark local con 850 productos, 120 turnos disponibles y 100.000 movimientos: dibujo síncrono 288,6 ms, 11 pulsaciones 0,5 ms y una actualización diferida; una muestra, no medición de producción.

Evidencia: `entregables/comparar-turnos-REV81/`, informe `entregables/DETALLE-CAMBIOS-REV81-2026-10-02.md`, recorrido `tests/browser-stock-rev81.cjs`. Cambios aún sin publicar; no se modificó Supabase ni se repitió este diseño en la beta pública. La publicación REV80 siguiente permanece como registro de lo efectivamente publicado. Las pruebas con dispositivos físicos y operaciones reales siguen pendientes.

## Publicación REV80 verificada — 01/10/2026

El usuario aprobó la revisión de REV80 y pidió comprobar y republicar. Se integró la copia aprobada en main local conservando el ZIP c0f089e6550e0624abc89e728208c5e5e44764656f217e6c53d5f65889a8cecf. Las tres observaciones menores quedan para otra revisión: talle omitido con varias opciones, XXXG/marcas sin palabra pañal y productos cuyo nombre contiene crédito.

Verificado en código/localmente: 414/414 pruebas en la copia canónica integrada y 25 archivos de integridad. REV71 ya está aplicada y se verificaron tabla, restricciones, trigger, RLS y políticas de permiso/licencia; no se reaplicó. Se creó private.rev80_predeploy_snapshot: 28 tablas operativas y 16.078 filas, sin Auth ni configuración, RLS y sin lectura anon/authenticated. El lector pasó de versión 18 a 19, JWT activo; sus tres archivos coinciden con supabase/functions/. Antes de publicar la web, la beta pública seguía en REV75 y origin/main estaba en fbace229ab092a727f3824e113c42b5cd7ea2a5e.

Publicación web confirmada: commit 175b82ec7a5deebc6371fd464f18eef36c3ee0d4 enviado a main y GitHub Pages exitoso (run 36878998137). La beta pública declara REV80 y sus hashes de HTML y service worker coinciden con el manifiesto. Navegador público nuevo sin sesión a 1366/390 px: revisión de talles y saldo a favor con datos sintéticos, cálculos de stock y cigarrillos, cero errores de página. No se confirmaron facturas ni se crearon operaciones reales. OPTIONS del lector responde 204 y POST sin sesión 401. Informe: entregables/INFORME-PUBLICACION-REV80-2026-10-01.md. Gemini con facturas reales, los flujos autenticados en dispositivos físicos y los problemas heredados mencionados abajo siguen pendientes. Las entradas de preparación local inferiores quedan como registro histórico.

## Continuidad local REV80 — 01/10/2026

Se contrastó la revisión pegada de REV79 y se corrigieron H-01 a H-05 en una nueva copia aislada. El lector distingue talles de pañales, incluyendo PAÑ y MX8U; el contexto puede provenir del catálogo y la IA no puede borrar una contradicción. La separación de MX8U se limita a pañales para conservar los códigos MX20/GX20 de otros productos. Saldo a favor y crédito requieren revisar el signo y conservan el total impreso. Las filas financieras omitidas no cuentan como sin elegir. Stock agrupa el historial por producto una vez y difiere la búsqueda entre turnos 180 ms; los resultados conservan la semántica REV79. Las 15 capturas de raíz se movieron bajo entregables.

Entrega: `entregables/MiComercio-Sistema-Completo-REV80-2026-10-01.zip`, SHA-256 `c0f089e6550e0624abc89e728208c5e5e44764656f217e6c53d5f65889a8cecf`, 7.752.375 bytes y 280 archivos verificados uno a uno contra la copia probada. Fuente aislada: `entregables/preparacion-REV80-2026-10-01/`. Detalle: `entregables/DETALLE-CAMBIOS-REV80-2026-10-01.md`; evidencia dentro del paquete en `entregables/respuesta-revision-REV79/`.

Verificado en código y localmente: 414/414 pruebas en Windows, también después de extraer el ZIP en una carpeta nueva; 25 archivos de integridad; pruebas de stock autónomas sin carpeta REV79. Recorridos de navegador REV80/79/78/77/76/54 aprobados; revisión independiente sin bloqueantes del diff. Catálogo local autorizado de 721 productos: 47/50 y 41/45 automáticos correctos, cero incorrectos; Mi Barrio 3/8 automáticos y cinco opciones correctas; 23 contraejemplos y 6.298 mutaciones sin errores según el oráculo. El catálogo privado no se incluyó. Benchmark sintético de 100.000 movimientos: dibujo síncrono mediano de 8.234 a 122 ms y con layout de 8.480 a 323 ms; medición de arnés local, no de producción.

No publicado ni reemplazado el HTML canónico; no se modificó Supabase y no se verificó de nuevo la beta pública. Del manifiesto sólo cambian beta/index.html y beta/sw.js respecto de REV79. Sigue pendiente comparar el backend realmente desplegado antes de publicar, Gemini real, nuevas facturas y dos dispositivos físicos. Permanecen fuera de alcance los renglones negativos, el descuento global sobre deuda y Ver en Caja sin ventas; conserva la limitación REV79 de turnos interrumpidos cargados previamente desde Caja.

## Continuidad local REV79 — 01/10/2026

El usuario solicitó completar empleados, WhatsApp y stock por turnos sobre el lector corregido. Se preparó una entrega integrada local en `entregables/preparacion-REV79-2026-10-01/` y `entregables/MiComercio-Sistema-Completo-REV79-2026-10-01.zip`, SHA-256 `ae33708713b8fdc76ade0e3bbf14bed227e6b5685c4fc1cba7267a4b80edfeb2`. Detalle: `entregables/DETALLE-CAMBIOS-REV79-2026-10-01.md`.

Incluye las correcciones REV78, Compras visible en configuración de empleados con la vinculación existente entre cargar facturas y Productos explicada, historial de cierres y resumen de diferencias sólo para dueños/administradores, envío del propio cierre recién hecho por empleados, cuatro importes de cigarrillos por pago y comparación de stock de dos segmentos de turno. No se creó un permiso independiente de Compras: se conserva la autoridad actual del servidor. Históricos sin pagos completos o aproximados muestran desglose no disponible; faltantes reconocidos de un turno invalidan el stock global reconstruido de ambos comparados.

Verificado en código y localmente: 387/387 pruebas, revisión independiente sin bloqueos críticos/importantes, navegador de empleado con cierre real local y enlace WhatsApp interceptado a 1366/390 px, configuración/stock y regresiones REV77/78/76/54. Integridad de 25 archivos y ZIP de 240 archivos idénticos a la copia probada. Se confirmó únicamente mediante lectura de metadatos que existe opened_at_device en caja_sesion_segmentos; no se modificó Supabase.

No publicado ni reemplazado el HTML canónico; la comprobación pública de estos cambios y el piloto real siguen pendientes. También siguen los dos fallos heredados de descuento global sobre deuda y Ver en Caja sin ventas. Los turnos interrumpidos se comparan si ya se cargaron desde Caja. La entrada anterior de REV78 que decía que estos cambios estaban pendientes queda como registro histórico, reemplazada por esta entrega local. Antes de publicar, comparar backend contra lo realmente desplegado y repetir la validación pública.

## Continuidad REV75 — 30/09/2026

El usuario autorizó publicar REV75 para comenzar a cargar facturas reales. Se integra el paquete `MiComercio-Sistema-Completo-REV75-2026-09-30.zip` sobre `b20988e` (REV69). La beta y su caché declaran REV75; la revisión local dio 333/333 pruebas y 25/25 archivos de integridad. El detalle está en `entregables/DETALLE-CAMBIOS-REV75-2026-09-30.md`.

Supabase: se creó el respaldo operativo interno `private.rev75_predeploy_snapshot` (27 tablas operativas, sin Auth ni configuración), se aplicó `REV71-ALIAS-FACTURA.sql` y se desplegó `leer-factura` v18 con JWT habilitado. Los tres archivos desplegados coinciden con `supabase/functions/`. La memoria tiene RLS, dos políticas, sin lectura anónima ni TRUNCATE para usuarios. No se ejecutó la suite SQL aislada sobre producción.

Publicación web confirmada: commit `deece9b` en `main`, GitHub Pages exitoso y lectura pública sin caché de `https://micomercio.ar/beta/` con `packageRevision:75` y caché `micomercio-beta-6.0.0-f6-rc2-rev75`. Los hashes públicos del HTML y del service worker coinciden exactamente con el manifiesto. El navegador público abre el acceso y carga el emparejador REV75. El lector responde OPTIONS 204 desde el dominio autorizado y rechaza POST sin sesión con 401. No se consumió IA ni se cargaron operaciones reales durante la publicación.

Siguen pendientes las pruebas con facturas reales, Gemini y dos dispositivos físicos. El recorrido local del lector utiliza IA y nube simuladas; el navegador de comprobación pública no tenía sesión iniciada, por lo que el flujo protegido completo queda para el piloto. Los apartados siguientes conservan el contexto histórico de REV18 y no describen el estado actual de la beta.

Este documento permite continuar el proyecto desde un chat nuevo sin depender del historial completo de conversaciones anteriores. Describe el estado observado del repositorio y las decisiones de producto importantes. No reemplaza las pruebas ni la verificación del entorno desplegado.

## 1. Objetivo actual

MiComercio.ar es un sistema web para la operación cotidiana de comercios pequeños. El objetivo inmediato es estabilizar una beta pública con todas las funciones del sistema, probarla en uno o más comercios reales y, si el piloto no presenta fallas críticas, preparar su comercialización.

La decisión histórica de implementación fue:

1. terminar primero las funciones funcionales solicitadas;
2. desarrollar F5 (identidad, permisos, autoridad y operación offline);
3. desarrollar F6 (alta, onboarding, licencias, soporte y piloto);
4. integrar y migrar el conjunto de una sola vez, evitando migraciones repetidas del mismo comercio.

F5 y F6 ya tienen implementación técnica y la beta pública está en etapa de estabilización. No declarar el sistema “listo para comercializar” únicamente porque compile o porque la página abra: falta completar y registrar el piloto real.

## 2. Repositorio, publicación y servicios

- Repositorio canónico: `https://github.com/gallovalentinn-droid/Sistema-para-comercios`
- Rama de publicación: `main`
- Dominio: `https://micomercio.ar`
- Beta pública: `https://micomercio.ar/beta/`
- Proyecto Supabase usado por la beta: referencia pública `qrvdfqpxutymmlcplsal`
- Backend Supabase: Auth, Postgres/RLS, Storage y Edge Functions.
- Lector de facturas: Google Gemini llamado únicamente desde la Edge Function `leer-factura`; la clave nunca debe incorporarse al HTML ni al repositorio.

No crear otro repositorio ni cambiar el dominio sin autorización expresa. La visibilidad pública/privada actual del repositorio debe verificarse en GitHub antes de afirmar cuál es.

## 3. Estado exacto del código al redactar este documento

**REV18 publicada (2026-09-16):** el usuario aprobó expresamente la publicación. Commit `d909d34` enviado a `main`; lectura pública sin caché confirmó `packageRevision:18` y caché `micomercio-beta-6.0.0-f6-rc2-rev18`. La interfaz del dueño quedó bloqueada por PIN al retomar la comprobación pública; se solicitó desbloqueo al usuario. No declarar todavía completado el retest visual público de las secciones protegidas.

Cambios publicados: ancho de página contenido; tablas desplazables de Productos, Para pedir y Caja (cierres, ventas y egresos); nombres de producto con ancho legible; lista de productos con encabezado fijo; Caja apilada en ventanas angostas; cuerpo de los formularios desplazable con botones visibles; indicadores flotantes debajo de los formularios. Verificado en código y localmente: 40/40 pruebas (repetidas el 2026-09-16) y escenarios de navegador con datos sintéticos en 1366×650, 1280×600 y 1024×600; menú contraído a 1024×600; formulario a 1024×520; tarjetas móviles a 390×740. La caja abierta se probó localmente con una venta fiada y un nombre de cliente largo. Falta completar la comprobación visual pública después del desbloqueo. Fixture reproducible: `node tests/notebook-preview.cjs`.

- `main` local y `origin/main`: commit `d909d34` (`fix: contain notebook layouts and keep modal actions visible`).
- Artefacto de la beta: F6 RC2, `packageRevision: 18`.
- Identidad declarada en el HTML: `6.0.0-f6-rc2`.
- Base F5 declarada: `5.0.0-f5-rc2`.
- Contrato de proyección: `f5-projection-v1`.
- Contrato de configuración: `10-canonical+6-legacy-only`.
- Contrato de licencia: `f6-license-v1`.
- Caché publicado por `beta/sw.js`: `micomercio-beta-6.0.0-f6-rc2-rev18`.
- Batería local del repositorio: 40/40 pruebas aprobadas el 2026-09-16.

Los archivos principales del repositorio son:

- `beta/index.html`: aplicación beta y artefacto funcional principal.
- `beta/sw.js`: caché/offline de la beta; su revisión debe avanzar junto con el HTML.
- `clientes/index.html`: versión anterior/alternativa que sirve como referencia funcional, no como artefacto canónico de la beta.
- `index.html`: página raíz del dominio.
- `tests/`: regresiones específicas de la beta pública.

Existe una carpeta local no versionada `.worktrees/`. No borrarla ni incorporarla a Git sin revisar primero su contenido y propósito.

## 4. Funciones presentes en la beta

### Venta y catálogo

- Punto de venta con búsqueda, categorías/rubros, lector de códigos y productos por unidad o peso.
- Descuentos, promociones, combos y pagos mixtos.
- Transferencia y QR se presentan como una única forma de pago.
- Productos con costo, precio, stock, mínimo, deseado, proveedor, vencimiento e imagen opcional.
- Fotos visibles en Venta, Productos y Para pedir.
- Para pedir permite buscar y filtrar por rubro, muestra stock/mínimo/deseado y arma el pedido sugerido.
- Importación y mantenimiento del catálogo según las opciones disponibles en la interfaz.

### Stock y compras

- Ajustes e ingresos de stock con historial.
- Sección llamada **Movimientos de stock** (no “Movimientos en cuentas”).
- Consulta por día con cantidad inicial, movimientos y cantidad final.
- Carga manual de facturas/remitos de proveedor.
- Lectura automática mediante foto y revisión humana antes de aplicar cambios.
- La lectura contempla descuentos de línea y descuento global del comprobante.

### Caja, turnos y reportes

- Apertura, fondos, ventas, pagos, egresos y arqueo.
- Cierre de caja turno por turno, incluso cuando hay varios turnos el mismo día.
- Resumen diario separado de los cierres individuales.
- Búsqueda dentro del detalle de ventas y trazabilidad del stock inicial/final por producto.
- Resumen de ventas, costos, margen, formas de pago, productos y rubros.
- Fiado/clientes, cobros y saldos cuando el módulo está habilitado.

### Personas y acceso

- Dueño o administrador: acceso por correo y contraseña de Supabase Auth.
- Empleado: acceso desde la pestaña “Empleado” mediante código del comercio, usuario y contraseña.
- El dueño crea, suspende, reactiva, cambia la clave y configura permisos de empleados desde Configuración.
- El onboarding inicial pertenece al dueño; un empleado no debe quedar atrapado en esa compuerta.
- El pie de la barra lateral debe mostrar “Dueño”, no el literal técnico `duenio`.

### F5: autoridad y trabajo offline

- `comercio_miembros` es la autoridad de roles y permisos; no volver a convertir `pin_hash` o `permisos_empleado` en autoridad del payload de configuración.
- Roles operativos: dueño, administrador y empleado.
- Lease offline de siete días para los tres roles. El cierre de turno corta el lease del turno.
- Superficie offline deliberadamente limitada: venta, pago de fiado, egreso y cierre de turno.
- Edición de maestros, personas, configuración, anulaciones y ajustes privilegiados requieren conexión y autoridad vigente.
- Las operaciones tardías conservan autoridad histórica mediante lease y tienen una ventana de aceptación de hasta 30 días.
- `created_at` sirve para validar la creación bajo lease; `occurred_at_device` es la fecha de negocio y puede ser anterior.
- Las causas de sólo lectura deben distinguir congelamiento F4.3, licencia no operable y autoridad/lease vencido o revocado.
- Antes de cerrar un turno sin conexión debe advertirse claramente que no podrá abrirse otro hasta recuperar conexión.

### F6: alta, licencias y piloto

- Alta mediante invitación interna y onboarding reanudable del dueño.
- Licencia beta normal de siete días exactos desde el servidor.
- Extensiones de 1 a 7 días, con máximo acumulado de 7 días adicionales; una solicitud que supera el saldo se rechaza completa, no se recorta.
- Pausar no detiene el reloj. El vencimiento efectivo tiene prioridad y se evalúa en tiempo de lectura, sin depender de un job.
- Compensaciones por pausa y extensiones consumen el mismo saldo adicional.
- Soporte interno no debe editar ventas, stock, caja, cierres, fiado ni saldos; administra alta, licencias, dispositivos, sincronización y conciliaciones con auditoría.
- La cuenta de prueba que recibió una vigencia excepcional/indefinida es una excepción operativa de QA, no una regla del producto. Verificar su estado directamente en Supabase antes de depender de él.

### Lector de facturas con IA

- Edge Function: `leer-factura`.
- Modelo configurado en la fuente auditada más reciente: `gemini-3.8-flash`.
- Tope mensual: 100 intentos por comercio y mes operativo.
- Cada intento puede consumir cupo aunque Google falle después de reservarlo.
- Tamaño máximo de imagen en el cliente: 8 MB.
- Formatos aceptados por el cliente: JPEG, PNG, WebP, HEIC y HEIF.
- Salida máxima configurada en la fuente auditada: 8192 tokens.
- Telemetría prevista: entrada, salida, razonamiento, caché, herramientas y total.
- Una medición real informada durante las pruebas fue de 2304 tokens totales (1317 de entrada y 987 de salida). No usarla como costo fijo: depende de la factura.
- Las imágenes de factura no deben persistirse como contenido de negocio salvo autorización y necesidad explícitas.

### Imágenes de productos

- Bucket: `product-images`.
- Ruta canónica: `<comercio_id>/<producto_id>.jpg`.
- El bucket debe permanecer privado.
- El cliente usa URLs firmadas temporales; no reintroducir `getPublicUrl`.
- TTL actual de las firmas en el cliente: 3600 segundos, con margen de renovación de 60 segundos.
- Subir una imagen exige conexión; se optimiza a JPEG y hasta 640 px antes de enviarse.

## 5. Decisiones técnicas que no deben deshacerse accidentalmente

- Contrato F5 de configuración: 10 claves canónicas + 6 únicamente legacy.
- La carga de rollback debe reutilizar el seam `enterRollback({baseLoad})`; no implementar un hard reload innecesario.
- La sesión/caja debe viajar en el objeto local desde su creación, no agregarse recién al construir una operación V4.
- Las filas legacy sin sesión no deben atribuirse silenciosamente a una sesión real actual.
- Los reportes históricos no deben cambiar de significado por anulaciones o drenajes tardíos sin mostrar la causa.
- Movimientos de stock es una vista diaria de inventario y no debe filtrarse por sesión de caja.
- La alerta por múltiples raíces provisionales de caja es informativa durante la beta y no bloquea por sí sola.
- El bloqueo de relaciones usado por la barrera de rollback puede congelar escrituras de todos los comercios en tablas compartidas. Fue aceptado para la beta monocomercio; antes de escalar a multi-tenant hay que rediseñarlo con particionado, locks por fila o barrera lógica por `comercio_id`.
- No duplicar fuentes canónicas ni baselines SQL dentro de un paquete. Los verificadores deben controlar cobertura y cantidad real de pruebas, no imprimir constantes engañosas.

## 6. Seguridad y privacidad

- Nunca escribir en el repositorio contraseñas, PIN, claves Gemini, service-role keys, tokens, peppers ni enlaces mágicos.
- No copiar valores sensibles de conversaciones anteriores a documentos o commits.
- La clave anónima de Supabase puede estar en el cliente; la seguridad real debe depender de Auth, RLS y validaciones del servidor, nunca de ocultar el HTML.
- El PIN local es una barrera física del dispositivo, no autoridad del servidor.
- En un dispositivo privilegiado nuevo, la falta de PIN debe llevar a alta de protección; `verificarPin()` no debe devolver éxito cuando no existe ningún hash.
- El repositorio puede alimentar GitHub Pages. Tratar todo archivo versionado como potencialmente público.

## 7. Trabajo inmediato pendiente

### Prioridad 1 — retest del acceso de empleado

El último defecto observado fue: el empleado autenticaba, pero aparecía “Entraste, pero no pudimos abrir el comercio” y la aplicación mostraba autoridad vencida/revocada.

El commit `be63355` inicializa la autoridad del empleado antes del pull V4 y agrega una regresión. La prueba local pasa, pero todavía se necesita repetir el flujo completo en un navegador real y con caché renovada:

1. cerrar la sesión previa;
2. recargar la beta evitando caché o limpiar el service worker anterior;
3. entrar como empleado con código, usuario y contraseña;
4. confirmar que carga el comercio y sólo aparecen los permisos asignados;
5. vender, cerrar/reabrir según permisos y comprobar la sincronización en Supabase;
6. revocar/suspender al empleado y verificar el bloqueo esperado.

No guardar aquí las credenciales usadas para esa prueba.

### Prioridad 2 — recorrido integral del piloto

Registrar evidencia de, como mínimo:

- alta/invitación y onboarding reanudado;
- dueño, administrador y empleado;
- apertura y cierre de dos turnos separados el mismo día;
- venta, pago de fiado, egreso y cierre offline, más drenaje posterior;
- vencimiento/revocación del lease y mensajes de sólo lectura;
- licencia activa, pausada, vencida y extendida;
- imágenes persistentes después de recargar;
- lector IA correcto, descuento aplicado y cupo mensual;
- respaldo, restauración y ausencia de pérdida o duplicación;
- reportes coherentes después de anulaciones y operaciones tardías.

Un problema de autoridad, dinero, stock, sincronización, respaldo o comprensión del cierre bloquea la aprobación comercial.

### Prioridad 3 — consolidar backend y trazabilidad

El repositorio GitHub actual contiene principalmente la web pública y sus pruebas. Las migraciones SQL, Edge Functions y documentos completos de F5/F6 existen en paquetes de entrega locales, pero no están presentes como fuente canónica en este repositorio.

Antes de comercializar conviene incorporar, después de comparar contra lo realmente desplegado:

- `supabase/f5/` y `supabase/f6/`;
- `supabase/functions/`;
- suites SQL reproducibles;
- identidad de build y documentación operativa;
- instrucciones de despliegue sin secretos.

No copiar ciegamente una revisión vieja: el frontend ya avanzó a REV18 y el backend desplegado puede contener revisiones posteriores a los paquetes archivados.

## 8. Procedimiento para continuar en un chat nuevo

1. Leer este documento completo.
2. Ejecutar `git status` y `git log -1`.
3. Confirmar que `main`, `origin/main`, la identidad del HTML y el caché del service worker siguen alineados.
4. Ejecutar todas las pruebas de `tests/*.test.cjs` y registrar el conteo real.
5. Revisar el despliegue público con caché evitada.
6. Consultar Supabase antes de afirmar estados actuales de usuarios, licencias, cupo IA, migraciones o funciones desplegadas.
7. Separar siempre “verificado en código”, “verificado localmente” y “verificado en el entorno público”.
8. Continuar primero con el retest del acceso de empleado, salvo que el usuario indique otra prioridad.

## 9. Criterio de cierre

La beta se puede considerar aprobada cuando el recorrido del piloto esté documentado, no existan fallas críticas abiertas y el código desplegado coincida con la fuente versionada. Recién después corresponde congelar el candidato, respaldar, ensayar la migración consolidada y decidir la comercialización.

## 10. Cambios publicados el 2026-09-15 — REV17

- Cierres anteriores permanece visible aunque el dueño no tenga un turno abierto. El historial se ordena por fecha de cierre.
- Un cierre del mismo dispositivo se omite como eco sólo si ya existe en la base local del usuario. Esto permite recuperar cierres de empleados al pasar a la cuenta del dueño en el mismo navegador.
- La actualización reinicia una sola vez el cursor de cierres para recuperar los previamente omitidos; conserva los demás cursores y evita duplicar cierres.
- El detalle conserva la cantidad e importe originales y muestra un aviso si faltan ventas en el dispositivo. La recuperación de ventas/pagos/egresos omitidos del mismo dispositivo no se amplió: puede faltar el detalle aunque el cierre esté disponible.
- Fiado usa las etiquetas **Total adeudado** y **Clientes con fiado**.

Verificación:

- **En código:** identidad y caché REV17 alineados; revisión independiente sin hallazgos pendientes dentro del alcance.
- **Localmente:** 40/40 pruebas, sintaxis válida y vista de navegador con datos de ejemplo para Caja sin turno y Fiado.
- **Entorno público:** publicación de GitHub Pages exitosa; lectura sin caché confirma REV17, caché REV17 y etiquetas nuevas. Supabase confirma alcance por comercio para cierres del dueño y un cierre existente registrado por un empleado. Tras el desbloqueo realizado por el usuario, se verificó en la sesión de dueño, sin turno abierto, el cierre del empleado del 15/09/2026 a las 12:16 (hora argentina), con 1 venta por $1.300; el detalle mostró esa venta. Se comprobaron también las dos etiquetas nuevas en Fiado. No se creó una venta ni se cerró un turno nuevo durante esta comprobación; el ingreso de empleado desde cero y un cierre nuevo siguen formando parte del recorrido integral pendiente.


## Preparación local del lector — REV78 (2026-10-01)

Por pedido del usuario se corrigieron los tres hallazgos nuevos de REV77 en una copia aislada del paquete: elecciones automáticas basadas en una letra distinta, deuda/pagos a cuenta y reclasificación manual de filas financieras. La revisión independiente detectó y se resolvió también la copia escalar de una fila puesta en cero.

Entrega: `entregables/MiComercio-Sistema-Completo-REV78-2026-10-01.zip`, SHA-256 `6648327706d225e4c919d97deae9d131c1d431d57d562e692a147bf7ea4d127a`. Detalle: `entregables/DETALLE-CAMBIOS-REV78-2026-10-01.md`. Fuente aislada: `entregables/preparacion-REV78-2026-10-01/`.

Verificado localmente: 358/358 pruebas, nueve escenarios financieros y tres identidades aproximadas en navegador, recorridos heredados REV77/76/54, integridad de 25 archivos y contenido del ZIP idéntico a los 230 archivos de la copia probada. Catálogo autorizado: 47/50 y 41/45 automáticos correctos, cero incorrectos; 23 contraejemplos sin elección errónea; 6.298 mutaciones sin fallos según su oráculo. No se incluye el catálogo privado.

No integrado ni publicado; no se modificó Supabase. La beta pública no fue verificada de nuevo en esta tarea. Siguen pendientes Gemini real, facturas nuevas y dos dispositivos, además de los cambios de empleados, WhatsApp y comparación por turno para integrar después. Los dos problemas heredados de descuento global sobre deuda y Ver en Caja sin ventas quedan expresamente pendientes. Antes de desplegar, comparar backend contra lo realmente publicado.
