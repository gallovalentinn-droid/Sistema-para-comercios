# F5 — Identidades, permisos y autoridad offline

Fecha: 1 de septiembre de 2026  
Estado: aprobado y listo para implementar  
Sistema de referencia: `entregables/MiComercio-PRUEBA-QA3-MOVIMIENTOS-CUENTAS.html`  
Servidor QA: Supabase `qrvdfqpxutymmlcplsal`

## 1. Objetivo

F5 reemplaza la autoridad local basada en rol/PIN/configuración por identidades personales y permisos en servidor. El sistema debe seguir operando durante cortes de conexión mediante un lease de autoridad acotado, auditable y validable históricamente.

F5 se desarrolla y verifica antes de F6. La integración y migración final se realizan una sola vez cuando ambas fases estén terminadas.

## 2. Decisiones cerradas

- Cada dueño, administrador y empleado usa una identidad distinta.
- La autoridad vive en `comercio_miembros`; nunca en el PIN, el HTML o IndexedDB.
- Los literales de servidor son `duenio`, `admin` y `empleado`. Los acentos son sólo etiquetas de interfaz.
- El dueño tiene autoridad total derivada por rol.
- El administrador puede gestionar empleados, pero no dueños, administradores ni su propia membresía.
- Un actor sólo puede otorgar un subconjunto de sus propios permisos efectivos.
- Siempre debe existir al menos un dueño activo por comercio.
- Durante la beta, un `user_id` sólo puede tener una membresía activa total. El soporte multicomercio queda para un modelo formal posterior a la beta.
- El PIN deja de autorizar acciones. Puede seguir existiendo únicamente como bloqueo local de pantalla.
- Ocultar pantallas es UX; la seguridad se aplica en base de datos y RPC.
- Toda key de permiso o configuración no reconocida se rechaza explícitamente.
- El lease de autoridad F5 dura **7 días completos** para los tres roles.
- El lease de autoridad se liga a persona, comercio y dispositivo, no al turno. Cerrar caja no lo invalida.
- Abrir un turno offline reutiliza el lease vigente y crea una sesión provisional que se drena en orden por caja.
- La licencia comercial F3 y el lease personal F5 son controles distintos. Para escribir offline deben estar vigentes ambos.

## 3. Identidad y acceso

### 3.1 Dueño y administrador

Mantienen una cuenta personal de Supabase Auth. Ningún dato editable por el usuario, como `raw_user_meta_data`, participa en la autorización.

### 3.2 Empleado

El acceso visible es:

1. comercio;
2. nombre de usuario dentro del comercio;
3. clave.

No se exige correo personal ni cuenta de Gmail. Supabase Auth conserva una identidad técnica con un correo interno aleatorio que nunca se muestra y que no contiene el usuario ni el comercio.

Una Edge Function pública de inicio de sesión recibe comercio, usuario y clave, resuelve el correo interno en una tabla privada y usa el flujo normal de contraseña de Supabase Auth. Ésta es la única función sin JWT porque su propósito es obtenerlo; aplica límite de intentos, respuesta genérica para evitar enumeración y auditoría sin guardar la clave. La clave de servicio permanece únicamente en el servidor.

La creación y el restablecimiento de accesos pasan por otra Edge Function que sí exige JWT y vuelve a comprobar en base el rol vigente del actor. Si la creación de Auth se completa pero falla la membresía, ejecuta una compensación y elimina la identidad técnica huérfana.

Durante la beta, una persona que trabaje en dos comercios utiliza dos cuentas separadas.

## 4. Modelo de membresía

`comercio_miembros` es la fuente única de autoridad vigente. Conserva, como mínimo:

- `comercio_id`;
- `user_id`;
- `rol`;
- `permisos` JSONB para excepciones individuales del empleado;
- `nombre_mostrado`;
- `activo`;
- versión de permisos;
- marcas de creación, actualización y revocación.

Los permisos de dueño y administrador se derivan del rol y del catálogo vigente; no se guarda una copia enumerada que pueda quedar desactualizada. Para un empleado, `permisos` guarda el conjunto explícito habilitado para esa persona. El valor legacy `permisos_empleado` se usa una sola vez como plantilla de alta/migración y luego deja de ser autoridad.

La unicidad activa por usuario se hace incondicional durante la beta. No depende del estado de migración legacy/V4. Antes de crear el índice parcial, un preflight cuenta usuarios con más de una membresía activa y exige cero; cualquier hallazgo aborta el DDL y se remedia mediante una decisión explícita sobre cuál membresía conservar, nunca mediante desactivación automática.

## 5. Catálogo cerrado de permisos

