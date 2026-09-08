# Evidencia QA F6

Fecha de apertura: 2026-09-04  
Estado general: `candidate-deployed-qa-pending-browser-gates-and-pilot`  
estado: pendiente

## Baseline F5 congelado

- Paquete de referencia: `MiComercio-F5-PAQUETE-REV10-2026-09-04`.
- Build declarado y observado: `5.0.0-f5-rc2`.
- Artefacto fuente: `entregables/MiComercio-F5-PAQUETE-REV10-2026-09-04/entregables/MiComercio-F5-PRUEBA.html`.
- SHA-256 fuente: `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`.
- Copia de trabajo F6: `entregables/MiComercio-F6-PRUEBA.html`.
- SHA-256 inicial de la copia F6: `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`.
- Pruebas locales F5: 62/62 reproducidas en este workspace el 2026-09-04 mediante `verificar.ps1`; seis suites, cero fallas.
- Suites SQL F5 declaradas por el autor: 8/8. Este resultado no se considera reproducido desde cero en este workspace porque falta el baseline autónomo F2–F5.
- `entregables/MiComercio.html` no se usa como baseline: su SHA-256 es `4c1d35fcf307f73cee2a48836e357f852e3fc877953447820bd55831dc8b3bfb` y corresponde a una copia anterior.

## Gates previos al piloto

| Gate | Estado | Evidencia requerida |
|---|---|---|
| Navegador real sobre comercio `v4_only` | pendiente | Recorrido persistente F3.4 → F4.1 → F4.2 → F4.3 y operaciones verificadas por filas/IDs. |
| baseline F2–F5 reproducible | pendiente | Esquema inicial, migraciones y ocho suites F5 ejecutables desde cero por un tercero. |
| `verificarPin()` en dispositivo nuevo | pendiente | Eliminar o corregir el acceso sin barrera local cuando no existe `pinHash` ni `pinDuenio`, con prueba real. |

Ninguno de estos tres gates se declara resuelto por documentación, capturas ni resultados autorreportados. F6 puede avanzar como candidato técnico, pero el piloto de siete días no comienza mientras alguno permanezca pendiente.

## Correcciones previas a SQL F6

- El `CHECK` de fechas permite una licencia beta recién provisionada en estado `pendiente` con ambas fechas nulas y rechaza estados operables sin un par válido.
- `reactivate_without_compensation` sobre una licencia efectivamente vencida debe fallar sin mutación con `F6_REACTIVAR_REQUIERE_VIGENCIA`.
- El panel incluye las acciones de invitación completas y `reconciliation_note`.

## Checkpoint Task 1

- `entregables/MiComercio-F6-PRUEBA.html`: `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`.
- `tests/f6-baseline.test.cjs`: hash inicial `6885b084aec436e5eaf104d4696285f15d8de025bc861663a8ee8c6449cb68e2`; hash actual después de adaptar el gate al desarrollo F6 controlado: `4dbe17c5ff1f6dbf82f0204b3f21624ae86f8339b831cec2ec065713436fcea2`.
- Verificador F5 rev10: 36/36 hashes, cobertura completa, sintaxis OK y 62/62 pruebas locales.
- Suite baseline F6: 2/2 PASS.
- La suite compara además cada archivo de `supabase/` y `tests/` del paquete rev10 contra su copia operativa. Detectó ocho archivos viejos o ausentes en el workspace; fueron sincronizados byte a byte y la prueba volvió a 2/2 PASS.
- Entre esos ocho archivos estaba `supabase/functions/_shared/f5-auth-core.mjs`: quedó restaurada la resolución aprobada de IP (`cf-connecting-ip` y, como fallback, extremo derecho de `x-forwarded-for`). F6 debe reutilizarla sin reimplementarla.
- El hash de este documento se registrará externamente en `SHA256SUMS-F6.txt`; no se autoinscribe porque hacerlo cambiaría el propio hash.

## Checkpoint Task 2

- Prueba roja en QA PostgreSQL 17.6: `F6_SCHEMA_OBJECTS_MISSING` con los siete objetos esperados.
- Migración y suite ejecutadas juntas dentro de una transacción descartable: PASS.
- Verificación posterior al `ROLLBACK`: cero objetos F6, cero columnas F6 en `comercio_licencias` y cero filas de fixture persistentes.
- `supabase/f6/01_foundation.sql`: `9a99e9e1f77a3ecc71a457e0d29382ebd02848214c8222ae86a484f1b8b055ba`.
- `supabase/tests/f6_schema.test.sql`: `29e6316396b7e762b2e06eb7fbfe607ec897eec8e78abe9908e0e953eaa675df`.
- La migración todavía no fue aplicada de forma persistente; eso corresponde a Task 12 después de completar y verificar las seis migraciones F6.

