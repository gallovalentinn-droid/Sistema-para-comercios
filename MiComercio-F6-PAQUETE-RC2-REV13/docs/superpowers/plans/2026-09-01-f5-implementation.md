# F5 — Identidades, permisos y autoridad offline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar F5 completo en el servidor QA y en un nuevo artefacto HTML sin ejecutar todavía la migración/integración final del producto.

**Architecture:** F5 se entrega mediante contratos versionados entre tres capas que avanzan en orden: autoridad y seguridad en Supabase, operaciones offline ligadas a lease/sesión y cliente local consciente de identidad, proyección y sesión. Los cambios SQL se conservan como artefactos reproducibles en `supabase/f5/`, se validan primero en transacciones y luego se aplican únicamente al proyecto QA `qrvdfqpxutymmlcplsal`; la migración final conjunta con F6 queda fuera de este plan. Aunque hay subsistemas distintos, no se separan en despliegues independientes porque comparten el mismo version gate, los cinco tipos offline y el contrato F3.4.

**Tech Stack:** PostgreSQL/Supabase Auth/RLS/Database Functions/Edge Functions, HTML/CSS/JavaScript sin bundler, IndexedDB, Node.js `node:test`, pgTAP/SQL de aserciones.

**Spec:** `docs/superpowers/specs/2026-09-01-f5-identidades-permisos-y-autoridad-offline-design.md`

## Global Constraints

- Proyecto de desarrollo: Supabase QA `qrvdfqpxutymmlcplsal`; no aplicar cambios a producción ni ejecutar la migración final conjunta F5/F6.
- El comercio QA principal `COV_QA_COMERCIO_01` permanece en `rollback`; la minimización se valida en un comercio dedicado creado por Task 7 y llevado por la cadena real hasta `v4_only`.
- Sistema base inmutable: `entregables/MiComercio-PRUEBA-QA3-MOVIMIENTOS-CUENTAS.html`; trabajar sobre `entregables/MiComercio-F5-DESARROLLO.html`.
- `sources/` es referencia de sólo lectura.
- Roles de servidor: `duenio`, `admin`, `empleado`.
- Permisos canónicos cerrados: `ventas_registrar`, `productos_editar`, `reposicion_ver`, `vencimientos_ver`, `combos_editar`, `promociones_editar`, `fiado_operar`, `caja_operar`, `movimientos_ver`, `resumen_ver`.
- TTL del lease durante la beta: `604800` segundos; chequeo de autoridad cada `300` segundos; reemplazo cuando restan `518400` segundos o menos; aceptación histórica hasta 30 días después de `valid_until`.
- Tipos offline cerrados: `abrir_sesion_caja_v4`, `registrar_venta_v4`, `registrar_pago_fiado_v4`, `registrar_egreso_v4`, `cerrar_sesion_caja_v4`.
- Toda función `SECURITY DEFINER` vive en `private`, usa `set search_path = ''`, califica cada objeto, comprueba `auth.uid()` y revoca `EXECUTE` a `PUBLIC`, `anon` y `authenticated`; sólo un wrapper público `SECURITY INVOKER` recibe el grant necesario.
- Toda tabla expuesta conserva RLS y grants mínimos. `app_schema_meta` no se modifica hasta inventariar y probar su consumidor legítimo.
- Contrato F3.4: exactamente 10 keys canónicas y 6 legacy-only; rollback conserva verbatim `nroVenta`, `ultBackup`, `pinDuenio`, `pinHash` y `permisosEmpleado`.
- La alerta por dos raíces provisionales o 24 horas sin resolver no bloquea y no existe tope duro de raíces por caja durante la beta.
- `Movimientos en cuentas` continúa siendo diario y no se filtra por sesión.
- Este espejo no es un repositorio Git. Cada task termina con pruebas y SHA-256 de los artefactos; los commits se realizan al trasladar el cambio al repositorio autoritativo.

## File Map

- `entregables/MiComercio-F5-DESARROLLO.html`: único artefacto cliente modificable; contiene integración F5 y conserva las funciones UX aprobadas.
- `tests/f5-client.test.cjs`: pruebas unitarias/contractuales del cliente F5 extraídas desde marcadores estables del HTML.
- `tests/f43-rollback.test.cjs`: regresión de los tres caminos de transición F4.3 que deben ejecutar el loader post-fence/post-restore.
- `supabase/f5/01_authority_membership.sql`: catálogo, invariantes, auditoría y RPC de membresía/configuración.
- `supabase/f5/02_employee_access.sql`: tablas privadas de usuario visible, rate limit y auditoría de acceso.
- `supabase/functions/f5-login/index.ts`: único endpoint sin JWT; resuelve usuario interno y obtiene sesión sin revelar correo técnico.
- `supabase/functions/f5-members/index.ts`: alta/restablecimiento de identidad; exige JWT y compensa usuarios Auth huérfanos.
- `supabase/f5/03_leases.sql`: familias, leases append-only, revocaciones, emisión y chequeo.
- `supabase/f5/04_offline_streams.sql`: segmentos, stream derivado, cinco RPC offline, llegadas tardías y cola unificada.
- `supabase/f5/05_projection_manifest.sql`: manifiesto derivado, proyecciones y preflight F3.4 fail-closed.
- `supabase/f5/06_security_compatibility.sql`: paginación, `ticket_ref`, contrato de rollback y cierre de superficie pública.
- `supabase/tests/f5_authority.test.sql`: caminos autorizados/denegados de membresía, permisos y configuración.
- `supabase/tests/f5_offline.test.sql`: leases, revocación, carreras, cinco operaciones y sesiones conflictivas.
- `supabase/tests/f5_projection.test.sql`: minimización y cobertura exacta del manifiesto.
- `supabase/tests/f5_v4only_fixture.sql`: creación y recorrido del comercio QA dedicado que valida minimización en `v4_only`.
- `supabase/tests/f5_compatibility.test.sql`: roster 33, centinelas de rollback, RLS/grants e índices.
- `entregables/QA-F5-EVIDENCIA.md`: comandos, resultados, advisors, hashes y limitaciones aceptadas.