| Sección | Permiso canónico | Alcance principal | Uso offline |
|---|---|---|---|
| Vender | `ventas_registrar` | registrar venta y medios de pago | Sí |
| Productos | `productos_editar` | catálogo, precios y costos | Sólo lectura cacheada; escritura online |
| Para pedir | `reposicion_ver` | proyección de reposición | Sí, lectura cacheada |
| Vencimientos | `vencimientos_ver` | proyección de vencimientos | Sí, lectura cacheada |
| Combos | `combos_editar` | combos e ítems | Sólo lectura cacheada; escritura online |
| Descuentos | `promociones_editar` | promociones | Sólo lectura cacheada; escritura online |
| Fiado | `fiado_operar` | clientes, cargos y pagos | Pago offline; altas/ajustes online |
| Caja | `caja_operar` | sesiones, egresos y cierres | Egreso y cierre offline |
| Movimientos | `movimientos_ver` | proyección de stock y ventas | Sí, lectura cacheada |
| Resumen | `resumen_ver` | agregación autorizada | Sí, lectura cacheada |

Abrir caja online se permite con `ventas_registrar` o `caja_operar`.

Durante la beta, quedan exclusivamente para dueño o administrador:

- anular ventas;
- ajustar stock manualmente;
- revertir o eliminar movimientos y egresos;
- resolver ajustes de cierres;
- gestionar personas;
- modificar configuración privilegiada.

`productos_editar` incluye alta y edición de nombre, código, rubro, proveedor, costo y precio. No se divide en más permisos durante la beta: quien puede mantener el catálogo puede mantener sus valores comerciales. El ajuste manual de existencias continúa separado y reservado a dueño/administrador porque reescribe el ledger de stock.

## 6. Mutaciones de membresía

No hay DML directo desde `anon` o `authenticated` sobre `comercio_miembros`. Se elimina la policy `miembros_write` y se revocan `INSERT`, `UPDATE` y `DELETE`.

Las altas, cambios de rol/permisos, desactivaciones, reactivaciones y restablecimientos usan RPC específicas. Cada mutación:

1. exige `auth.uid()`;
2. toma `pg_advisory_xact_lock(hashtext(comercio_id::text))`;
3. vuelve a leer al actor y al destinatario bajo el mismo lock;
4. valida el rol actual del actor;
5. valida el rol y permisos resultantes del destinatario;
6. impide editar la propia membresía si el actor es administrador;
7. impide dejar al comercio sin dueño activo;
8. incrementa la versión de permisos;
9. escribe auditoría;
10. confirma o revierte todo en una transacción.

Al revocarse el DML directo, todas las mutaciones de membresía se implementan en funciones privadas `SECURITY DEFINER`; no existe un camino alternativo sin `DEFINER`. Cada función fija `search_path = ''`, califica explícitamente los objetos fuera de `pg_catalog`, comprueba `auth.uid()` y autoridad, revoca ejecución a `PUBLIC` y concede ejecución únicamente a los roles necesarios. Las RPC públicas son wrappers `SECURITY INVOKER` sin lógica de autoridad.

Las pruebas deben ejecutar cada función al menos una vez por camino autorizado y denegado. Crear la función sin ejecutarla no valida la resolución de nombres con `search_path = ''`.

## 7. Configuración

### 7.1 Configuración operativa

Puede modificarse online mediante una RPC con allowlist estricta:

- fondo de caja general;
- fondo de caja de cigarros;
- días de aviso de vencimiento;
- días de plazo de fiado;
- porcentaje de recargo de fiado;
- motivos adicionales de egreso.

### 7.2 Configuración privilegiada

Sólo dueño o administrador:

- PIN de bloqueo local;
- permisos heredados de empleado durante la transición;
- módulos de fiado, vencimientos y cigarros;
- WhatsApp del dueño, porque recibe información de caja.

`f3PayloadConfig()` deja de emitir `pin_hash` y `permisos_empleado`. También se revoca su escritura directa en V4. El contrato F3.4 pasa de 12 a 10 keys canónicas; `pinHash` y `permisosEmpleado` quedan como legacy-only.

La guarda de contratos cambia en el mismo commit: espera exactamente 10 keys canónicas y 6 legacy-only (`nombre`, `nroVenta`, `ultBackup`, `pinDuenio`, `pinHash`, `permisosEmpleado`). Una quinta o séptima key legacy-only, o cualquier conteo distinto, mantiene el build en rojo.

El rollback no reconstruye `pinHash` ni `permisosEmpleado` desde V4. La proyección `v4_to_legacy` toma `nombre` desde `comercios.nombre` y preserva verbatim del blob congelado cinco keys: `nroVenta`, `ultBackup`, `pinDuenio`, `pinHash` y `permisosEmpleado`. Esas keys se mezclan explícitamente en la proyección antes del reemplazo CAS de `datos_kiosco`.

