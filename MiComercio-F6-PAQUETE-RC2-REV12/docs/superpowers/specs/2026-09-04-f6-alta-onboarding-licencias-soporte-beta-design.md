# F6 — Alta, onboarding, licencias, soporte y beta real

Fecha: 4 de septiembre de 2026  
Estado: diseño aprobado y listo para planificar  
Base de referencia: F5 rev10, build `5.0.0-f5-rc2`  
Servidor de desarrollo y piloto: Supabase QA `qrvdfqpxutymmlcplsal`

## 1. Objetivo

F6 convierte la base técnica de F5 en un circuito operativo completo para incorporar y acompañar un comercio: alta interna mediante invitación, configuración inicial reanudable, licencia beta de siete días, soporte auditable y un piloto real controlado.

F6 se desarrolla y verifica sobre QA. No despliega a producción ni ejecuta migraciones productivas parciales. Una vez aprobado el piloto de siete días se congela el candidato y se prepara una única integración y migración conjunta de las funciones previas, F5 y F6.

## 2. Decisiones cerradas

- La beta usa alta interna por invitación; no habrá autoservicio público en este incremento.
- La invitación se puede compartir por WhatsApp, pero F6 no integra la API de WhatsApp: genera un enlace seguro para compartir.
- El dueño se registra con su propio correo y contraseña o inicia sesión si ya posee una cuenta compatible.
- La provisión del comercio es un núcleo independiente del canal de adquisición. El autoservicio futuro reutilizará ese mismo núcleo y sólo sustituirá quién emite la invitación o autorización inicial.
- El asistente inicial es reanudable y guarda el progreso en servidor.
- La comprobación final del asistente es una simulación sin efectos en ventas, caja, stock, numeración ni outbox.
- Existe un único plan beta. La licencia dura exactamente siete días y es independiente de cobros y facturación.
- Extensión manual y compensación por pausa comparten un único saldo adicional máximo de siete días por licencia; una solicitud que excede el remanente se rechaza completa y nunca se recorta.
- Pausar una licencia no detiene su reloj. El vencimiento tiene prioridad sobre la pausa y se calcula en cada evaluación del servidor, sin depender de un job.
- La licencia comercial y el lease personal F5 son controles diferentes aunque ambos tengan una duración nominal de siete días.
- El equipo de soporte puede ejecutar acciones técnicas y administrativas seguras, pero no modificar directamente ventas, caja, stock ni saldos.
- Toda acción de soporte exige actor, motivo, fecha y valores anterior/posterior.
- La beta real se realiza con un único comercio durante siete días.
- Cada turno de caja puede cerrarse de forma independiente. Pueden existir varios turnos cerrados en un mismo día y el resumen diario los consolida sin mezclarlos.
- Finalizada y aprobada la beta, se realiza la integración y migración conjunta; no se repiten migraciones productivas entre incrementos.

## 3. Límites y relación con F5

F6 reutiliza como autoridades canónicas:

- `comercios` y `comercio_configuracion` para identidad y configuración;
- `comercio_miembros` para dueño, administrador, empleado y permisos;
- `comercio_licencias` y la evaluación F3.3 para operabilidad comercial;
- `comercio_dispositivos` y los leases F5 para autoridad offline;
- `caja_sesiones`, sus segmentos y cierres para los turnos;
- la cola única F5 de operaciones, sesiones y cierres que requieren revisión o conciliación.

F6 no vuelve a introducir autoridad mediante PIN, HTML, configuración local ni metadatos editables de Auth. Tampoco crea una segunda cola de excepciones ni otra tabla paralela de membresías o licencias.

Antes del piloto deben quedar resueltos tres límites declarados por F5 rev10: el recorrido persistente en navegador de un comercio dedicado hasta `v4_only`, la reproducción del baseline F2–F5 desde cero en un entorno descartable y el comportamiento de `verificarPin()` en un dispositivo nuevo sin `pinHash` ni `pinDuenio`. Ese tercer punto no eleva autoridad de servidor, pero elimina la barrera local ante acceso físico y no puede entrar sin resolución a un piloto que exige ausencia de fallas críticas de seguridad. F6 puede desarrollarse en QA mientras se preparan esas evidencias, pero el comercio piloto no comienza sin las tres.