---

### Task 1: Congelar el baseline y reparar el seam de rollback F4.3

**Files:**
- Create: `entregables/MiComercio-F5-DESARROLLO.html`
- Create: `tests/f43-rollback.test.cjs`
- Modify: `entregables/MiComercio-F5-DESARROLLO.html` en `createF43Runtime().refreshAuthority/activateCutover/rollback`, API pública y auto-poll de `installF43BrowserIntegration`

**Interfaces:**
- Consumes: `enterV4Only({baseLoad})`, `enterRollback({baseLoad})`, `f43LoadLocalOnly()` y `cargar()` existentes.
- Produces: `refreshAuthority({v4OnlyBaseLoad,rollbackBaseLoad})`, `activateCutover({rollbackHours,baseLoad})`, `rollback({baseLoad})` y una integración que pasa el loader correcto en los tres caminos.

- [x] **Step 1: Copiar el artefacto aprobado y registrar su hash**

Run:

```powershell
Copy-Item -LiteralPath 'entregables/MiComercio-PRUEBA-QA3-MOVIMIENTOS-CUENTAS.html' -Destination 'entregables/MiComercio-F5-DESARROLLO.html'
Get-FileHash -Algorithm SHA256 'entregables/MiComercio-PRUEBA-QA3-MOVIMIENTOS-CUENTAS.html'
```

Expected: el archivo nuevo existe y el hash coincide antes de editar.

Registrado: `0FE916BCB4C8A8C697639FF0D9828C3D4FC70BC943B51EE50F739E00122DD0A7`.

- [x] **Step 2: Escribir pruebas que demuestran los tres seams incompletos**

```js
function makeRuntime({phase='normal',serverStates=[],pasos=[]}={}){
  const states=[...serverStates];
  return createF43Runtime({
    rpc:async name=>{
      if(name==='estado_f43') return {data:states.shift()};
      if(name==='activar_v4_only_f43') return {data:{estado:'v4_only',v4_only:true}};
      if(name==='rollback_f43') return {data:{estado:'rollback'}};
      throw new Error(`RPC_NO_ESPERADA:${name}`);
    },
    pull:async()=>{pasos.push('pull');return {ok:true,maestros:{completo:true},operaciones:{completo:true}};},
    activateAdapter:async()=>pasos.push('activate'),
    restoreAdapter:async()=>pasos.push('restore'),
    loadPersistedState:()=>({phase,frozen:phase==='prepared'||phase==='v4_only'}),
    savePersistedState:async()=>{},
    getCommerceId:()=> 'comercio-qa'
  });
}

test('rollback restaura el adaptador, carga la base y recién después libera escritura', async () => {
  const pasos = [];
  const runtime = makeRuntime({phase:'v4_only',pasos});
  await runtime.rollback({ baseLoad: async () => pasos.push('load') });
  assert.deepEqual(pasos, ['restore', 'load']);
  assert.equal(runtime.state().phase, 'rollback');
  assert.equal(runtime.state().frozen, false);
});

test('refreshAuthority ejecuta el loader correspondiente antes del pull', async () => {
  const pasos = [];
  const runtime = makeRuntime({serverStates:[{estado:'v4_only'},{estado:'rollback'}],pasos});
  await runtime.refreshAuthority({v4OnlyBaseLoad:async()=>pasos.push('load-v4')});
  assert.deepEqual(pasos,['activate','load-v4','pull']);
  pasos.length=0;
  await runtime.refreshAuthority({rollbackBaseLoad:async()=>pasos.push('load-rollback')});
  assert.deepEqual(pasos,['restore','load-rollback']);
});

test('activateCutover carga la base post-fence antes del full pull', async () => {
  const pasos=[];
  const runtime=makeRuntime({phase:'prepared',pasos});
  await runtime.activateCutover({baseLoad:async()=>pasos.push('load-v4')});
  assert.deepEqual(pasos.slice(-3),['activate','load-v4','pull']);
});
```

- [x] **Step 3: Ejecutar la prueba y confirmar que falla**

Run: `node --test tests/f43-rollback.test.cjs`

Expected: FAIL porque `rollback()`, `refreshAuthority()` y `activateCutover()` descartan los loaders.

- [x] **Step 4: Aplicar el cambio mínimo**