## Checkpoint Task 3 — parcial

- Prueba roja en QA: `F6_INVITATION_FUNCTIONS_MISSING` enumeró las seis firmas ausentes.
- Ejecución descartable de `01_foundation.sql` + `02_invitations_provisioning.sql` + suite: PASS.
- Cubierto: emisión, 604800 segundos exactos, preview no enumerable, consumo, reintento idempotente, rechazo a otro usuario, vencimiento, revocación, regeneración, privilegios y provisión completa.
- Verificación posterior al `ROLLBACK`: cero tablas/funciones F6, cero usuarios Auth de fixture y cero comercios de fixture persistentes.
- `supabase/f6/02_invitations_provisioning.sql`: `a91272e6881b47a66514fdf51d464ed25d40ce1540c6685b8d6cef813e4bf7f2`.
- `supabase/tests/f6_invitations.test.sql`: `6c18449090d233fbd6bf8010967a8f8a5415f0324e17673d96b0eeee82897204`.
- Se detectó y cerró una costura de transporte: PostgREST no sirve funciones de un esquema no expuesto. El núcleo permanece en `private`; cinco wrappers `public.f6_service_*`, revocados a `anon` y `authenticated`, son ejecutables únicamente por `service_role`. La suite SQL en QA verifica ambas mitades del privilegio.
- Pendiente antes de cerrar Task 3: carrera real del mismo token desde dos conexiones simultáneas. No se reemplaza por una simulación secuencial.

## Checkpoint Task 4

- Ocho pruebas Node escritas; primera corrida sin contrato: 0 PASS y error `ERR_MODULE_NOT_FOUND`. Segunda fase con contrato pero sin Edge: 2/8 PASS. Estado final: 8/8 PASS.
- Cubierto: allowlist exacta de acciones y campos, token base64url, preview no enumerable, JWT para consumo, autoridad de soporte revalidada en SQL, traducción de rate limit a HTTP 429, `clientIp()` de F5 sin reimplementación y hashes SHA-256 con pepper y separación de dominio.
- La Edge limita el cuerpo a 16 KiB, usa allowlist CORS, no registra token/contacto y falla cerrado hasta que `05_support.sql` aporte `f6_service_rate_limit_preflight`.
- `supabase/functions/_shared/f5-auth-core.mjs`: `1b9bac90205dab22c89e01d9c0e1a5e94151fdd1804b0d91f69c108abd6b4e99` (idéntico a rev10).
- `supabase/functions/_shared/f6-contracts.mjs`: `a81bcf0de4ab4023d36295ff7723c4438e2d6f3c9be450bc3ced49afc8d551fd`.
- `supabase/functions/f6-invitations/index.ts`: `0e21798f847638767dc4f1af06f78bf9c913cfadb3c13c37813508fdeb7431ec`.
- `tests/f6-invitations-edge.test.mjs`: `03c1e55d8ebf4f54e69c82682b3248aab7a7ddfdd8cc6b90a5dc74c9524b1a02`.
- `node --check` confirmó la sintaxis del archivo TypeScript. Deno no está instalado en este host, por lo que el chequeo del runtime Deno queda pendiente para el despliegue de QA.

## Checkpoint Task 5