La barrera de preparación F4.3 conserva durante esta beta la limitación registrada en F5 §8: al tomar locks de relación sobre tablas compartidas puede detener brevemente escrituras de otros comercios. Es aceptable únicamente porque el piloto es monocomercio y la ventana permanece acotada a un máximo de 15 segundos. Antes de operar como producto multi-tenant se debe reemplazar por particionado, locks por fila o una barrera lógica por `comercio_id`; F6 no presenta `LOCK TABLE` como solución definitiva.

## 4. Arquitectura

F6 se divide en cinco unidades con límites explícitos:

1. **Invitaciones y provisión:** autoriza una única alta y crea el conjunto inicial del comercio de forma idempotente.
2. **Onboarding:** mantiene el progreso y aplica cambios iniciales únicamente mediante operaciones canónicas del servidor.
3. **Licencias:** gobierna la ventana comercial de la beta sin conocer medios de pago.
4. **Soporte y monitoreo:** presenta un modelo de lectura acotado y ejecuta sólo comandos auditados.
5. **Piloto:** define escenarios, evidencia y gates de salida; no agrega un camino técnico alternativo.

Los clientes llaman funciones públicas pequeñas. Las decisiones de autoridad y las escrituras compuestas viven en funciones privadas transaccionales con privilegios mínimos, `search_path` fijo y permisos explícitos. Las operaciones administrativas que requieren credencial de servicio se aíslan en Edge Functions y nunca exponen esa credencial al navegador.

## 5. F6.1 — Alta interna mediante invitación

### 5.1 Emisión

Un operador interno autorizado carga el nombre inicial del comercio y el contacto del dueño. El servidor crea una invitación con:

- identificador no adivinable;
- hash del token, nunca el token en texto claro;
- estado `pendiente`, `consumida`, `vencida` o `revocada`;
- fecha de emisión y vencimiento;
- operador emisor y motivo;
- datos mínimos necesarios para la provisión.

La invitación es de un solo uso y, para la beta, vence a los siete días. Reenviar conserva la invitación si sigue vigente; regenerarla revoca el token anterior y crea uno nuevo. El enlace se copia para compartir por WhatsApp u otro medio sin almacenar el mensaje ni depender de un proveedor de mensajería.

### 5.2 Registro y consumo

El dueño abre el enlace, crea su cuenta con correo y contraseña o inicia sesión. La invitación sólo se consume después de tener una identidad Auth válida.

El núcleo de provisión verifica en una misma operación lógica:

1. token vigente y no consumido;
2. identidad autenticada;
3. ausencia de otra membresía activa incompatible con la restricción beta de F5;
4. unicidad e idempotencia de la provisión;
5. creación del comercio, configuración, membresía `duenio`, caja inicial, licencia `pendiente` y estado de onboarding;
6. consumo de la invitación y auditoría.

Si la misma persona repite una solicitud ya confirmada, recibe el mismo comercio y no se duplica ninguna fila. Si Auth se creó pero la provisión no terminó, el token no se consume y el flujo se puede reintentar. Un usuario diferente no puede reclamar una invitación ya ligada o consumida.

### 5.3 Preparación para autoservicio futuro

El núcleo de provisión no conoce soporte, WhatsApp ni pagos. Recibe una autorización de alta ya validada y devuelve el comercio creado. Un autoservicio futuro podrá generar esa autorización después de sus propias validaciones, reutilizando la misma provisión, onboarding, licencia y auditoría.

## 6. F6.2 — Asistente inicial reanudable

### 6.1 Flujo

El dueño completa estas etapas:

1. datos del comercio;
2. caja inicial;
3. módulos y configuración operativa;
4. productos iniciales;
5. empleados, opcional;
6. clientes, opcional;
7. comprobación final.

Los primeros cuatro pasos son obligatorios. Debe existir al menos una caja activa y un producto activo antes de completar el asistente. Empleados y clientes pueden omitirse y cargarse más adelante.

### 6.2 Persistencia y reanudación

El servidor conserva estado `no_iniciado`, `en_curso` o `completo`, el último paso confirmado y las marcas de actualización. Cada paso usa una clave de idempotencia y sólo se marca completo después de confirmar sus escrituras canónicas.

Cerrar el navegador, perder conexión o recibir un error no borra lo ya confirmado. Al regresar, el dueño ve el último paso completo y puede continuar. El alta y onboarding inicial requieren conexión; la capacidad offline empieza cuando la licencia está activa y el dispositivo recibió los contratos F3/F5 correspondientes.