Una prueba de rollback usa valores centinela distintos en blob y V4, ejecuta el rollback real y comprueba que las cinco keys preservadas permanecen byte por byte. También comprueba que `permisosEmpleado` no vuelve vacío ni habilita secciones por el default legacy `perm[v.id] !== false`.

## 8. Proyecciones y minimización de datos

La interfaz actual descarga datos completos a IndexedDB. Además, el stock se deriva localmente como `stockBase + suma(movs)`. Por lo tanto, una proyección de punto de venta que omita movimientos rompería el stock online y offline.

F5 divide este trabajo en un incremento propio de sincronización consciente de proyección. La proyección mínima de punto de venta conserva:

- productos necesarios para vender;
- combos y promociones aplicables;
- todos los movimientos mínimos necesarios para reconstruir stock;
- ventas locales y metadatos de sesión necesarios para seguir trabajando offline.

Los movimientos mínimos conservan identidad, producto, cantidad, tipo y tiempo; no transportan campos ajenos a la derivación. Las demás proyecciones —reposición, vencimientos, fiado, movimientos detallados y resumen— se agregan según permisos.

El servidor deriva un manifiesto versionado desde el catálogo normativo, el rol, los permisos efectivos y su versión. El cliente no puede proponer, reducir ni modificar ese alcance. Cada respuesta incluye el identificador y hash del manifiesto emitido por el servidor.

F3.4 informa divergencia y cobertura por separado:

- colecciones/campos esperados según permisos vigentes;
- colecciones/campos declarados por el manifiesto del servidor;
- colecciones/campos efectivamente comparados;
- cantidad de omisiones intencionales autorizadas;
- cantidad de faltantes no autorizados.

Sólo existe `PASS` cuando el manifiesto coincide con el contrato que el servidor deriva para esa membresía y la cobertura comparada es completa dentro de ese contrato. Un hash, versión, colección o campo faltante produce `F34_COVERAGE_FAILURE`; nunca se convierte en un PASS sin hallazgos. El preflight de servidor vuelve a derivar el manifiesto y rechaza evidencia contra un alcance distinto.

Mientras el comercio no esté en `v4_only`, `datos_kiosco` sigue permitiendo al usuario leer su blob completo. En ese estado F5 sí aplica autoridad de escritura en servidor, pero no promete no-entrega de datos legacy. El criterio estricto de minimización sólo rige en `v4_only`, cuando el blob está fenceado.

La validación de minimización se realiza en un comercio QA dedicado puesto en `v4_only` mediante el control plane. Ese fixture debe recorrer con evidencia la cadena F3.4 → F4.1 → F4.2 → F4.3 antes de probar las proyecciones. El estado actual del comercio QA principal es `rollback`; permanece en ese estado y no se lo presenta como evidencia de este criterio.

La barrera F4.3 actual toma locks a nivel relación sobre tablas compartidas. Es una limitación conocida y aceptada únicamente para la beta monocomercio: con múltiples comercios podría frenar escrituras ajenas durante la ventana de hasta 15 segundos. Antes de habilitar multi-tenant debe reemplazarse por particionado, locks por fila o una barrera lógica por `comercio_id`, en lugar de `LOCK TABLE`.

## 9. Lease de autoridad offline

### 9.1 Duración, chequeo y emisión

El servidor emite un lease inmutable con una duración máxima de **7 días (168 horas)** desde su emisión. La verificación de revocación y la emisión son mecanismos distintos.

- **Chequeo de autoridad:** se realiza cada cinco minutos cuando hay conexión. Detecta membresía, dispositivo, rol o permisos revocados y puede cortar escritura inmediatamente. No crea ni extiende un lease.
- **Emisión de lease:** ocurre al iniciar en un dispositivo sin lease vigente, cuando cambia rol/permisos/dispositivo/política o cuando al lease actual le quedan seis días o menos. Con autoridad estable produce aproximadamente un lease por dispositivo por día, no 288.

El cliente utiliza el mismo `lease_id` hasta instalar atómicamente un reemplazo. Desde ese instante, toda operación nueva toma el lease nuevo; una operación que ya estaba en construcción conserva el lease anterior. Esta es una regla de higiene del cliente, no un control de seguridad verificable por el servidor: el servidor no infiere cuándo se recibió el reemplazo ni rechaza una operación sólo porque exista un lease más reciente. Cada operación se valida contra el lease que referencia, su `created_at`, su `aceptacion_hasta` y las reglas de revocación histórica. Así no se rechaza la carrera legítima entre crear una operación y recibir el reemplazo.

Durante la beta, los leases no se purgan: permanecen append-only para auditoría. Con el umbral diario, el volumen esperado es de aproximadamente 365 filas por dispositivo y año. Una política de archivo o retención posterior deberá preservar, como mínimo, todos los registros hasta `aceptacion_hasta` y el período de auditoría que se defina.