- Prueba roja SQL: `F6_ONBOARDING_RPC_MISSING` enumeró las tres firmas públicas ausentes. Primera ejecución de la implementación encontró que `comercio_licencias` se identifica por `comercio_id`, no por `id`; corregido y suite completa PASS en PostgreSQL real.
- Prueba roja cliente: 0/8 por ausencia de `F6_ONBOARDING_CORE_START`. Estado final: 8/8 PASS, incluyendo sintaxis de todos los scripts embebidos del HTML.
- Cubierto: orden cerrado de siete pasos, dueño-only, reintento sin mutación, reanudación tras corte, omisión sólo de empleados/clientes, caja y producto obligatorios, activación beta por 604800 segundos exactos y un único evento de licencia.
- La comprobación final conservó sin cambios ventas, máximo de ticket, movimientos de stock, cierres y cantidad de productos. La verificación posterior al rollback mostró cero objetos F6, usuarios y comercios de fixture persistidos.
- `supabase/f6/03_onboarding.sql`: `68ccd804ae4f30baf3b32851459f767a6d114f2bcdab93a158f7b59fbc7c5102`.
- `supabase/tests/f6_onboarding.test.sql`: `aa135789f65abd472d9009fc5ba1e03e8df764adb0d45fba48610cbf631b4322`.
- `entregables/MiComercio-F6-PRUEBA.html`: `e862e243bbc58cce5af87c7103f7319a597a9c9bce444153c6c60df9b5e85943`.
- `tests/f6-onboarding-client.test.cjs`: `af46709515a97a3b89353394f249c75b22eb764edfcd95e58f4d5ae9f7aa5634`.

## Checkpoint Task 6

- Prueba roja SQL: las tres funciones de licencia ausentes. Estado final descartable en PostgreSQL real: PASS.
- Cubierto: precedencia `cancelada > vencida > pausada > activa`, vencimiento exacto en `valid_until`, evaluación perezosa sin escritura, `offline_valid_until <= valid_until`, extensión 5+2 días, rechazo total de 4 días cuando restan 2, reintento idempotente, saldo compartido en pausas sucesivas y reactivación simple vencida sin mutación.
- Una licencia pausada y vencida puede recibir una extensión desde el reloj del servidor y queda activa atómicamente. `private.licencia_activa` y `obtener_licencia_v4` delegan en el nuevo evaluador sin cambiar la firma F3.3.
- Cliente: 6/6 PASS; regresión F5: 25/25 PASS; conjunto local F6 actual: 24/24 PASS.
- Pendiente de evidencia concurrente en Task 12: dos conexiones extendiendo a la vez no pueden superar 604800 segundos. La suite descartable ya verifica el lock, el `FOR UPDATE`, el límite y los reintentos, pero no se presenta como sustituto de esa carrera real.
- `supabase/f6/04_licenses.sql`: `c58700d0a4bae2e6886a373b34f990a25b72d1cfd1a3ba136ce2ba60d2cf6f9a`.
- `supabase/tests/f6_licenses.test.sql`: `a8d0c245a865742cecb32f76609456745402c9df70ac5b40aae49c3958081b55`.
- `entregables/MiComercio-F6-PRUEBA.html`: `eb7c5b1f8b50c3f184650e9f841f576ac99379fc5b71347e08e39e3e95f8782a`.
- `tests/f6-license-client.test.cjs`: `de852f385d68ce4a9f30ce0f80ab1faad8c5472a1d274077b8c818a303b1aee7`.

## Checkpoint Task 7

- `supabase/f6/05_support.sql` implementa operadores internos separados de los usuarios comerciales, lectura diagnóstica redactada, once comandos permitidos, auditoría append-only y límites por combinación, actor, comercio, contacto e IP.
- La suite `supabase/tests/f6_support.test.sql` se ejecutó sobre PostgreSQL QA dentro de una transacción descartable: PASS. Se verificaron autoridad activa/inactiva, prohibiciones comerciales, `UPDATE`/`DELETE`/`TRUNCATE` bloqueados, límites exactos e idempotencia.
- No se aplicó la migración en forma persistente.
- Migración: `91009b39c41fd6d513d779dfc70d34a4baf8c72af6edba793ef6f583fea79ad8`.
- Test SQL: `e88395ee680cbe19f59a48c08a691e650faecb1176bc006c615a4ea26a722bd3`.

## Checkpoint Task 8

- La Edge Function `f6-support` exige JWT, vuelve a validar que el operador esté activo, aplica allowlists por acción, limita el cuerpo y traduce el resultado SQL limitado a HTTP 429 con `Retry-After`.
- Reutiliza `clientIp()` del núcleo F5 corregido; no contiene una segunda implementación de XFF.
- Pruebas Node: 6/6 PASS. La regresión conjunta con invitaciones y F5 también quedó en PASS.
- Contrato compartido: `cf290507a71a0bf72eee8a4506c89fed7ddbbb9e33ceec2f0c76b8e03c5e6c6c`.
- Edge Function: `240585c59c108287bf9b65500da37144a46da47cb864696655b526d587898d7f`.
- Test: `5e9f994254f92b2fb737099931618f81d32e3bd7b803e40f8f0cfd05a55befaf`.
- La función todavía no fue desplegada en QA; las pruebas ejecutadas validan contrato y handler, no el runtime Deno desplegado.