Mientras falten pasos obligatorios, el comercio no entra al POS operativo. Sólo se permiten las operaciones estrechas del onboarding y la lectura de lo ya configurado.

### 6.3 Comprobación final sin efectos

La última pantalla verifica:

- identidad y membresía del dueño;
- caja activa;
- configuración y módulos coherentes;
- catálogo mínimo utilizable;
- posibilidad de construir una venta de ejemplo y calcular su medio de pago;
- estado de sincronización y compatibilidad del cliente.

La simulación trabaja en memoria o mediante validación explícitamente no persistente. No abre ni cierra una sesión real, no crea venta, pago, movimiento, ticket, ledger u outbox, no incrementa numeración y no modifica stock ni caja.

Cuando la comprobación final pasa, el onboarding cambia a `completo` y se activa la licencia beta.

## 7. F6.3 — Plan y licencia beta

### 7.1 Modelo y estado efectivo

La beta tiene un único plan `beta`. El contrato público de licencia expone `estado_efectivo` con estos valores cerrados:

- `pendiente`: comercio provisionado, onboarding todavía incompleto;
- `activa`: permite operar según permisos y leases;
- `pausada`: bloqueo administrativo reversible;
- `vencida`: terminó su vigencia, cualquiera sea el estado administrativo almacenado;
- `cancelada`: baja explícita; no se reactiva sin emitir una licencia nueva.

La tabla base conserva `estado_administrativo`, las fechas de vigencia y las pausas. El estado autoritativo se obtiene siempre mediante una función/vista canónica que calcula `estado_efectivo`; la tabla base no se expone al navegador ni se considera contrato de lectura.

La licencia beta recién provisionada se guarda como `pendiente`, con `valid_from IS NULL` y `valid_until IS NULL`; la vigencia comienza únicamente al completar el onboarding. Una licencia `activa` o `pausada` exige ambas fechas y `valid_until > valid_from`. Una licencia `cancelada` conserva la forma temporal que tenía al cancelarse: puede mantener ambas fechas nulas si nunca se activó, o un par válido si ya había comenzado. Nunca se admite una sola fecha informada. El `CHECK` de la tabla debe representar estas transiciones y no puede impedir la provisión inicial.

F6 elige evaluación perezosa, no un job de vencimiento. Si una fila conserva `estado_administrativo='pausada'` pero el reloj del servidor alcanzó `valid_until`, la función devuelve inmediatamente `estado_efectivo='vencida'` y `puedeOperar=false` sin escribir durante la lectura. Todas las funciones de autorización y mutación llaman a esa evaluación antes de decidir. El panel muestra únicamente el estado efectivo, por lo que nunca presenta como pausada una licencia ya vencida.

La precedencia es: `cancelada`; luego `vencida` cuando `ahora >= valid_until`; luego `pausada`; finalmente `pendiente` o `activa`. Ninguna autorización depende de que un proceso programado haya actualizado una fila.

### 7.2 Duración

La licencia se activa al completar el onboarding y dura exactamente `604800` segundos contados por el servidor. Cruzar un cambio horario no acorta ni alarga la semana. La interfaz presenta inicio, vencimiento y tiempo restante en la zona horaria del comercio.

El `offlineValidUntil` de la licencia nunca puede superar su `valid_until`. El lease personal F5 conserva su propio `issued_at` y `valid_until`; poder escribir offline exige que ambos controles estén vigentes, además de no existir otros bloqueos.

### 7.3 Vencimiento, pausa y reactivación

Una licencia no operable bloquea nuevas escrituras, pero mantiene acceso autenticado de sólo lectura, respaldo y exportación. Las operaciones locales pendientes no se borran: quedan identificadas y sólo se vuelven a procesar cuando una transición válida restablece la operabilidad.

Soporte puede pausar, reactivar o extender una licencia con motivo obligatorio. Pausar no desplaza `valid_until`: el tiempo continúa corriendo. Si el vencimiento se alcanza durante la pausa, el estado efectivo pasa a `vencida` por la precedencia de §7.1.