```js
async function rollback({baseLoad=null}={}){
  const comercioId=need('getCommerceId')();
  const server=await rpc('rollback_f43',{p_comercio_id:comercioId});
  if(!(server&&server.estado==='rollback')) throw new Error('F43_ROLLBACK_REJECTED');
  await enterRollback({baseLoad});
  st.lastServer=server;
  await persist();
  return {ok:true,server,state:state()};
}

async function refreshAuthority({v4OnlyBaseLoad=null,rollbackBaseLoad=null}={}){
  const server=await serverState();
  if(server.estado==='v4_only'||server.v4_only===true){
    if(st.phase!=='v4_only') return enterV4Only({baseLoad:v4OnlyBaseLoad});
  }else if(server.estado==='rollback'){
    if(st.phase!=='rollback') return enterRollback({baseLoad:rollbackBaseLoad});
  }
  await persist();
  return state();
}

async function activateCutover({rollbackHours=168,baseLoad=null}={}){
  if(st.phase!=='prepared') throw new Error('F43_DEVICE_NOT_PREPARED');
  const comercioId=need('getCommerceId')();
  const server=await rpc('activar_v4_only_f43',{p_comercio_id:comercioId,p_rollback_hours:rollbackHours});
  if(!(server&&(server.estado==='v4_only'||server.v4_only===true))) throw new Error('F43_CUTOVER_REJECTED');
  try{
    await enterV4Only({baseLoad});
  }catch(e){
    st.phase='cutover_recovery';
    st.frozen=true;
    st.lastServer=server;
    st.lastError=errText(e);
    await persist().catch(()=>{});
    throw e;
  }
  st.lastServer=server;
  await persist();
  return {ok:true,server,state:state()};
}
```

En la integración se instalan los mismos loaders en la API y el auto-poll:

```js
const v4OnlyBaseLoad=()=>requireFn(bindings.f43LoadLocalOnly,'f43LoadLocalOnly')();
const rollbackBaseLoad=()=>originalLoad.call(bindings.window);
const transitionLoaders={v4OnlyBaseLoad,rollbackBaseLoad};

const publicApi={
  // conserva las entradas actuales
  activarV4Only:(rollbackHours=168)=>ensureRuntime().activateCutover({rollbackHours,baseLoad:v4OnlyBaseLoad}),
  rollback:()=>ensureRuntime().rollback({baseLoad:rollbackBaseLoad}),
  refrescar:()=>ensureRuntime().refreshAuthority(transitionLoaders)
};

pollTimer=bindings.setInterval.call(bindings.window,()=>{
  if(!runtime||!runtime.state().frozen) return;
  runtime.refreshAuthority(transitionLoaders).catch(()=>{});
},pollMs);
```

La secuencia obligatoria es adaptador/fence → loader → pull → cambio de fase → `frozen=false`.

- [x] **Step 5: Verificar baseline y sintaxis**

Run: `node --test tests/f43-rollback.test.cjs tests/ui-busquedas-pagos.test.cjs`

Expected: PASS completo.

---

### Task 2: Autoridad de membresía y catálogo cerrado

**Files:**
- Create: `supabase/f5/01_authority_membership.sql`
- Create: `supabase/tests/f5_authority.test.sql`

**Interfaces:**
- Consumes: `public.comercio_miembros`, `private.es_miembro`, `private.tiene_rol`, Supabase Auth.
- Produces: `private.f5_permisos_validos(jsonb)`, `private.f5_permisos_efectivos(uuid)`, `public.f5_miembro_actual(uuid)`, `public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)`.

- [x] **Step 1: Ejecutar el preflight de unicidad antes de crear el índice**

```sql
select user_id, count(*) as membresias_activas
from public.comercio_miembros
where activo
group by user_id
having count(*) > 1;
```

Expected en QA al 1 de septiembre de 2026: cero filas, ya verificado. En cualquier destino posterior, una sola fila aborta el despliegue antes del DDL. No se desactiva automáticamente ninguna membresía: se exportan `user_id`, comercios y roles para que dueño/soporte elijan cuál conservar y se repite el preflight.

- [x] **Step 2: Escribir pruebas SQL de escalada y último dueño**

```sql
begin;
select plan(8);
select throws_ok(
  $$ update public.comercio_miembros set rol='duenio' where user_id=auth.uid() $$,
  '42501', null, 'no existe DML directo de membresía'
);
select throws_ok(
  $$ select public.f5_actualizar_miembro(:comercio,:duenio,'empleado','{}',false) $$,
  'F5_ULTIMO_DUENIO', null, 'no se desactiva el último dueño'
);
select * from finish();
rollback;
```

- [x] **Step 3: Ejecutar la prueba contra QA y confirmar el fallo inicial**

Run: ejecutar `supabase/tests/f5_authority.test.sql` mediante la conexión de QA dentro de una transacción.

Expected: FAIL porque `miembros_write` todavía permite DML y las RPC F5 no existen.

- [x] **Step 4: Implementar catálogo e invariantes**

```sql
create or replace function private.f5_catalogo_permisos()
returns text[] language sql immutable set search_path = '' as $$
  select array[
    'ventas_registrar','productos_editar','reposicion_ver','vencimientos_ver',
    'combos_editar','promociones_editar','fiado_operar','caja_operar',
    'movimientos_ver','resumen_ver'
  ]::text[];
$$;

create unique index comercio_miembros_usuario_activo_uq
on public.comercio_miembros(user_id) where activo;

drop policy if exists miembros_write on public.comercio_miembros;
revoke insert, update, delete on public.comercio_miembros from anon, authenticated;
```

La función privada de mutación toma exactamente `pg_advisory_xact_lock(hashtext(p_comercio_id::text))`, la misma expresión que `_activar_v4_only_f43` y `_rollback_f43`; después relee actor/destinatario, valida los diez permisos, impide autoedición de administrador y cuenta dueños activos antes de confirmar. Una aserción consulta `pg_get_functiondef` y exige la misma expresión en F4.3 y F5 para impedir que una variante de hash rompa la serialización por comercio.