## Checkpoint Task 9

- Se creó `entregables/MiComercio-Soporte-F6.html`, separado del sistema comercial.
- El panel organiza Alta, Licencia, Dispositivos, Sincronización y Conciliaciones; muestra primero el estado y la acción recomendada y no ofrece editores de ventas, caja, cierres, stock, fiado ni saldos.
- Todas las mutaciones exigen un motivo y tienen confirmaciones específicas. La nota de conciliación agrega contexto sin resolver ni modificar datos comerciales.
- Pruebas estáticas, de permisos y adaptación: 4/4 PASS.
- Panel: `5d1afc2bdd10bb9c9b9d9453b430c098951119671424296c291cbbc41018b5ee`.
- Test: `028357c877e67a653fbbe027654769983fc2c6e57a99bf32b3c93665af648ce8`.
- Pendiente: recorrido visual manual a 360 px y 1280 px conectado a la Edge desplegada. La política de URL local del navegador impidió usar esa revisión como evidencia ejecutada en esta etapa.

## Checkpoint Task 10

- El sistema detecta `?invite=` antes del login habitual, usa un mensaje genérico para enlaces no disponibles y no revela el comercio.
- El flujo integrado cubre preview, alta o ingreso Auth, consumo idempotente, siete pasos de onboarding, reanudación desde el último paso confirmado, comprobación sin efectos y activación por exactamente 604800 segundos.
- La idempotency key del consumo permanece en `sessionStorage` hasta que el servidor confirma el resultado.
- Un onboarding incompleto puede autenticarse para continuar el asistente, pero no entra al POS hasta recibir licencia efectiva activa.
- Regresión de integración: 55/55 PASS en onboarding, licencia, cliente F5 y funciones de búsquedas/pagos.
- HTML final de esta etapa: `409afeba3ff6f8c0259f42eaf415614e179d2eb245b7b32c06f27c2ddecb610a`.
- Onboarding: `c5d8319ffa288f680285a48f9de18b2a6781badc7c81cc345a81fa81ba5c5f1a`.
- Licencia: `04e3d1830d7ca36968125e2dc37932bf93d1475058f71ac19d0334aff7d5c5de`.

## Checkpoint Task 11

- Caja considera activa sólo una sesión con `estado='abierta'`, conserva los fondos capturados en esa sesión y permite cerrar un turno vacío.
- Cada cierre exige una clave efectiva de sesión o segmento y rechaza localmente un segundo cierre para la misma clave. El servidor conserva la unicidad normativa.
- Cerrar un turno limpia únicamente la sesión activa; no invalida el lease ni la autoridad, por lo que se puede abrir y cerrar otro turno el mismo día.
- Resumen presenta cada cierre por separado, incluida su diferencia, y agrega un “Total del día” de sólo lectura que suma ventas y cantidades pero no mezcla fondos ni diferencias.
- Los segmentos provisionales permanecen fuera del arqueo de otra sesión y conservan su flujo de conciliación.
- Pruebas Node: 4/4 PASS; regresión relacionada: 59/59 PASS.
- `supabase/f6/06_pilot_gate.sql` agrega seis comprobaciones separadas: build, `v4_only`, baseline reproducible, precondición PIN, múltiples cierres del día y cierre provisional conciliable.
- La prueba roja inicial en PostgreSQL QA devolvió `F6_PILOT_GATE_MISSING`. Después se ejecutaron la migración `06` y su suite dentro de una transacción descartable: PASS. El `ROLLBACK` dejó cero filas de fixture.
- No se reejecutaron juntas las seis migraciones F6 en esta etapa; dos intentos de corrida amplia fueron detenidos antes de ejecutar por la revisión de riesgo. Este resultado sólo acredita el delta `06` sobre el baseline QA existente.
- Migración: `9ca07547080b909198c453f332e114850f98beeb9ce12dddb5499ab7589b0ecb`.
- Test SQL: `477d1a96dbb88e74a10191bceb041589c2be7df5a67115824eea36b2fb3d048f`.
- Test cliente: `ebb3c6e9cfba922d84def837e070301bb647effd5308bf3a8f18e1e0ba813991`.

## Checkpoint identidad F6

