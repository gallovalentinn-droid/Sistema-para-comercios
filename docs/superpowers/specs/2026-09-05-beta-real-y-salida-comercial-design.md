# Diseño de la beta real de siete días y salida comercial

Fecha: 2026-09-05  
Estado: aprobado en conversación; pendiente de plan de ejecución  
Repositorio público existente: `gallovalentinn-droid/Sistema-para-comercios`  
Dominio existente: `micomercio.ar`  
Candidato: F6 RC1-REV2  
Build cliente exigido: `6.0.0-f6-rc1`  
Build base exigido: `5.0.0-f5-rc2`

## 1. Objetivo y decisión de salida

El objetivo es incorporar cuanto antes un único comercio real para que use durante siete días todas las funciones disponibles del sistema con sus propios datos, sin alterar el sistema público actual hasta completar los controles previos.

La beta dura siete días corridos desde la activación de la licencia, exactamente `604800` segundos medidos por el servidor. No existe una segunda beta obligatoria: si el piloto cumple todos los criterios de salida, MiComercio se considera funcionalmente listo y comienza su comercialización.

La aprobación de la beta habilita la preparación y ejecución controlada de la integración final F5+F6 y el inicio comercial. No permite omitir las verificaciones de migración, respaldo, dominio, seguridad o integridad definidas en este documento.

## 2. Alcance

El comercio piloto utiliza todas las funciones del candidato:

- alta del dueño mediante invitación interna;
- asistente inicial reanudable;
- productos, rubros, stock y pedidos;
- ventas y todos los medios de pago, con `Transferencia / QR` unificado;
- caja y cierres independientes por turno;
- resumen diario de sólo lectura;
- clientes, fiado y pagos;
- egresos;
- Movimientos en cuentas por día;
- empleados, roles y permisos;
- operación offline autorizada por lease y sincronización posterior;
- licencia beta, pausa, reactivación, extensión y soporte auditable.

La aplicación sigue siendo no fiscal. Durante la beta y después de ella el comercio conserva por separado el mecanismo fiscal exigido legalmente. El dueño acepta expresamente esta limitación antes de cargar datos reales.

## 3. Arquitectura de publicación

### 3.1 Repositorio y dominio

Se conserva el repositorio existente y su configuración de dominio. No se crea otro repositorio y no se modifica `CNAME`.

El repositorio permanece público durante esta etapa porque el plan gratuito de GitHub no sostiene el sitio de GitHub Pages al volver privado el repositorio. Por esa razón sólo se publica el cliente web necesario para ejecutar la beta. No se suben al repositorio público:

- migraciones SQL;
- Edge Functions internas;
- respaldos;
- evidencias con datos reales;
- paquetes completos de QA;
- credenciales, tokens, claves o identidades internas;
- diagnósticos comerciales completos.

El commit local que contiene el paquete técnico F6 no se empuja tal cual al repositorio público. La publicación se prepara desde una rama limpia basada en la versión pública correspondiente y contiene únicamente los archivos públicos autorizados.

### 3.2 Rutas públicas

- `micomercio.ar/clientes/` continúa intacto mientras se ejecutan los controles previos y el piloto.
- La beta se publica en `micomercio.ar/beta/`.
- `/beta/` no se enlaza desde la portada ni desde `/clientes/`.
- Entrar a la URL no otorga acceso: se exige autenticación e invitación válida.
- El service worker y los nombres de caché de `/beta/` son distintos de los de `/clientes/` para impedir que una versión reemplace a la otra.
- El cliente beta falla cerrado si no observa exactamente el build F6 aprobado.

### 3.3 Servidor

La beta se ejecuta en el proyecto Supabase QA ya preparado. Producción no recibe migraciones parciales durante el piloto. El origen permitido incluye exclusivamente el dominio y la ruta publicados, sin comodines innecesarios.

El servidor conserva autoridad sobre identidad, membresía, permisos, leases, licencias, invitaciones y transiciones F4.3. El HTML, el PIN y la configuración local no otorgan autoridad por sí mismos.

## 4. Condiciones obligatorias antes de abrir la beta

Todos los puntos deben estar en PASS. No existe aprobación parcial.