- [x] **Step 5: Añadir auditoría y versionado**

Crear `private.f5_membresia_eventos` append-only con `actor_user_id`, `target_user_id`, `antes`, `despues`, `created_at`, y agregar `permission_version bigint not null default 1` a `comercio_miembros`. Toda mutación incrementa esa versión una vez.

- [x] **Step 6: Cerrar privilegios y probar concurrencia**

Ejecutar dos transacciones concurrentes que intenten desactivar dueños distintos; una debe completar y la otra debe fallar con `F5_ULTIMO_DUENIO`. Verificar que `private` no concede ejecución directa y que el wrapper público sólo está concedido a `authenticated`.

Expected: 8 aserciones PASS y exactamente un dueño activo.

---

### Task 3: Acceso de empleados sin correo visible

**Files:**
- Create: `supabase/f5/02_employee_access.sql`
- Create: `supabase/functions/f5-login/index.ts`
- Create: `supabase/functions/f5-members/index.ts`

**Interfaces:**
- Consumes: Supabase Auth password flow, `public.f5_actualizar_miembro`.
- Produces: `POST /functions/v1/f5-login { comercio, usuario, clave }`; `POST /functions/v1/f5-members { accion, comercioId, ... }`.

- [x] **Step 1: Crear pruebas del contrato HTTP**

Probar respuesta genérica idéntica para comercio inexistente, usuario inexistente y clave incorrecta; probar 429 al superar cinco intentos por combinación IP/usuario en 15 minutos; comprobar que ningún cuerpo devuelve `internal_email`.

- [x] **Step 2: Crear almacenamiento privado**

```sql
create table private.f5_login_identidades (
  user_id uuid primary key references auth.users(id) on delete cascade,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  usuario_normalizado text not null,
  internal_email text not null unique,
  created_at timestamptz not null default now(),
  unique (comercio_id, usuario_normalizado)
);
create table private.f5_login_intentos (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  usuario_hash text not null,
  exitoso boolean not null,
  created_at timestamptz not null default now()
);
create index f5_login_intentos_ventana_idx
on private.f5_login_intentos(ip_hash, usuario_hash, created_at desc);
```

- [x] **Step 3: Implementar `f5-login` sin JWT pero con autenticación propia**

La función normaliza con Unicode NFKD/minúsculas, consulta la tabla privada con clave secreta, aplica rate limit antes del password flow y devuelve sólo `access_token`, `refresh_token`, `expires_in` y datos públicos de membresía. `verify_jwt=false` se permite exclusivamente para esta función.

- [x] **Step 4: Implementar alta/restablecimiento autenticado con compensación**

`f5-members` usa `verify_jwt=true`, obtiene `userClaims.id`, vuelve a consultar rol vigente, crea correo interno aleatorio, crea Auth user, inserta identidad/membresía y elimina el Auth user si falla cualquier paso posterior.

- [x] **Step 5: Desplegar en QA y repetir pruebas**

Expected: acceso correcto sin mostrar correo, errores indistinguibles, rate limit activo y cero usuarios huérfanos tras una falla inducida.

---

### Task 4: Configuración, contrato de 10/6 y rollback centinela

**Files:**
- Modify: `supabase/f5/01_authority_membership.sql`
- Modify: `supabase/tests/f5_authority.test.sql`
- Modify: `entregables/MiComercio-F5-DESARROLLO.html`
- Modify: `tests/f5-client.test.cjs`

**Interfaces:**
- Produces: `public.f5_actualizar_config_operativa(uuid,jsonb)` y `public.f5_actualizar_config_privilegiada(uuid,jsonb)`; `f3PayloadConfig()` con 10 keys.

- [x] **Step 1: Escribir tests de allowlist y conteo exacto**

```js
test('f3PayloadConfig emite 10 keys y nunca autoridad legacy', () => {
  const payload = f3PayloadConfig(configFixture());
  assert.equal(Object.keys(payload).length, 10);
  assert.equal('pin_hash' in payload, false);
  assert.equal('permisos_empleado' in payload, false);
});
```

Agregar prueba SQL que rechaza una key desconocida y una mutación privilegiada hecha por empleado.

- [x] **Step 2: Confirmar que fallan**

Run: `node --test tests/f5-client.test.cjs`

Expected: FAIL con 12 keys actuales.

- [x] **Step 3: Implementar las dos RPC y retirar autoridad del payload general**

La RPC operativa acepta sólo `fondo_caja`, `fondo_caja_cigarros`, `dias_aviso_vence`, `dias_plazo_fiado`, `recargo_fiado_pct`, `motivos_egreso_extra`. La privilegiada acepta sólo `pin_hash`, `permisos_empleado`, `modulo_fiado`, `modulo_vencimientos`, `modulo_cigarros`, `whatsapp_dueno` y exige dueño/admin.

- [x] **Step 4: Actualizar proyección rollback**

`qa.v4_to_legacy` deriva `nombre` desde `comercios.nombre` y mezcla desde el blob congelado `nroVenta`, `ultBackup`, `pinDuenio`, `pinHash`, `permisosEmpleado` antes del CAS.

- [x] **Step 5: Ejecutar test de centinelas**