- Build normativo: `6.0.0-f6-rc1`; base: `5.0.0-f5-rc2`.
- La identidad vive dentro del HTML como `window.MiComercioBuild` y se compara campo por campo con `entregables/BUILD-IDENTITY-F6.json` mediante ejecución aislada del bloque, no por una búsqueda de texto.
- La identidad fija los contratos de proyección, configuración y licencia, además de 102 pruebas locales y 14 suites SQL esperadas.
- El HTML F6 conserva el hash declarado `409afeba3ff6f8c0259f42eaf415614e179d2eb245b7b32c06f27c2ddecb610a`.
- Suite de identidad: 2/2 PASS; test `0b7c80a823be1a4f8787a34454ea33715dfef51fe9a8dfec618492391becfd1e`.

## Verificación local acumulada

- Fecha: 2026-09-05.
- Suites descubiertas: 14 archivos `*.test.cjs`/`*.test.mjs`.
- Resultado medido: 102 pruebas, 102 PASS, 0 FAIL.
- Desglose contractual: 62 pruebas F5 y 40 pruebas F6/baseline/paquete.
- No se incluye aquí un “14/14 SQL” ejecutado desde cero: las ocho suites F5 dependen del baseline histórico F2–F4 y las seis F6 se probaron por incrementos descartables. La reproducción integral y persistente corresponde a Task 12.

## Task 12 — aplicación persistente en QA iniciada

El 2026-09-05 se aplicó el candidato exclusivamente al proyecto QA `qrvdfqpxutymmlcplsal`. Producción no fue consultada ni modificada.

### Completado

1. El preflight previo al DDL devolvió cero licencias duplicadas, comercios sin dueño, códigos de caja activos duplicados, roles desconocidos, filas beta legacy incompatibles, membresías activas duplicadas y objetos F6 preexistentes.
2. Se aplicaron persistentemente, en orden y sin `DROP ... CASCADE`, las seis migraciones:
   - `20260905182341 f6_rc1_01_foundation_qa`;
   - `20260905182357 f6_rc1_02_invitations_provisioning_qa`;
   - `20260905182412 f6_rc1_03_onboarding_qa`;
   - `20260905182429 f6_rc1_04_licenses_qa`;
   - `20260905182446 f6_rc1_05_support_qa`;
   - `20260905182519 f6_rc1_06_pilot_gate_qa`.
3. Se desplegaron `f6-invitations` versión 1 (`2a0839c1-e717-4319-9355-43a7c88b07ff`, despliegue `033918fedcbe2bcc641a6fcfc04d5a864170c88a49e2f598df52096547f9b43b`) y `f6-support` versión 1 (`e465d8ff-ec1a-4f32-a7ad-28e351e22a60`, despliegue `1b7ec93193e270fd220f2354f7fb709e4ec676488c7a7914877c5d87300aa41e`). Ambas quedaron `ACTIVE`; la primera usa autenticación propia para permitir el preview no enumerable y la segunda exige JWT en la plataforma.
4. Se ejecutaron sobre el esquema persistente las seis suites F6 y las ocho suites F5, cada una en su propia transacción descartable: 14/14 suites PASS.
5. El control posterior confirmó siete tablas privadas F6, 32 funciones F6, las seis columnas nuevas de licencia, cero constraints sin validar y cero permisos F6 para `anon` o para `service_role` sobre las RPC destinadas a usuarios autenticados.
6. No quedaron comercios, usuarios Auth, invitaciones, licencias ni operadores creados por los fixtures SQL. La única actividad operativa nueva fue el registro de tres dimensiones de rate limit producido por el smoke test real del preview.

### Asesores posteriores al DDL

- Seguridad informó `RLS enabled no policy` sobre las siete tablas `private.f6_*`. Es coherente con el diseño: están fuera del esquema expuesto, tienen RLS habilitado, no ofrecen acceso directo y todas sus concesiones públicas fueron revocadas.
- Seguridad marcó cuatro wrappers `SECURITY DEFINER` ejecutables por `authenticated`: onboarding actual, confirmar paso, comprobar onboarding y licencia actual. La exposición es intencional y cada wrapper conserva las validaciones de identidad, membresía y comercio verificadas por las suites SQL.
- Rendimiento informó que la FK `f6_invitaciones.replaced_by` no tiene índice propio. Es una recomendación no bloqueante para revisar antes de producción; no se modificó el RC1 después de desplegarlo.
- Los índices F6 aparecen inicialmente como no usados porque el esquema acababa de instalarse y todavía no comenzó el piloto. No se eliminan antes de medir carga real.