El lease incluye:

- `lease_id`;
- `lease_family_id`;
- persona;
- comercio;
- dispositivo;
- rol al emitir;
- `ttl_seconds = 604800` durante la beta;
- versión del contrato;
- versión de permisos;
- tipos literales de operación permitidos;
- `issued_at`;
- `valid_until = issued_at + interval '7 days'`;
- `aceptacion_hasta = valid_until + interval '30 days'`.

El campo de duración queda explícito y versionado para permitir que una política posterior use TTL distintos por rol sin cambiar el contrato. Durante la beta los tres roles reciben exactamente 604800 segundos.

Cerrar un turno no corta la autoridad personal. Si sigue vigente el lease, el dispositivo puede abrir otro turno offline mediante una sesión local provisional con UUID generado en cliente. Al reconectar, el stream de la caja drena primero el cierre anterior, después la apertura y finalmente las operaciones del nuevo turno.

La restricción de una única sesión `abierta` por caja se conserva en servidor. Si el drenaje encuentra otra sesión remota incompatible, la sesión provisional se inserta con su UUID y estado `requiere_conciliacion`, ligada al identificador de la sesión que causó el conflicto. El índice existente permite este estado sin crear una segunda sesión `abierta`.

Las operaciones dependientes continúan drenando contra la sesión provisional en conciliación; no quedan bloqueadas detrás de la apertura y no se atribuyen falsamente al turno de otra persona. Las RPC offline aceptan sesiones `abierta` o `requiere_conciliacion` bajo este camino explícito. Al cerrar, se genera un cierre marcado `requiere_conciliacion`; resolverlo continúa siendo una acción online de dueño/administrador. La sesión remota original no se cierra ni se modifica automáticamente.

Una sesión `requiere_conciliacion` no es un destino abierto. Cada RPC vuelve a comprobar que la operación pertenece a su corriente: mismo comercio, persona, dispositivo, caja y familia de leases; además, el `stream_key` se deriva en servidor desde esos identificadores y la sesión declarada, no se confía en el string del cliente. Los reemplazos diarios y los cambios de permisos autorizados para la misma persona/dispositivo comparten `lease_family_id`; una reactivación posterior a revocación dura o el cambio de persona/dispositivo abre una familia nueva.

Sólo puede existir una raíz provisional sin conciliar por dispositivo y caja. Si ese dispositivo abre otro turno offline antes de resolverla, el nuevo UUID se registra como `session_segment_id`/alias de la misma raíz, conservando sus límites de apertura y cierre para auditoría. Cada operación y fila de ledger conserva ese segmento además del `caja_sesion_id` raíz. No se crea otra raíz.

Dispositivos distintos sí pueden crear raíces distintas para la misma caja. Se genera una alerta cuando una caja acumula dos raíces provisionales de dispositivos distintos o cuando una raíz permanece sin resolver más de 24 horas. Durante la beta esa alerta es informativa: no bloquea el drenaje ni la apertura, y no existe un tope duro de raíces por caja. La cola de conciliación debe mostrar todas las raíces para que dueño, administrador y soporte puedan resolverlas explícitamente.

### 9.2 Relación con la licencia F3

El `offlineValidUntil` existente corresponde a la licencia comercial, no a la autoridad personal. El cliente conserva campos separados para no mezclarlos.

La escritura offline sólo se habilita si:

`momento_estimado_servidor < min(licencia.offlineValidUntil, lease.valid_until)`

Además deben estar ausentes los otros bloqueos de escritura.

La ventana real de operación no depende del próximo cierre de caja. Sólo la acotan la licencia, el lease personal, una revocación explícita o los demás bloqueos de escritura.

### 9.3 Fallos de validación

- Respuesta explícita de miembro, dispositivo o permiso revocado: sólo lectura inmediata.
- Sin red, timeout o 5xx: se conserva el lease existente, pero no se emite un reemplazo.
- Ningún error ambiguo modifica `valid_until` ni genera un lease nuevo.

El lease es una cota de radio de daño, no una frontera criptográfica: el usuario controla el navegador e IndexedDB.

### 9.4 Riesgo aceptado del plazo uniforme

Siete días para empleados amplían 21 veces la ventana de capacidad offline respecto de las ocho horas consideradas antes. Si un empleado desvinculado conserva un dispositivo sin conexión, el servidor no puede comunicarle la revocación hasta que vuelva a conectarse.