Usar valores distintos `BLOB_*` y `V4_*`, ejecutar rollback real y comparar los cinco valores byte por byte. Verificar además 10 canónicas, 6 legacy-only y que `permisosEmpleado` no cae al default permisivo.

---

### Task 5: Leases append-only de siete días

**Files:**
- Create: `supabase/f5/03_leases.sql`
- Create: `supabase/tests/f5_offline.test.sql`

**Interfaces:**
- Produces: `public.f5_chequear_autoridad(uuid,uuid)`, `public.f5_obtener_lease(uuid,uuid,uuid)`, `private.f5_validar_operacion_offline(text,uuid,uuid,uuid,timestamptz,text)`.

- [x] **Step 1: Escribir pruebas de 7 días, reemplazo y carrera**

Probar que el chequeo a los cinco minutos no inserta leases; que la emisión estable crea como máximo uno por día; que un lease nuevo conserva `lease_family_id`; que una operación creada durante el reemplazo sigue validando contra el lease anterior; y que una familia nueva se crea tras revocación dura/persona/dispositivo distinto.

- [x] **Step 2: Crear tablas append-only**

```sql
create table public.autoridad_leases (
  lease_id uuid primary key,
  lease_family_id uuid not null,
  comercio_id uuid not null references public.comercios(id),
  user_id uuid not null references auth.users(id),
  device_id uuid not null,
  rol text not null check (rol in ('duenio','admin','empleado')),
  permisos jsonb not null,
  operation_types text[] not null,
  permission_version bigint not null,
  contract_version integer not null default 1,
  ttl_seconds integer not null check (ttl_seconds > 0),
  issued_at timestamptz not null,
  valid_until timestamptz not null,
  aceptacion_hasta timestamptz not null,
  created_at timestamptz not null default now(),
  check (valid_until = issued_at + make_interval(secs => ttl_seconds)),
  check (aceptacion_hasta = valid_until + interval '30 days')
);
create table public.autoridad_revocaciones (
  id uuid primary key default gen_random_uuid(),
  lease_family_id uuid not null,
  comercio_id uuid not null references public.comercios(id),
  motivo text not null,
  dura boolean not null,
  revocada_por uuid,
  created_at timestamptz not null default now()
);
```

Añadir triggers que rechacen `UPDATE`/`DELETE`; índices `(comercio_id,user_id,device_id,issued_at desc)` y `(lease_family_id,created_at desc)`.

- [x] **Step 3: Implementar emisión separada del chequeo**

`f5_chequear_autoridad` devuelve autoridad actual y causas sin insertar. `f5_obtener_lease` impone la política beta `ttl_seconds = 604800` al emitir y sólo emite sin lease vigente, con cambio de contrato/permiso/dispositivo o cuando `valid_until - server_now <= interval '6 days'`. La tabla valida coherencia temporal sin congelar el valor de política, de modo que un TTL futuro distinto no exige cambiar constraints.

- [x] **Step 4: Implementar validación histórica honesta**

Validar `created_at` dentro de `[issued_at,valid_until]`, tipo literal en `operation_types`, `aceptacion_hasta`, comercio/persona/dispositivo/familia. No rechazar por la mera existencia de un lease posterior. `occurred_at_device` puede estar en el pasado.

- [x] **Step 5: Verificar RLS, grants y append-only**

El cliente sólo lee sus leases; no inserta/actualiza/borra. Ejecutar advisors de seguridad/rendimiento y guardar resultados.

---

### Task 6: Corrientes offline, raíces/segmentos y cola unificada

**Files:**
- Create: `supabase/f5/04_offline_streams.sql`
- Modify: `supabase/tests/f5_offline.test.sql`
- Create: `supabase/tests/f5_offline_matrix.test.sql`

**Interfaces:**
- Produces: las cinco RPC offline versionadas; `private.f5_stream_key(...)`; `public.f5_excepciones_offline` con `entidad` y `entidad_id`.

- [x] **Step 1: Escribir matriz de cinco operaciones y conflictos**

Para cada tipo: crear con lease, revocar persona, drenar tarde dentro de 30 días y comprobar ledger/sesión/ajuste. Añadir dos dispositivos que abren la misma caja: ambos drenan, el segundo queda `requiere_conciliacion`, la alerta existe y ninguna RPC devuelve bloqueo por cantidad de raíces.

- [x] **Step 2: Extender el esquema operativo**

Agregar `lease_id`, `lease_family_id`, `session_segment_id`, `created_at_device` y `stream_key` a ventas/pagos/egresos/movimientos/cierres según corresponda. Agregar a `caja_sesiones` `lease_family_id`, `stream_key`, `conflicto_con_sesion_id` y `provisional`. Crear `caja_sesion_segmentos(segment_id,root_session_id,opened_at_device,closed_at_device,created_at)`.

- [x] **Step 3: Derivar el stream en servidor**

```sql
create or replace function private.f5_stream_key(
  p_comercio_id uuid, p_user_id uuid, p_device_id uuid,
  p_caja_id uuid, p_lease_family_id uuid, p_root_session_id uuid
) returns text language sql immutable set search_path='' as $$
  select encode(sha256(convert_to(concat_ws(':',
    p_comercio_id,p_user_id,p_device_id,p_caja_id,p_lease_family_id,p_root_session_id
  ),'UTF8')),'hex');
$$;
```

Cada RPC recalcula la clave y compara pertenencia; nunca confía en el string cliente.