Cada licencia dispone de un saldo adicional total de `604800` segundos. Extensiones manuales y compensaciones por pausa consumen ese mismo saldo, registrado como `extension_used_seconds` y protegido por lock transaccional de la licencia/comercio. El máximo de 14 días significa vigencia autorizada acumulada —siete días base más siete adicionales—, no 14 días corridos desde la primera activación: el intervalo no operable entre un vencimiento y una reactivación posterior no consume vigencia ni habilita operaciones.

- Una extensión manual solicita entre uno y siete días enteros; cada día equivale a `86400` segundos.
- Una compensación solicita exactamente la duración de la pausa calculada con timestamps del servidor; no usa la duración declarada por el cliente.
- Cada plazo aprobado se suma desde el mayor valor entre `valid_until` y el instante de la acción.
- Antes de modificar estado o fechas, el servidor comprueba que `extension_used_seconds + requested_seconds <= 604800`.
- Si la solicitud supera el saldo restante, rechaza la operación completa con `F6_EXTENSION_SUPERA_SALDO`, informa solicitado y remanente y no recorta, reactiva ni modifica fechas parcialmente.
- La idempotencia impide consumir dos veces el saldo al reintentar el mismo comando.

Al reactivar una licencia pausada todavía vigente, soporte elige explícitamente entre no compensar o compensar toda la pausa. Sin compensación conserva el vencimiento. Con compensación sólo se reactiva si la duración completa entra en el saldo restante.

Una licencia que venció mientras estaba pausada ya no acepta el comando de reactivación de `pausada`: utiliza la transición de `vencida`, que debe asignar nueva vigencia mediante una extensión manual o una compensación completa que entre en el mismo saldo. `reactivate_without_compensation` evalúa primero el estado efectivo y, si ya es `vencida`, rechaza sin cambios con `F6_REACTIVAR_REQUIERE_VIGENCIA`. Una extensión aplicada a esa licencia asigna la nueva vigencia desde el instante del servidor y la deja administrativamente `activa` en la misma transacción; una compensación completa hace lo mismo sólo si toda la pausa entra en el saldo. Si no queda saldo suficiente, esta licencia no puede recibir más de los 14 días de vigencia autorizada acumulada y el piloto debe cerrarse o abrir una nueva decisión de producto. `cancelada` es terminal y requiere una licencia nueva.

No hay cobro, suscripción, tarjeta ni facturación fiscal en F6. Una integración futura de pagos emitirá comandos sobre estas mismas transiciones; no reescribirá el modelo de acceso ni usará el número local de ticket como numeración fiscal.

## 8. F6.4 — Soporte y monitoreo

### 8.1 Identidad y alcance

Los operadores de soporte son identidades internas separadas de las membresías comerciales. No se agregan como dueños ni administradores del comercio y no pueden suplantar a sus usuarios.

El panel muestra únicamente la información necesaria para diagnosticar:

- comercio y avance del onboarding;
- estado y tiempo restante de licencia;
- build informado por cada dispositivo;
- última actividad y última sincronización;
- dispositivos activos o revocados y estado de lease;
- turnos abiertos, provisionales o pendientes de conciliación;
- cantidad de operaciones pendientes, fallidas o pausadas;
- estado F4/F5 de migración, proyección y `v4_only`;
- alertas por divergencia, raíces provisionales y respaldos.

La versión informada por el cliente es telemetría y no autoridad criptográfica. El gate de compatibilidad del piloto compara el build aprobado con el observado y falla cerrado ante ausencia o diferencia.

### 8.2 Acciones permitidas

Soporte puede:

- reenviar, regenerar o revocar una invitación;
- pausar, reactivar, extender o cancelar una licencia;
- revocar un dispositivo o familia de leases, respetando la confirmación F5 sobre posible pérdida de outbox;
- solicitar un nuevo intento de sincronización;
- generar un paquete diagnóstico sin secretos;
- agregar notas y derivar una conciliación al dueño o administrador.

Soporte no puede:

- crear, editar, anular o borrar ventas;
- modificar caja, cierres, stock, movimientos, fiado o saldos;
- aprobar en nombre del comercio una conciliación que cambie información comercial;
- leer contraseñas, tokens, PIN, claves de servicio ni payloads innecesarios;
- ejecutar DML directo para evitar los comandos auditados.

Si una solución cambia datos comerciales, el panel explica el caso y lo deja pendiente para un dueño o administrador autorizado. El servidor aplica esa resolución por la RPC canónica correspondiente.