La decisión mantiene 604800 segundos para dueño, administrador y empleado porque la continuidad beneficia al comercio completo durante el mismo corte. El costo no es simétrico: un empleado revocado tiene mayor potencial de abuso. Se acepta ese riesgo durante la beta y se mitiga mediante lista offline cerrada, auditoría por actor/dispositivo, operaciones destructivas sólo online, `aceptacion_hasta` y revocación dura con confirmación de posible pérdida del outbox. El contrato conserva `ttl_seconds` para poder reducir el plazo de un rol más adelante sin rediseñarlo.

## 10. Operaciones offline

La lista es cerrada y se valida por tipo literal versionado:

- `abrir_sesion_caja_v4`;
- `registrar_venta_v4`;
- `registrar_pago_fiado_v4`;
- `registrar_egreso_v4`;
- `cerrar_sesion_caja_v4`.

Abrir turno, tanto online como offline, exige `ventas_registrar` o `caja_operar`. El camino offline además exige lease vigente con el tipo literal `abrir_sesion_caja_v4`.

No son aptas offline:

- anular venta;
- ajustar stock;
- revertir/eliminar egreso o movimiento;
- editar maestros, promociones o configuración;
- gestionar personas;
- resolver cierres o ejecutar cierres excepcionales.

Registrar un egreso offline conserva un riesgo de sustracción aceptado para la beta. Se mitiga con actor, dispositivo, lease, auditoría e inversión online; no se considera eliminado.

## 11. Drenaje histórico

Una operación se valida contra la autoridad vigente cuando se creó, no contra la membresía vigente cuando llega.

Cada operación offline contiene un sobre firmado lógicamente por referencia al lease:

- idempotency key;
- `lease_id`;
- `lease_family_id`;
- caja, dispositivo y sesión/segmento declarados;
- `stream_key` canónico que el servidor vuelve a derivar;
- tipo de operación;
- `created_at`, fecha técnica declarada de creación;
- `occurred_at_device`, fecha de negocio;
- payload versionado.

Reglas:

- `created_at` es declarado por el cliente y debe caer entre `issued_at` y `valid_until` del lease. Esta comprobación asegura consistencia para clientes normales; no demuestra cuándo actuó un cliente hostil.
- `occurred_at_device` puede estar en el pasado para permitir regularizaciones.
- el servidor registra aparte `received_at`.
- hasta `aceptacion_hasta`, la operación válida se procesa automáticamente.
- después de `aceptacion_hasta`, no se descarta: queda pendiente de intervención explícita del dueño. Ésta es la cota efectiva contra fabricación tardía desde un cliente controlado por el usuario.
- los permisos se interpretan literalmente según el contrato guardado en el lease, sin reinterpretarlos por un enum futuro.

La desactivación normal de una persona no revoca su sesión de Auth. Esa sesión queda en modo sólo drenaje: puede enviar operaciones históricas y no puede leer ni ejecutar otra acción. La revocación dura exige confirmación explícita de posible pérdida del outbox y revoca sesiones/dispositivo.

La tabla de leases es append-only: sin `UPDATE` ni `DELETE`; una corrección emite un lease nuevo.

## 12. Llegadas tardías y cierres

Las ventas, pagos y egresos tardíos ligados a una sesión cerrada usan la infraestructura existente de `cierre_ajustes` y `private.registrar_llegada_tardia`.

El cierre queda marcado `requiere_conciliacion`; la operación no queda fuera de todos los arqueos. La resolución del ajuste es online y exclusiva de dueño/administrador.

Una apertura offline que colisiona con otra sesión usa el mismo principio sin falsear la atribución: se conserva como sesión provisional `requiere_conciliacion`, las operaciones posteriores se aplican a esa sesión y la corriente continúa. El conflicto de aperturas queda pendiente, no las ventas, pagos o egresos válidos. Cuando exista el cierre de la sesión provisional, su conciliación se integra a la misma cola visible de ajustes.

El cliente pasa a ser consciente de sesión. Los campos del contrato servidor son `caja_sesion_id` y `session_segment_id`; sus equivalentes en los objetos locales son `_v4cajaSesionId` y `_v4sessionSegmentId`. En modo V4, cada venta, pago, egreso, movimiento y cierre los guarda desde su creación, antes de incorporarse a `db.*`. Los constructores de operaciones copian esos valores del objeto y no vuelven a inferirlos desde la sesión corriente. El pull conserva el mismo mapeo local. `turnoActual(sessionId)` filtra por `_v4sessionSegmentId ?? _v4cajaSesionId`.

Las filas legacy sin sesión no entran por rango de fechas a una sesión real. El modelo de lectura las agrupa en sesiones sintéticas no operables: cada cierre legacy define `legacy:<cierre.id>` para su propio rango; las filas que no pertenecen a ningún cierre se agrupan como `legacy:sin_cierre:<AAAA-MM-DD>` por fecha de negocio. Ambos grupos se muestran en Resumen con la etiqueta **Histórico sin sesión** y quedan excluidos del arqueo y cierre interactivos. No crean filas en `caja_sesiones`, no aceptan operaciones nuevas y no se usan como destino de drenaje.