- [x] **Step 4: Implementar una raíz por dispositivo/caja y segmentos sucesivos**

La primera colisión crea raíz `requiere_conciliacion`; aperturas posteriores del mismo dispositivo agregan segmento a esa raíz. Dispositivos diferentes pueden crear raíces adicionales. Desde la segunda raíz se inserta alerta informativa; no existe constraint de máximo por caja.

- [x] **Step 5: Crear cola común tipada**

```sql
create table public.f5_excepciones_offline (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id),
  entidad text not null check (entidad in ('operacion','sesion','cierre')),
  entidad_id uuid not null,
  estado text not null check (estado in ('aplicada_sin_reconocer','pendiente_de_decision','requiere_conciliacion','resuelta')),
  causa text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid
);
create index f5_excepciones_pendientes_idx
on public.f5_excepciones_offline(comercio_id,estado,created_at)
where estado <> 'resuelta';
```

- [x] **Step 6: Verificar llegadas tardías y locks**

El cierre inmutable recibe `cierre_ajustes`; ninguna llegada tardía modifica totales cerrados. Mantener transacciones cortas y orden de locks estable. Documentar que la barrera por relación de F4.3 continúa siendo limitación aceptada sólo para beta monocomercio.

---

### Task 7: Preparar un comercio QA dedicado en `v4_only`

**Files:**
- Create: `supabase/tests/f5_v4only_fixture.sql`
- Modify: `entregables/QA-F5-EVIDENCIA.md`

**Interfaces:**
- Consumes: cadena existente F3.4 → F4.1 → F4.2 → F4.3 y RPC `preflight_cutover_f34`, `registrar_snapshot_migracion_f4`, `habilitar_bootstrap_candidato_f42`, `registrar_prueba_bootstrap_f42`, `registrar_preparacion_f43`, `activar_v4_only_f43`.
- Produces: un comercio QA exclusivo para minimización con `migraciones_f4.estado='v4_only'`; el comercio principal `COV_QA_COMERCIO_01` permanece en `rollback`.

- [ ] **Step 1: Crear fixture aislado sin reutilizar identidades activas**

Crear mediante credencial administrativa de QA un Auth user técnico nuevo, comercio `F5_PROJECTION_QA`, licencia, membresía `duenio`, caja y dispositivo propios. Generar IDs en tiempo de ejecución y registrar sólo sus hashes/identificadores no secretos en la evidencia. El preflight confirma que ese usuario no tiene otra membresía activa.

- [ ] **Step 2: Generar evidencia F3.4 sin romper el requisito de snapshot cero**

Partir de las diez colecciones de negocio vacías. Producir al menos 20 cambios comparables de configuración mediante el cliente shadow y restaurar al final sus valores originales; drenar V3/V4 y exigir `preflight_cutover_f34(..., p_min_coincidencias => 20).listo = true`. La configuración no integra los conteos que `_f42_snapshot_es_cero` exige en cero.

- [ ] **Step 3: Recorrer F4.1 y F4.2 por las RPC reales**

Registrar snapshot `micomercio-f4.1-snapshot-v1` con conteos cero e integridad OK mediante `registrar_snapshot_migracion_f4`; llamar `habilitar_bootstrap_candidato_f42` y comprobar `estado='validacion'`; arrancar un perfil limpio, ejecutar pull completo sin lecturas/escrituras legacy y registrar el resultado con `registrar_prueba_bootstrap_f42`.

- [ ] **Step 4: Preparar dispositivos y activar F4.3**

Cerrar sesiones, drenar outbox, registrar cada dispositivo conocido mediante `registrar_preparacion_f43` y llamar `activar_v4_only_f43(p_rollback_hours => 168)`. Expected: `estado_f43` informa `v4_only`, el adapter está activo y un reload completa loader post-fence más full pull.

- [ ] **Step 5: Probar aislamiento del fixture**

```sql
select c.nombre,m.estado
from public.comercios c
join public.migraciones_f4 m on m.comercio_id=c.id
where c.nombre in ('COV_QA_COMERCIO_01','F5_PROJECTION_QA')
order by c.nombre;
```

Expected: `COV_QA_COMERCIO_01 = rollback` y `F5_PROJECTION_QA = v4_only`. Guardar evidencia de la cadena completa antes de iniciar la minimización.

---

### Task 8: Manifiesto de proyección y minimización fail-closed

**Files:**
- Create: `supabase/f5/05_projection_manifest.sql`
- Create: `supabase/tests/f5_projection.test.sql`
- Modify: `entregables/MiComercio-F5-DESARROLLO.html`
- Modify: `tests/f5-client.test.cjs`

**Interfaces:**
- Produces: `public.f5_obtener_proyeccion(uuid,uuid,text,bigint)` y manifiesto `{id,version,hash,collections}`; F3.4 coverage exacta.

- [x] **Step 1: Escribir pruebas de omisión autorizada y reducción maliciosa**

Empleado con sólo `ventas_registrar` recibe POS mínimo; sin `fiado_operar` no recibe clientes/saldos; sin `resumen_ver` no recibe agregados. Un manifiesto cliente con una colección menos debe producir `F34_COVERAGE_FAILURE`.

- [x] **Step 2: Implementar derivación normativa**

El servidor deriva colecciones/campos desde rol, diez permisos, `permission_version` y versión de contrato. El hash usa JSON canónico ordenado. La RPC no acepta una lista de campos propuesta por el cliente.