### 8.3 Auditoría y alertas

Cada comando registra operador, comercio, acción, motivo, instante, resultado, valores anterior/posterior e identificador de correlación. Los fallos también quedan auditados. La auditoría es append-only y no admite `UPDATE`, `DELETE` ni `TRUNCATE` para los roles de aplicación.

El panel usa tres niveles:

- **rojo:** pérdida potencial de operación, seguridad, incompatibilidad de build o inconsistencia económica sin resolver;
- **amarillo:** retraso de sincronización, licencia próxima a vencer, raíz provisional o intervención pendiente;
- **informativo:** actividad normal y acciones completadas.

El comerciante y soporte ven el mismo código de incidente. No existen procesos automáticos que resuelvan discrepancias económicas modificando datos.

### 8.4 Límites de frecuencia y transporte

Todas las superficies F6 que usan la IP como dimensión pasan por Edge Function. El navegador no invoca directamente las funciones privadas de preflight o mutación:

| Superficie | Transporte | Límites |
|---|---|---|
| Validar o consumir invitación | Edge Function `f6-invitations` | 5 intentos/15 min por token+IP, 20/1 h por token y 50/1 h por IP |
| Emitir o regenerar invitación | Edge Function `f6-invitations`, actor interno autenticado | 20/1 h por operador y 5/1 h para el mismo contacto normalizado |
| Pausar, reactivar, extender o cancelar licencia | Edge Function `f6-support`, actor interno autenticado | 10/1 h por operador y 5/1 h por comercio |
| Consultar el panel de soporte | Edge Function `f6-support`, actor interno autenticado | 120/5 min por operador y 300/5 min por IP |

Las Edge Functions importan directamente `clientIp()` desde el módulo compartido corregido por F5 rev8 y presente en rev10, `supabase/functions/_shared/f5-auth-core.mjs`. F6 no copia ni reimplementa esa resolución. Se conserva el uso de `cf-connecting-ip` y, como fallback, el extremo derecho de `x-forwarded-for`; el extremo izquierdo controlable por el cliente no participa del límite.

Cada Edge Function llama un preflight privado en Postgres que toma los locks correspondientes, actualiza contadores de forma atómica y devuelve JSONB `{limited, retry_after}` siguiendo el contrato F5. Cuando `limited=true`, la Edge Function lo traduce a HTTP `429` y al header `Retry-After`. Las RPC privadas no tienen permiso de ejecución directa para el navegador; las pruebas SQL que las invoquen observan el JSONB, no esperan un código HTTP.

## 9. F6.5 — Piloto real de siete días

### 9.1 Alcance

El piloto usa un único comercio dedicado en QA con operaciones reales controladas. No incorpora varios comercios ni habilita autoservicio público. Antes de comenzar se guarda respaldo verificable, se registra el build exacto y pasan los gates de baseline F2–F5 y navegador `v4_only`.

### 9.2 Cronograma

- **Día 0:** emitir invitación, registrar al dueño, completar onboarding, verificar el respaldo y activar la licencia.
- **Días 1 a 6:** uso cotidiano de ventas, caja, stock, empleados y reportes; ejercicios controlados de corte, reconexión, revocación y drenaje tardío.
- **Día 7:** cerrar los turnos que correspondan, drenar operaciones pendientes, exportar evidencia y ejecutar la revisión de salida.

Se guarda evidencia diaria de estado de licencia, sincronización, operaciones pendientes, turnos, alertas y acciones de soporte. No se copian secretos ni datos personales innecesarios.

### 9.3 Cierre turno por turno

El cierre pertenece a una sesión o a su segmento, no al día calendario. Por lo tanto:

- cada turno se abre y se cierra individualmente;
- cerrar un turno no cierra el día ni invalida el lease F5;
- si la autoridad sigue vigente, puede abrirse el turno siguiente, también offline según F5;
- pueden cerrarse varios turnos durante el mismo día;
- cada cierre conserva fondo inicial, movimientos, medios de pago, total esperado, total declarado, diferencia, actor, dispositivo y estado de conciliación propios;
- una sesión o segmento no provisional admite un solo cierre efectivo;
- un cierre tardío o de una sesión provisional conserva su ajuste/conciliación y nunca se suma al arqueo de otro turno.