1. Corregir o sustituir explícitamente `verificarPin()` en un dispositivo nuevo. El comportamiento por el cual devuelve acceso cuando faltan `pinHash` y `pinDuenio` no puede entrar al piloto.
2. Llevar un comercio dedicado hasta `v4_only` mediante el recorrido real F3.4 → F4.1 → F4.2 → F4.3 desde un navegador, y verificar el estado persistido y la recarga posterior.
3. Reproducir el baseline F2–F6 desde cero en un entorno limpio, sin depender de objetos manuales desconocidos.
4. Repetir en fresco las 102 pruebas locales y las 14 suites SQL acumuladas.
5. Probar con autenticación real la emisión y el consumo único de una invitación, el alta del dueño, la interrupción y reanudación del asistente y la activación de la licencia por `604800` segundos exactos.
6. Abrir y cerrar dos turnos el mismo día. Cada turno debe tener su propio cierre y el total diario debe ser solamente un consolidado informativo.
7. Probar en forma controlada una venta, un pago de fiado, un egreso y un cierre sin conexión. Al reconectar, la cola debe drenarse y cada operación debe conservar la sesión o el segmento correcto.
8. Ejecutar las carreras concurrentes relevantes: doble consumo de una invitación y dos extensiones simultáneas de licencia. Sólo una transición válida puede ganar y el saldo adicional nunca supera `604800` segundos.
9. Verificar la URL, el origen permitido, la separación de cachés y la identidad exacta del build observado.
10. Crear un respaldo inicial verificable y demostrar su restauración antes de ingresar datos comerciales irreemplazables.

Si un punto falla, la beta no comienza. La documentación, una captura o un resultado autorreportado no reemplazan la evidencia del sistema real.

## 5. Incorporación del comercio

El alta sigue este orden:

1. El soporte interno emite una invitación de un solo uso para el dueño.
2. El dueño se autentica y consume la invitación.
3. Completa el asistente reanudable: identidad del comercio, configuración operativa, caja, producto inicial y pasos opcionales admitidos.
4. La simulación final comprueba las precondiciones sin crear una venta, movimiento ni cierre.
5. El servidor activa la licencia de siete días.
6. Se cargan productos, rubros, stock inicial, clientes, fiado y fondos iniciales de caja.
7. Se obtiene el respaldo inicial y se registran conteos y hashes de control.
8. El dueño confirma que el sistema es no fiscal y recibe instrucciones simples de soporte y recuperación.

Los datos de la beta son datos reales y deben preservarse. No se usa información ficticia una vez iniciado el período operativo.

## 6. Operación durante los siete días

### 6.1 Turnos y cierres

Cada apertura de caja crea un turno identificable. Cada turno puede cerrarse por separado, incluso cuando existen varios turnos el mismo día. Cerrar un turno no cierra el día, no elimina cierres anteriores y no invalida por sí solo el lease vigente.

El resumen diario lista los cierres individuales y presenta un consolidado de sólo lectura. Nunca utiliza el total diario como sustituto de un cierre de turno ni suma las diferencias de caja como si fueran ventas.

### 6.2 Uso de funciones

Durante la semana el comercio debe utilizar todas las áreas incluidas en el alcance. El primer día se opera conectado para establecer una referencia verificable. Después se realiza al menos un corte de conexión controlado que incluya las cuatro operaciones offline autorizadas y la recuperación posterior.

Antes de cerrar caja sin conexión se muestra una advertencia específica: no debe confundirse con una confirmación rutinaria y debe explicar con claridad las consecuencias operativas.

### 6.3 Control diario

Al final de cada jornada se registran:

- turnos abiertos y cierres individuales;
- ventas y totales por efectivo, tarjeta y `Transferencia / QR`;
- movimientos y variación de stock;
- fiado, pagos y saldos;
- egresos;
- cantidad de operaciones pendientes en outbox y hora de última sincronización;
- conciliaciones pendientes o resueltas;
- estado efectivo de la licencia y de la autoridad offline;
- acciones realizadas por soporte;
- incidentes y cortes de conexión;
- respaldo diario y su hash.

La supervisión usa conteos, estados e identificadores mínimos. No copia payloads comerciales completos a informes ni expone credenciales, PIN, tokens o correos internos.

## 7. Seguridad y límites de soporte

Cada persona usa su propia cuenta y sus permisos. No se comparten credenciales.

El soporte interno puede diagnosticar, pausar o reactivar la licencia, aplicar una extensión o compensación dentro del saldo, revocar dispositivos y agregar contexto de conciliación. No puede crear, editar ni borrar ventas, stock, caja, cierres, fiado o saldos comerciales.

Las mutaciones de soporte exigen motivo, confirmación específica, idempotencia y auditoría append-only. Las extensiones y compensaciones comparten un máximo adicional de siete días. Una solicitud que supere el remanente se rechaza completa, sin recorte silencioso.

El estado efectivo de licencia se calcula de forma perezosa: una licencia administrativamente pausada cuyo `valid_until` quedó en el pasado se considera vencida al evaluar operabilidad, aunque la fila conserve el estado administrativo hasta una transición explícita. El estado efectivo `vencida` prevalece sobre `pausada`.

## 8. Recuperación y criterio de detención

Se congela la escritura y el comercio pasa a sólo lectura ante cualquiera de estas situaciones:

- diferencia inexplicable de dinero o stock;
- pérdida o duplicación de una operación;
- cierre duplicado o atribuido al turno incorrecto;
- operación válida sin sesión o segmento de destino;
- acceso sin permiso o evasión de autoridad;
- outbox que no termina de drenar después de recuperar conexión;
- respaldo inexistente o que no puede restaurarse;
- corrupción de caché que comprometa datos pendientes;
- build diferente del aprobado.

Ante un incidente no se borra caché, almacenamiento local ni outbox. Se preservan identificadores, fechas, estado de sincronización y respaldo; se diagnostica; se corrige hacia adelante o se restaura; y se repite solamente el escenario afectado. Si el problema afecta dinero, stock, autoridad o integridad, la operación no se reanuda hasta demostrar la corrección.

## 9. Criterios de aprobación de la beta

Al terminar los siete días deben cumplirse simultáneamente:

- todos los turnos están cerrados individualmente;
- el consolidado diario coincide con los cierres sin reemplazarlos;
- la outbox está en cero;
- no hay operaciones válidas sin destino;
- las conciliaciones están resueltas o explicadas con evidencia;
- no hubo pérdida de datos o dinero;
- no existen diferencias económicas o de stock sin explicación;
- no hubo fallas críticas de seguridad, autoridad o aislamiento;
- el respaldo final puede restaurarse;
- se repiten con PASS las 102 pruebas locales y las 14 suites SQL desde un entorno limpio;
- el resultado queda documentado con la evidencia y el responsable de la decisión.

Los resultados posibles son:

- `aprobado`: el producto se considera listo para comercializar;
- `repetir_escenario`: sólo se repite el caso afectado después de corregirlo;
- `rechazado`: se suspende el lanzamiento y no se incorporan más comercios.

## 10. Salida comercial y migración final

Un resultado `aprobado` es la decisión de producto suficiente para comenzar la comercialización. No exige una segunda beta ni una nueva etapa general de validación.

Después de la aprobación se ejecuta un plan de corte separado y previamente verificable para:

1. congelar el build aprobado;
2. preparar la migración conjunta F5+F6 en producción;
3. respaldar QA y producción;
4. migrar los datos reales del comercio piloto con conteos, claves e hashes de control;
5. desplegar el cliente aprobado sin romper `CNAME` ni las rutas públicas;
6. verificar autenticación, licencia, permisos, caja, stock, ventas, fiado, outbox y cierres;
7. habilitar la contratación y el alta de nuevos clientes;
8. mantener una ventana de rollback y monitoreo reforzado.

La comercialización puede comenzar al aprobar la beta, pero la operación simultánea de más de un comercio tiene una condición técnica adicional ya reconocida: la barrera F4.3 actual usa locks de relación sobre tablas compartidas. El piloto monocomercio acepta esa limitación; antes de incorporar un segundo comercio activo debe reemplazarse por particionado, locks por fila o una barrera lógica por `comercio_id`. Resolver esta condición es trabajo de escalamiento, no una segunda beta funcional.

No se venden garantías fiscales ni funciones que el producto no tenga. El material comercial debe describir el sistema como herramienta operativa no fiscal hasta que exista una integración fiscal aprobada.

## 11. Exclusiones

Quedan fuera de esta beta:

- cambiar el dominio;
- crear otro repositorio;
- volver privado el repositorio público mientras dependa de GitHub Pages gratuito;
- desplegar los paquetes internos completos en GitHub;
- migrar producción antes de aprobar el piloto;
- incorporar simultáneamente varios comercios con la barrera global vigente;
- modificar datos comerciales desde soporte;
- presentar MiComercio como sistema fiscal.

## 12. Entregables de la ejecución

La ejecución debe producir:

- cliente público aislado en `/beta/`;
- corrección y prueba de la precondición de dispositivo nuevo;
- evidencia del recorrido real `v4_only`;
- baseline F2–F6 reproducible;
- pruebas locales, SQL, navegador, concurrencia y offline;
- respaldo inicial, respaldos diarios y respaldo final restaurable;
- bitácora completa de siete días;
- acta de resultado `aprobado`, `repetir_escenario` o `rechazado`;
- si se aprueba, plan de migración conjunta y lanzamiento comercial.

## 13. Definición de terminado

Este diseño se considera implementado únicamente cuando la beta está publicada de forma aislada, todos los gates previos pasaron, el comercio completó siete días reales, la evidencia final satisface la sección 9 y existe una decisión registrada.

Si la decisión es `aprobado`, MiComercio queda funcionalmente listo para comercializar. El siguiente trabajo es el corte productivo y la incorporación comercial controlada, no otra ronda de desarrollo funcional ni otra beta general.