- [x] **Step 3: Conservar stock exacto**

La proyección POS incluye productos, combos/promociones aplicables y movimientos mínimos `{id,producto_id,cantidad,tipo,occurred_at_device}` suficientes para `stockBase + suma(movs)`.

- [x] **Step 4: Adaptar pull y F3.4**

El cliente registra cobertura esperada, declarada, comparada, omisiones autorizadas y faltantes. PASS exige igualdad exacta del manifiesto rederivado por servidor y cobertura completa.

- [x] **Step 5: Repetir matriz offline tras minimizar**

Reejecutar completa la Task 6 con cada combinación representativa de permisos. Expected: las cinco operaciones conservan continuidad y ningún dato no autorizado llega en `v4_only`.

---

### Task 9: Cliente con identidad, lease y bloqueos compuestos

**Files:**
- Modify: `entregables/MiComercio-F5-DESARROLLO.html`
- Modify: `tests/f5-client.test.cjs`

**Interfaces:**
- Produces: `f5Estado`, `f5InstalarLease`, `f5ChequearAutoridad`, `assertWritable(action) -> {ok,causas[]}` y navegación derivada de permisos.

- [x] **Step 1: Escribir tests de autoridad no local**

Comprobar que no existen `LROLE`, `guardarRolLocal`, `cargarRolLocal`; manipular `localStorage` no cambia rol/permisos; un lease reemplazado sólo se usa para operaciones ya creadas.

- [x] **Step 2: Crear estado F5 persistente en IndexedDB**

Persistir por comercio/dispositivo `{membership,permissionVersion,lease,serverClock,checkedAt}`. Instalar reemplazo atómicamente y estampar cada operación con el lease capturado al comenzar.

- [x] **Step 3: Reemplazar permisos legacy en navegación y acciones**

Dueño/admin derivan catálogo completo; empleado usa el conjunto explícito del servidor. El PIN queda como bloqueo visual y nunca muta autoridad.

- [x] **Step 4: Componer sólo lectura**

`assertWritable` devuelve simultáneamente `F43_DEVICE_FROZEN`, `F33_LICENSE_NOT_OPERABLE` y `F5_LEASE_EXPIRED_OR_REVOKED`. La interfaz enumera cada causa con acción; soporte recibe los mismos códigos.

- [x] **Step 5: Probar reloj, timeout y revocación**

Chequeo cada cinco minutos. Timeout/5xx conserva lease existente sin emitir otro. Respuesta explícita revocada corta escritura. El reloj estimado usa la última diferencia servidor/dispositivo validada.

---

### Task 10: Objetos locales conscientes de sesión y reportes correctos

**Files:**
- Modify: `entregables/MiComercio-F5-DESARROLLO.html`
- Modify: `tests/f5-client.test.cjs`

**Interfaces:**
- Produces: `_v4cajaSesionId`, `_v4sessionSegmentId`, `_v4receivedAt`; `turnoActual(sessionId)`; grupos sintéticos legacy de sólo lectura.

- [x] **Step 1: Escribir tests de creación local antes del push**

Una venta, pago, egreso, movimiento y cierre deben llevar `_v4cajaSesionId` antes de entrar en `db.*`; el constructor V4 copia ese valor aunque `f3Estado.session` cambie después.

- [x] **Step 2: Estampar sesión en los cinco objetos**

En `cerrarVenta`, capturar sesión/segmento al comenzar y añadir los campos al objeto `venta` antes de `db.ventas.push(venta)`. Aplicar la misma regla en pagos, egresos, movimientos y cierres. El pull conserva el mapeo y agrega `_v4receivedAt`.

- [x] **Step 3: Reescribir `turnoActual(sessionId)`**

Filtrar exclusivamente por `_v4sessionSegmentId ?? _v4cajaSesionId`. Sin sesión real, devolver `null`; Caja muestra “No hay turno abierto”, botón de apertura autorizado y ningún total/control de cierre.

- [x] **Step 4: Implementar compatibilidad legacy sin atribución falsa**

Cada cierre sin sesión produce grupo `legacy:<cierre.id>` y cada fila huérfana grupo `legacy:sin_cierre:<AAAA-MM-DD>`. Sólo Resumen los muestra como “Histórico sin sesión”; Caja jamás los consume.

- [x] **Step 5: Corregir cálculo event-based sin depender de la fecha mutable de la venta**

El código base ya asigna `v.anuladaFecha` en `anularVenta()` y el pull canónico la reconstruye desde `venta_anulaciones.occurred_at_device`; QA contiene dos ventas anuladas y ninguna carece de fecha. Aun así, el cálculo no depende de ese campo: `cantidadVendidaProducto` cuenta la venta en su fecha original aunque tenga anulación posterior, y `resumenStockProductoPeriodo` toma la reposición del movimiento positivo `anulacion_venta`/`ajuste` en la propia `m.fecha`. Así también funcionan las anulaciones legacy sin `anuladaFecha` siempre que conserven el movimiento de reposición.

Antes de la migración final se cuenta `v.anulada && !v.anuladaFecha`. Para cada caso se comprueba que exista un único conjunto de movimientos positivos generado por “Anulación de venta Nº<nro>” cuyas cantidades por producto coincidan con la venta; si falta o es ambiguo se marca `reporte_stock_legacy_incompleto` y no se inventa una fecha. Test principal: venta de 3 el día D y anulación D+1 produce D `{vendidas:3,otros:0}` y D+1 `{vendidas:0,otros:3}`.