Caja muestra solamente el turno activo seleccionado. Resumen lista los turnos del día por separado y ofrece además un consolidado diario de lectura. Ese consolidado no sustituye cierres, no genera un cierre adicional y no mezcla diferencias ni fondos iniciales entre sesiones.

### 9.4 Condiciones de salida

El piloto se aprueba únicamente si:

- no existe pérdida de datos ni operación válida descartada;
- no queda ninguna diferencia económica sin explicación o flujo de resolución;
- todas las operaciones offline se drenan a su sesión, segmento o ajuste correcto;
- los cierres turno por turno funcionan online, offline y con varios turnos en un día;
- la licencia vence, bloquea y se reactiva según el contrato sin borrar información;
- no hay fallas críticas de seguridad o autoridad;
- respaldo y recuperación fueron comprobados;
- el dueño completa los flujos principales sin intervención técnica directa;
- las regresiones F5 y las nuevas pruebas F6 pasan con evidencia reproducible.

Un problema crítico detiene el gate, se corrige y obliga a repetir el escenario afectado. Soporte puede extender la licencia de forma auditada para completar esa repetición. Una incidencia menor de presentación puede quedar registrada para después sólo si no afecta autoridad, dinero, stock, sincronización, respaldo ni comprensión del cierre.

## 10. Errores y recuperación

- **Invitación inválida, vencida o revocada:** no revela si existe un comercio; permite pedir un nuevo enlace a soporte.
- **Repetición o carrera al consumir:** la idempotencia devuelve el resultado ya creado al mismo dueño y rechaza otra identidad.
- **Fallo parcial de onboarding:** no avanza el paso; conserva los pasos ya confirmados y permite reanudar.
- **Pérdida de conexión durante onboarding:** no habilita escrituras offline de instalación; muestra el último estado confirmado.
- **Licencia no operable:** conserva lectura, exportación y outbox; muestra causa y acción concreta.
- **Extensión o compensación sin saldo:** rechaza el comando completo con `F6_EXTENSION_SUPERA_SALDO`; no recorta el plazo ni cambia el estado.
- **Build ausente o incompatible en piloto:** bloquea el gate del piloto y genera alerta roja; no se maquilla como problema de red.
- **Cierre duplicado:** el servidor rechaza el segundo cierre efectivo de la misma sesión/segmento e informa el cierre existente.
- **Conflicto o llegada tardía:** usa la cola y los ajustes F5; soporte diagnostica y el dueño/administrador decide cualquier cambio comercial.
- **Fallo de comando de soporte:** no se aplica parcialmente; queda un evento de auditoría fallido con correlación.

Los mensajes para el comerciante son simples y accionables. El código técnico visible en el detalle coincide con el recibido por soporte.

## 11. Seguridad y privacidad

- Todas las tablas expuestas aplican RLS; los objetos internos permanecen fuera del acceso de `anon` y `authenticated` salvo wrappers explícitos.
- Los tokens de invitación se almacenan hasheados y se comparan en servidor.
- Las funciones con privilegios elevados fijan `search_path = ''`, califican objetos, revocan `PUBLIC` y conceden sólo lo necesario.
- Las invitaciones y soporte aplican exactamente los límites y transportes de §8.4; las respuestas públicas no permiten enumerar usuarios o comercios.
- El paquete diagnóstico excluye tokens, contraseñas, PIN, claves, datos completos de tarjetas y contenido comercial que no sea necesario para el incidente.
- La auditoría crítica es append-only y queda protegida también contra `TRUNCATE`.
- Después de cada cambio SQL se ejecutan los asesores de seguridad y rendimiento de Supabase.

## 12. Estrategia de pruebas

F6 agrega pruebas sin reemplazar las regresiones existentes de F5:

1. invitación válida, vencida, revocada, regenerada y reutilizada;
2. provisión idempotente, carrera de consumo y restricción de membresía activa;
3. reanudación del asistente después de recarga, corte y error parcial;
4. verificación de que la simulación final produce cero ventas, cierres, movimientos, tickets, outbox o cambios de stock;
5. activación y vencimiento exacto a siete días, incluso atravesando DST;
6. precedencia `cancelada`/`vencida`/`pausada`, incluida una fila pausada que cruza `valid_until` sin ejecutar ningún job;
7. saldo compartido entre múltiples extensiones y compensaciones, rechazo total sin recorte, concurrencia e idempotencia;
8. licencia no operable con lectura/exportación disponible y pendientes preservadas;
9. denegación de cada acción comercial directa intentada por soporte;
10. auditoría completa de comandos exitosos, fallidos y concurrentes;
11. límites exactos por dimensión, HTTP `429` de Edge, JSONB del preflight y regresión de `clientIp()` contra XFF izquierdo/derecho;
12. cierre de dos o más turnos del mismo día, cada uno con arqueo independiente y resumen diario correcto;
13. cierre offline, apertura del turno siguiente, drenaje ordenado y conciliación de segmentos provisionales;
14. gate del candidato F6 `6.0.0-f6-rc1` (base declarada `5.0.0-f5-rc2`), `v4_only`, respaldo, recuperación y paquete diagnóstico sin secretos;
15. bloqueo del piloto mientras `verificarPin()` permita abrir sin barrera local un dispositivo nuevo.

Las pruebas SQL se ejecutan en transacciones descartables sobre un baseline reproducible. Las Edge Functions se prueban con usuarios reales de QA y roles autorizados/denegados. El navegador ejecuta el flujo completo desde invitación hasta cierre, incluyendo recarga, modo offline y reconexión. El verificador del paquete compara cobertura del manifiesto, cantidad real de pruebas e identidad cruzada de artefactos; no imprime totales fijos no medidos.

## 13. Implementación e integración

F6 se implementará en incrementos verificables:

1. esquema y núcleo idempotente de invitación/provisión;
2. asistente reanudable y simulación final;
3. estados y transiciones de la licencia beta de siete días;
4. panel, comandos y auditoría de soporte;
5. cierres turno por turno, observabilidad y regresiones del piloto;
6. preparación, ejecución y evaluación de la beta real.

Las migraciones de cada incremento se conservan como artefactos reproducibles y se aplican sólo en QA para desarrollar y probar. Eso no contradice la decisión de una única migración final: producción recibe después del piloto un conjunto consolidado, ordenado y probado de funciones previas, F5 y F6.

Tras la aprobación del piloto se congela el build candidato, se genera un respaldo, se ejecutan preflights de datos y compatibilidad, se ensaya la migración conjunta sobre una copia y recién entonces se solicita autorización para aplicarla al entorno productivo. El final de la semana no dispara un despliegue automático.

## 14. Fuera de alcance

- alta pública autoservicio;
- cobros, suscripciones, tarjetas o facturación;
- numeración fiscal;
- soporte multicomercio para una misma identidad;
- incorporación simultánea de varios comercios durante la beta;
- modificación directa de datos comerciales por soporte;
- migración o despliegue productivo antes de aprobar el piloto;
- reemplazo de Supabase Auth o de los contratos centrales F5.

## 15. Criterios de aceptación resumidos

- Un enlace de invitación sólo puede provisionar una vez y nunca expone su token almacenado.
- La provisión reintentada no duplica comercio, dueño, caja, licencia ni onboarding.
- El dueño puede abandonar y reanudar el asistente sin perder pasos confirmados.
- El chequeo final no altera ningún dato operativo.
- La semana de licencia comienza al completar el onboarding y dura 604800 segundos de servidor.
- `estado_efectivo` vence por evaluación del servidor aunque el estado administrativo almacenado continúe pausado; ningún permiso depende de un job.
- Extensión manual y compensación comparten 604800 segundos adicionales; cualquier exceso se rechaza entero sin modificación parcial.
- Licencia y lease se evalúan por separado y ambos deben permitir la escritura offline.
- Soporte no puede suplantar usuarios ni modificar datos comerciales.
- Cada acción de soporte queda auditada, incluidas las fallidas.
- Cada turno tiene su propio cierre; varios turnos del día se mantienen separados y el consolidado diario es sólo una lectura.
- Cerrar un turno no cierra el día, no corta el lease y no impide abrir el siguiente si existe autoridad.
- El piloto no pasa con pérdida de datos, diferencias inexplicadas, fallas críticas o pendientes sin destino.
- El piloto no comienza hasta cerrar el gate `v4_only`, el baseline desde cero y el comportamiento de `verificarPin()` en dispositivos nuevos.
- La integración y migración conjunta sólo se prepara después de la aprobación explícita del piloto.