### Secrets y smoke test desplegado

- El 2026-09-05 a las 18:58 UTC se guardaron `F6_ALLOWED_ORIGINS`, `F6_INVITATION_PEPPER` y `F6_SUPPORT_PEPPER` como secrets cifrados del proyecto QA. Los peppers fueron generados independientemente con 256 bits aleatorios; sus valores no se escribieron en archivos, evidencia ni ZIP y fueron descartados de la sesión después de guardar.
- `F6_ALLOWED_ORIGINS` autoriza únicamente `null`, el origen que envía el HTML de prueba abierto desde archivo local.
- `f6-invitations` con `Origin: null` respondió HTTP 200 con el contrato genérico `INVITATION_NOT_AVAILABLE`; no enumeró comercio ni contacto.
- `f6-support` con un payload válido y sin sesión respondió HTTP 401 `SESION_REQUERIDA`. Esto demuestra que el origen permitido no evita la autenticación del panel.

### Pendiente antes del piloto

1. Resolver con evidencia los tres gates F5: navegador `v4_only`, baseline F2–F5 desde cero y `verificarPin()` en dispositivo nuevo.
2. Ejecutar el recorrido real: invitación, autenticación, corte/reanudación, onboarding, licencia, dos turnos y cierres separados.
3. Ejecutar las carreras concurrentes y los escenarios offline con verificación de filas e IDs.

Hasta completar esos puntos, el artefacto está aplicado como candidato técnico en QA, pero no está aprobado para producción ni habilitado para iniciar el piloto de siete días.

## Candidato F6 RC1 — empaquetado

- Directorio: `entregables/MiComercio-F6-PAQUETE-RC1`.
- Contenido controlado: 102 archivos más `SHA256SUMS-F6.txt`.
- El manifiesto usa LF y describe exactamente el conjunto del paquete.
- `verificar.ps1` fue ejecutado en este host: 103/103 hashes, cobertura exacta, sintaxis de ambos HTML, 14 suites SQL inventariadas, seis migraciones F6, 102/102 pruebas locales y cero coincidencias de secretos de alto riesgo.
- El verificador rechazó diez sabotajes sobre copias independientes: manifiesto truncado; suite borrada; archivo colado; byte alterado en SQL; una prueba eliminada con manifiesto regenerado; identidad JSON/HTML divergente; una resolución `clientIp()` copiada o alterada dentro de F6; un SQL extra agregado al baseline F5 con manifiesto regenerado; el mismo SQL agregado simultáneamente al workspace y al rev10 anidado; y esa misma deriva regenerando además el manifiesto F5 interno.
- `verificar.sh` está incluido con las mismas etapas, pero Bash no está instalado en este host. No se lo presenta como ejecutado.
- El ZIP fue extraído en un directorio temporal nuevo y `verificar.ps1` volvió a completar todas las etapas sobre los archivos extraídos.
- El hash final del ZIP se registra en un archivo lateral para evitar una referencia circular: un ZIP no puede contener de forma estable su propio checksum.

## Corrección de baseline posterior a revisión

- Se comprobó que `supabase/f5/08_rollback_contract_fix.sql` existía en la copia de trabajo pero no en el paquete canónico F5 rev10 anidado.
- La definición duplicada de `private._f5_merge_legacy_config` era funcionalmente equivalente a la de `01_authority_membership.sql`, por lo que el defecto actual era de precedencia y trazabilidad, no un cambio de comportamiento observado.
- Antes de eliminarla se agregó al test de baseline una comparación exacta del conjunto de archivos `supabase/f5` contra rev10. La ejecución roja falló 1/2 e identificó únicamente `08_rollback_contract_fix.sql` como extra.
- Se eliminó la copia duplicada. La misma suite pasó 2/2 y la comparación independiente informó conjuntos iguales.
- El paquete anidado `MiComercio-F5-PAQUETE-REV10-2026-09-04` permaneció byte a byte intacto.
- Se reprodujo después el borde coordinado: agregar el mismo `08` a las dos carpetas y regenerar el manifiesto superior era aceptado por el gate anterior.
- El oráculo ya no es una de las carpetas. El test ancla `SHA256SUMS-F5.txt` al hash aprobado `f06a7f895f7c71ea8e9f2ca356d537bc86909fd451df95a3a78895134e37cb93`, deriva de ese manifiesto el conjunto F5 y verifica el hash declarado de cada SQL en ambas ubicaciones.
- Con el nuevo control, la deriva coordinada fue rechazada tanto conservando el manifiesto F5 original como regenerándolo junto con el manifiesto F6.