Si no existe una sesión real abierta o provisional activa, Caja muestra **No hay turno abierto**, ofrece la acción **Abrir turno** cuando la autoridad lo permite y no renderiza totales ni controles de cierre. Nunca fabrica un turno mediante una ventana de fechas.

Caja y el cierre calculan totales exclusivamente para `f3Estado.session.id`. Resumen puede agregar varias sesiones por día, pero las presenta separadas e identifica las que requieren conciliación. Una sesión provisional nunca se suma al arqueo interactivo de otra sesión aunque sus fechas se superpongan.

**Movimientos en cuentas** queda deliberadamente fuera del filtro por sesión: es una proyección diaria de stock por fecha de negocio, no un arqueo de caja. Su cálculo pasa a ser event-based. Una venta cuenta como vendida en su fecha original aunque sea anulada después; la reposición cuenta en la fecha del movimiento positivo `anulacion_venta`/`ajuste` que la materializa, sin depender de que la venta conserve `anuladaFecha`, sin borrar ni reclasificar retroactivamente la venta original como `otros`. `anuladaFecha` continúa siendo metadato de auditoría y se completa para operaciones nuevas/canónicas. Una llegada tardía válida puede corregir el día de `occurred_at_device`, pero se identifica como sincronizada tarde mediante `received_at`; no reescribe los totales inmutables de un cierre, que se corrigen por `cierre_ajustes`.

El incremento 6 incluye la corrección de `cantidadVendidaProducto`/`resumenStockProductoPeriodo` y sus consumidores. La prueba de regresión crea una venta de tres unidades el día D y la anula el día D+1: D conserva `vendidas = 3` y `otros = 0`; D+1 conserva `vendidas = 0` y registra la reposición `+3` como otro movimiento. Otra prueba drena el día D+4 una venta ocurrida el día D y verifica la marca de llegada tardía y la inmutabilidad del cierre asociado.

Se prueba la secuencia completa para cada uno de los cinco tipos offline: crear bajo lease, revocar a la persona, drenar tarde y comprobar que la apertura/operación aparece en la sesión o ajuste correspondiente.

## 13. Estados de sólo lectura

`assertWritable` compone y devuelve todas las causas activas, sin que una oculte a otra:

- congelamiento de preparación/migración F4.3;
- licencia F3.3 no operable;
- lease F5 vencido o revocado.

La interfaz muestra la causa concreta y la acción posible. El soporte recibe los mismos códigos.

## 14. Telemetría y auditoría

Se registra:

- chequeos de autoridad, emisión/reemplazo, vencimiento y revocación explícita de leases;
- transición a sólo lectura por vencimiento;
- duración estimada de los cortes, incluso si no vencen el lease;
- cierres de turno offline;
- rechazos explícitos de autoridad;
- operaciones drenadas después de una revocación;
- operaciones vencidas que requieren intervención;
- actor, destinatario y cambio en toda mutación de membresía.

No se registran claves ni secretos.

Todas las excepciones offline comparten una única cola visible para dueño/administrador y una vista de soporte. Cada fila incluye `entidad` con valores cerrados `operacion`, `sesion` o `cierre`, más `entidad_id`; así el mismo literal de estado no obliga a soporte a inferir qué se concilia. La cola muestra actor, dispositivo, lease, tipo, monto, fecha declarada, recepción, sesión/cierre afectado y causa. Usa estados cerrados:

- `aplicada_sin_reconocer`: operación válida creada antes de la revocación; ya está en el ledger y requiere reconocimiento o inversión auditada;
- `pendiente_de_decision`: llegó después de `aceptacion_hasta`; no se aplica hasta que el dueño acepte o rechace;
- `requiere_conciliacion`: operación aplicada a una sesión provisional/conflictiva o cierre afectado;
- `resuelta`: decisión o conciliación final registrada con actor y fecha.

No existen una cola de revocaciones y otra de operaciones vencidas. F6.4 consume esta misma superficie y no necesita reconstruir estados desde logs.

## 15. Seguridad de esquema

Como parte de F5 se corrige `public.app_schema_meta`, actualmente expuesta sin RLS. Primero se inventariará su uso real por el cliente; después se habilita RLS con acceso mínimo o se retira de la Data API. No se habilita RLS sin garantizar el camino legítimo de lectura necesario para compatibilidad.

Después de cada cambio de esquema se ejecutan los asesores de seguridad y rendimiento de Supabase.

## 16. Compatibilidad legacy y numeración

### 16.1 Roster mayor a 32