- [x] **Step 6: Mantener Movimientos diario y marcar llegada tardía**

No filtrar por sesión. Una venta drenada D+4 con `occurred_at_device=D` corrige D y muestra marca “Sincronizado tarde” derivada de `_v4receivedAt`; el cierre usa `cierre_ajustes` y conserva sus totales.

- [x] **Step 7: Ejecutar regresión UX**

Run: `node --test tests/f5-client.test.cjs tests/f43-rollback.test.cjs tests/ui-busquedas-pagos.test.cjs`

Expected: PASS total; siguen disponibles buscadores, rubros, pago unificado y Movimientos en cuentas.

---

### Task 11: Compatibilidad, roster, tickets y `app_schema_meta`

**Files:**
- Create: `supabase/f5/06_security_compatibility.sql`
- Create: `supabase/tests/f5_compatibility.test.sql`
- Modify: `entregables/MiComercio-F5-DESARROLLO.html`

**Interfaces:**
- Produces: roster cursor-based; `ticket_ref` determinista; acceso mínimo intencional a versión de esquema.

- [x] **Step 1: Probar roster de 33**

Insertar 33 fixtures, paginar por `(created_at,id)` sin OFFSET y verificar procesados = esperados = 33.

- [x] **Step 2: Probar tickets concurrentes**

Dos dispositivos con el mismo `ticket_seq` generan UUID/idempotency distintos y `ticket_ref = <caja>-<seq>-<uuid8>` distinto. Ningún flujo fiscal usa `ticket_seq` desnudo.

- [x] **Step 3: Inventariar `app_schema_meta` antes de tocar RLS**

Buscar cada consumidor cliente/RPC y escribir una prueba de lectura legítima. Elegir una de dos implementaciones cerradas: mover la lectura a `public.f5_schema_meta()` con grant sólo a `authenticated`, o habilitar RLS con policy de SELECT mínima. No conceder escritura a `anon`/`authenticated`.

- [x] **Step 4: Ejecutar advisors y reparar índices F5**

Comprobar índices en cada FK nueva y en filtros RLS. Ejecutar advisors de seguridad y rendimiento; no aceptar `rls_disabled`, grants inesperados o FK sin índice en objetos F5.

- [x] **Step 5: Verificar que producción no cambió**

Comparar la lista de migraciones y funciones del entorno productivo con el baseline. Expected: cero cambios fuera de QA y artefactos locales.

---

### Task 12: Gate final F5 y paquete de prueba

**Files:**
- Create: `entregables/QA-F5-EVIDENCIA.md`
- Create: `entregables/MiComercio-F5-PRUEBA.zip`

**Interfaces:**
- Consumes: todas las tareas anteriores.
- Produces: artefacto compartible de F5, scripts SQL/Edge Functions, pruebas y evidencia; no migración final.

- [x] **Step 1: Ejecutar toda la suite cliente y SQL**

Run:

```powershell
node --test tests/*.test.cjs tests/*.test.mjs
```

Ejecutar luego las cuatro suites SQL en QA con rollback de fixtures.

Expected: cero fallos.

- [ ] **Step 2: Ejecutar matriz manual de cinco operaciones**

Con red, sin red, revocación normal, revocación dura, llegada dentro de 30 días, llegada posterior, cierre y reapertura offline, dos dispositivos en conflicto y tres raíces de dispositivos distintos. Verificar que la tercera raíz alerta pero no bloquea.

Estado: la matriz automatizada de servidor está completa. Sigue pendiente repetirla desde un navegador real sobre el comercio persistente `F5_PROJECTION_QA` en estado `v4_only`.

- [x] **Step 3: Capturar evidencia y hashes**

Registrar versiones, fecha, proyecto QA, casos, resultados, advisors, limitaciones aceptadas y SHA-256 de HTML/SQL/funciones/tests.

- [x] **Step 4: Crear ZIP sin secretos**

Incluir `entregables/MiComercio-F5-PRUEBA.html`, `supabase/f5/`, `supabase/functions/`, `tests/`, especificación, plan, evidencia y verificadores `verificar.sh`/`verificar.ps1`. Excluir tokens, claves, `.env`, dumps con datos y credenciales técnicas. Todas las suites deben resolver el mismo artefacto incluido mediante `tests/lib/artefacto.cjs`.

- [ ] **Step 5: Gate de salida**

F5 queda listo para iniciar F6 sólo si pasan seguridad, concurrencia, offline, minimización, rollback, sesión y regresión UX. La migración final del sistema continúa diferida hasta que F6 también esté terminado.

## Self-Review

- Spec coverage: Tasks 2–11 cubren secciones 3–19; Task 1 cubre los tres seams F4.3 diagnosticados; Task 7 crea el entorno `v4_only` exigido por §8; Task 12 cubre aceptación y entrega.
- Placeholder scan: superado; cada paso define contenido y resultado esperado.
- Type consistency: servidor usa `caja_sesion_id`/`session_segment_id`; cliente usa `_v4cajaSesionId`/`_v4sessionSegmentId`; la cola usa `entidad`/`entidad_id`; el lease usa `lease_id`/`lease_family_id` en todas las tareas.
- Deployment boundary: sólo QA durante F5; producción e integración/migración conjunta F5/F6 quedan expresamente fuera.