## Corrección de bootstrap y primer operador interno

- Se creó en Auth QA el usuario interno autorizado. El correo y el UUID completo quedan registrados únicamente en Supabase QA y se omiten de esta evidencia exportable; la contraseña no se registró en archivos, evidencia ni paquetes.
- El primer intento real de bootstrap descubrió una regresión: un usuario sin `name` ni `full_name` en `raw_user_meta_data` dejaba `v_name` en `NULL`; la comparación `v_name=''` no ejecutaba el fallback y PostgreSQL rechazaba el alta por `NOT NULL`.
- Antes de corregir se agregó una regresión a `supabase/tests/f6_support.test.sql`. La prueba con metadata vacía falló en QA con SQLSTATE `23502`, acreditando el defecto.
- La corrección canónica en `supabase/f6/05_support.sql` cambia únicamente la guarda a `coalesce(v_name,'')=''`. Se aplicó persistentemente como migración `f6_rc1_05_support_null_name_fix_qa`.
- La regresión pasó después de la migración y comprobó el nombre determinista `Operador f6000000`, el alta activa y el evento de auditoría.
- Se repitieron las seis suites F6 y las ocho suites F5 contra el esquema persistente: 14/14 PASS.
- El bootstrap real devolvió `SUPPORT_OPERATOR_CREATED`. La fila quedó activa con rol `supervisor`, nombre interno determinista, exactamente un evento `operator_bootstrap` y cero membresías comerciales.
- El smoke autenticado real pasó: Auth emitió una sesión válida, `f6-support` aceptó el JWT y el panel devolvió `ok=true` para `COV_QA_COMERCIO_01`, con build observado `6.0.0-f6-rc1`, base aprobada `5.0.0-f5-rc2` y licencia efectiva `activa`.
- El navegador interno impidió abrir el archivo local por su política de URL. La verificación equivalente se hizo directamente contra Auth y la Edge Function QA; no se imprimieron ni persistieron el token o la contraseña.

## Paquete corregido RC1-REV2

- El RC1 original permanece congelado como evidencia de la entrega previa al hallazgo.
- `entregables/MiComercio-F6-PAQUETE-RC1-REV2` incorpora únicamente la corrección canónica de `05_support.sql`, su prueba de regresión y la documentación/evidencia actualizada. El build cliente continúa siendo `6.0.0-f6-rc1` porque no cambió el contrato ni el código ejecutable del cliente; `REV2` identifica la revisión del paquete y de la migración de soporte.
- El manifiesto controla 102 archivos con cobertura exacta y LF. `verificar.ps1` confirmó sintaxis de ambos HTML, 14 suites SQL inventariadas, seis migraciones F6, 102/102 pruebas locales y cero coincidencias de secretos de alto riesgo.

## Actualización RC2 — 2026-09-07

- El cliente completo publicado pasó a `6.0.0-f6-rc2`, revisión 3, conservando las doce secciones funcionales del sistema.
- Se agregó gestión real de empleados en Configuración: alta, diez permisos, cambio de clave, suspensión y reactivación. El bloqueo visual del mostrador permanece separado.
- Se aplicaron persistentemente `f6_employee_management_qa`, `f6_product_images_qa` y `f6_employee_management_security_qa` en el proyecto QA.
- Las imágenes de productos usan `<comercio_id>/<producto_id>.jpg`; leer exige membresía activa y licencia operable, y escribir exige además `productos_editar`.
- Resultado medido: 110/110 pruebas locales y 15/15 suites SQL sobre QA, cada suite SQL dentro de una transacción descartable.
- La suite de soporte dejó de contar operadores persistentes ajenos a sus fixtures; esa era la causa del único rojo durante la repetición acumulada.
- El lector de facturas con IA sigue postergado por decisión explícita y no se declara resuelto por RC2.
- El ZIP se extrajo en un directorio temporal nuevo y la misma verificación volvió a pasar desde cero. Su SHA-256 se conserva únicamente en el archivo lateral `.zip.sha256.txt` para evitar autorreferencia.