F5.1 elimina cualquier dependencia de un roster truncado a 32 blobs. El roster autoritativo se obtiene de `comercio_miembros` mediante paginación con cursor hasta agotar el total. La transición de datos legacy recorre todas las membresías asociadas, también por páginas, y registra cantidad esperada y procesada. Una prueba con 33 integrantes/blobs impide reintroducir el límite silencioso.

### 16.2 Identificadores de venta

No se introduce una autoridad central de numeración que impida vender offline. La identidad técnica de cada venta continúa siendo su UUID y su idempotency key.

El número visible deja de depender de que un contador local sea globalmente único. `ticket_ref` se forma de manera determinista con código de caja, secuencia local y sufijo del UUID de la venta. La restricción única de servidor se conserva y una colisión nunca se resuelve cambiando la identidad de una venta ya creada.

Para la beta se deja asentado que ningún proceso fiscal ni atención de reclamos depende del `ticket_seq` desnudo. La interfaz, exportaciones y soporte identifican ventas mediante `ticket_ref`. Si F6.3 incorpora facturación o un tercero exige numeración fiscal correlativa, esta decisión se reabre antes de integrar ese proceso; el contador local no se reutiliza como número fiscal.

### 16.3 Retiro de autoridad local

F5 elimina `LROLE()`, `guardarRolLocal()` y `cargarRolLocal()`, además de sus llamadas. Ninguna decisión de autorización futura puede volver a leer el rol desde `localStorage`. El PIN queda aislado como bloqueo de pantalla sin alterar `f3Estado.rol` ni permisos de servidor.

## 17. Estrategia de implementación

F5 se entrega en incrementos verificables:

1. catálogo de permisos, invariantes y RPC de membresía;
2. acceso de empleados sin correo visible;
3. separación de configuración operativa/privilegiada;
4. leases de 7 días, apertura offline y drenaje histórico;
5. sincronización consciente de proyección y F3.4 consciente del manifiesto;
6. retiro de autoridad local, cliente consciente de sesión en POS/Caja/Resumen, compatibilidad mediante sesiones sintéticas legacy, corrección event-based de Movimientos en cuentas, estados de sólo lectura y telemetría;
7. roster paginado, referencia de tickets y compatibilidad legacy;
8. pruebas de seguridad, concurrencia, offline y regresión.

Cada incremento comienza con pruebas que fallen, aplica el cambio mínimo y vuelve a ejecutar la regresión completa relevante.

Como el incremento de proyecciones cambia qué datos conserva el dispositivo, después del incremento 5 se repite completa la matriz offline aprobada en el incremento 4. Esta revalidación es un gate obligatorio, no una regresión opcional.

## 18. Criterios de aceptación

- Un empleado no puede elevar su rol ni permisos mediante DML, RPC, config legacy o manipulación del HTML.
- Dos mutaciones simultáneas no pueden dejar al comercio sin dueño.
- Un administrador no puede modificar dueños, administradores ni su propia membresía.
- Una persona no puede tener dos membresías activas durante la beta.
- Una respuesta explícita de revocación corta la escritura inmediatamente.
- Para un cliente normal, un corte conserva como máximo el tiempo restante del lease emitido por servidor; una mutación local no renueva `issued_at` ni `valid_until`. Para un cliente hostil, la cota de aceptación es `aceptacion_hasta`.
- Cerrar un turno no corta el lease; se puede abrir otro offline con el mismo lease vigente.
- Las cinco operaciones aptas sobreviven a revocación y drenaje tardío dentro de 30 días.
- Las operaciones destructivas nunca se aceptan offline.
- En `v4_only`, un permiso de lectura ausente implica que el dato restringido no llega al dispositivo; antes de `v4_only`, este criterio no se atribuye al blob legacy.
- La proyección POS conserva productos y movimientos mínimos suficientes para derivar exactamente el stock local.
- F3.4 informa por separado las omisiones autorizadas por el manifiesto derivado en servidor; no las cuenta como divergencia ni permite que reduzcan la cobertura esperada para ese set de permisos.
- El manifiesto aceptado por F3.4 coincide exactamente con el que el servidor deriva del rol, permisos y versión vigentes; cualquier reducción o cobertura incompleta falla cerrado.
- Los reportes F3.4 muestran cobertura esperada, declarada y comparada además de divergencias.
- Una apertura provisional que colisiona con otra sesión no bloquea las ventas posteriores: conserva su UUID en `requiere_conciliacion` y drena toda la corriente.
- Caja nunca suma operaciones de otra `caja_sesion_id`; Resumen separa sesiones superpuestas y marca conciliaciones.
- Una RPC no puede dirigir operaciones a una sesión `requiere_conciliacion` de otra persona, dispositivo, caja o familia de leases.
- Una nueva apertura del mismo dispositivo/caja se encadena como segmento de la raíz provisional existente; dos raíces distintas o 24 horas sin resolver disparan una alerta informativa que no bloquea, y la beta no impone un máximo de raíces por caja.
- Abrir caja offline exige `ventas_registrar` o `caja_operar`, igual que online, además del lease correspondiente.
- El chequeo de cinco minutos no emite leases; la emisión estable ocurre como máximo una vez por día con el umbral definido.
- Toda operación drenada después de revocar a una persona aparece en la cola visible de revisión offline.
- Las operaciones post-revocación, vencidas y con conflicto de sesión aparecen en una única cola con estados `aplicada_sin_reconocer`, `pendiente_de_decision`, `requiere_conciliacion` o `resuelta`.
- Cada fila de esa cola declara `entidad` (`operacion`, `sesion` o `cierre`) y `entidad_id`.
- Una fila legacy sin sesión aparece sólo en un grupo sintético de Resumen y nunca entra al arqueo de una sesión real por coincidencia de fechas.
- Sin sesión real activa, Caja muestra que no hay turno abierto y no inventa totales ni cierre.
- El reemplazo de lease gobierna la creación de operaciones en el cliente; el servidor no rechaza por mera existencia de un lease posterior y conserva la validación histórica del lease referenciado.
- Movimientos en cuentas permanece diario y ajeno a la sesión: una anulación posterior no borra las vendidas del día original ni las reclasifica como `otros`, y una llegada tardía queda identificada sin reescribir el cierre.
- El build exige 10 keys canónicas y 6 legacy-only.
- Un rollback conserva verbatim `nroVenta`, `ultBackup`, `pinDuenio`, `pinHash` y `permisosEmpleado` del blob congelado.
- Un roster de 33 integrantes/blobs se procesa completo.
- Dos ventas offline no comparten UUID, idempotency key ni `ticket_ref` aunque sus secuencias locales coincidan.
- `LROLE()` y los caminos de rol en `localStorage` dejan de existir.
- Los tres bloqueos de escritura se distinguen en interfaz y soporte.
- No quedan tablas públicas expuestas sin la protección intencional correspondiente.
- Las pruebas existentes de búsquedas, pagos y Movimientos en cuentas siguen pasando.

## 19. Cambios al registro de decisiones

- Decisión 3: las keys canónicas de configuración bajan de 12 a 10; `pinHash` y `permisosEmpleado` pasan a legacy-only.
- Decisión 12: la restricción de una membresía activa total continúa durante toda la beta y vence sólo con el modelo multicomercio formal posterior.
- Decisión 13: F5.1 incorpora roster paginado sin límite silencioso de 32 y una prueba con 33 integrantes/blobs.
- Decisión 18: se divide en desactivación normal con sólo-drenaje y revocación dura con aceptación explícita de pérdida del outbox.
- Decisión 19: la preservación verbatim de rollback pasa de tres a cinco keys (`nroVenta`, `ultBackup`, `pinDuenio`, `pinHash`, `permisosEmpleado`); `nombre` continúa derivándose de `comercios.nombre`. El contrato legacy-only total pasa de cuatro a seis.
- Decisión 21: permanece firme para F5 beta la numeración descentralizada apta para offline. La unicidad técnica se apoya en UUID/idempotencia y `ticket_ref` incorpora un sufijo determinista de la venta; ningún flujo actual depende del `ticket_seq` desnudo. La decisión se reabre antes de cualquier numeración fiscal en F6.3.
- Decisión del lease: se reemplazan las 8 horas previamente aprobadas por **7 días**, por instrucción del 1 de septiembre de 2026.
- Decisión del turno: el lease deja de estar ligado al turno y `abrir_sesion_caja_v4` se incorpora a la lista offline para que la autonomía efectiva pueda alcanzar los 7 días.
- Decisión de reemplazo: usar el lease nuevo para operaciones nuevas es higiene del cliente; el servidor valida históricamente el lease referenciado y no infiere el instante de recepción del reemplazo.
- Decisión legacy de sesión: las filas sin sesión se agrupan en lecturas sintéticas visibles sólo en Resumen y nunca se atribuyen por fecha a una sesión real ni al arqueo interactivo.
- Decisión de reportes: Movimientos en cuentas continúa por fecha de negocio y fuera del filtro de sesión; las anulaciones y llegadas tardías se representan como eventos sin reescribir cierres.
- Decisión de conciliación: la cola declara `entidad`/`entidad_id`; la alerta por múltiples raíces provisionales es informativa, no bloquea y no constituye un límite duro durante la beta.

## 20. Fuera de alcance de F5

- soporte multicomercio para una misma identidad;
- protección criptográfica del cliente local;
- integración/migración final del sistema completo;
- funciones de F6.
