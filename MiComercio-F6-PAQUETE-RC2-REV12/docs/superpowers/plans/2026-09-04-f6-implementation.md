# F6 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Incorporar alta interna por invitación, onboarding reanudable, licencia beta de siete días, soporte auditable y un piloto monocomercio con cierres independientes por turno.

**Architecture:** F6 agrega contratos SQL privados y transaccionales sobre las autoridades ya existentes de F5, dos Edge Functions como única frontera HTTP y dos clientes separados: el sistema del comercio y el panel interno de soporte. El estado de licencia se evalúa perezosamente en servidor, las superficies limitadas por IP reutilizan `clientIp()` de F5 y producción sólo recibe una migración conjunta después del piloto.

**Tech Stack:** HTML/CSS/JavaScript sin framework, Node.js 24 y `node:test`, Supabase Auth, Edge Functions/Deno, PostgreSQL 15+ y SQL transaccional.

**Spec:** `docs/superpowers/specs/2026-09-04-f6-alta-onboarding-licencias-soporte-beta-design.md`

## Global Constraints

- Base inmutable de referencia: F5 rev10, build `5.0.0-f5-rc2`, artefacto SHA-256 `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`.
- Desarrollo y piloto únicamente en Supabase QA `qrvdfqpxutymmlcplsal`; producción queda fuera de este plan.
- No editar ningún archivo de `sources/` ni usar las carpetas `revision-*` como fuente canónica.
- No crear tablas paralelas de comercios, membresías, dispositivos, sesiones, cierres o licencias.
- PostgreSQL 15+ es obligatorio; toda migración aborta si `server_version_num < 150000`.
- Toda función privilegiada usa `SECURITY DEFINER`, `search_path = ''`, nombres calificados y grants explícitos; `PUBLIC` se revoca.
- Invitaciones y soporte pasan por Edge Function; las RPC privadas no son ejecutables directamente por `anon` ni `authenticated`.
- Extensión y compensación comparten `604800` segundos; cualquier exceso se rechaza entero con `F6_EXTENSION_SUPERA_SALDO`.
- La autorización usa `estado_efectivo`, nunca `estado_administrativo` crudo ni un job de vencimiento.
- El piloto no empieza sin baseline F2–F5 reproducible, gate persistente `v4_only` y resolución verificada de `verificarPin()` en dispositivos nuevos.
- La barrera F4.3 conserva el límite de 15 segundos de F5 §8 y sólo se acepta para el piloto monocomercio.
- Cerrar un turno no cierra el día ni invalida el lease; cada sesión/segmento tiene su cierre y Resumen sólo consolida para lectura.
- Este espejo no contiene `.git`: no inicializar uno. Cada task termina con pruebas y un hash de checkpoint en `entregables/QA-F6-EVIDENCIA.md` en lugar de un commit.

## File Map

- `supabase/f6/01_foundation.sql`: tablas, columnas, enums por `CHECK`, índices, versión mínima y privilegios base.
- `supabase/f6/02_invitations_provisioning.sql`: autorización de alta independiente del canal, emisión/consumo de invitación y provisión idempotente.
- `supabase/f6/03_onboarding.sql`: estado reanudable, pasos canónicos y comprobación final sin efectos.
- `supabase/f6/04_licenses.sql`: evaluación perezosa, saldo adicional y transiciones auditadas.
- `supabase/f6/05_support.sql`: operadores, lectura diagnóstica, comandos permitidos y rate-limit preflight.
- `supabase/f6/06_pilot_gate.sql`: evidencia de build, preflight F5/F6 y gates del piloto.
- `supabase/functions/_shared/f6-contracts.mjs`: validación pura de requests, acciones y respuestas F6.
- `supabase/functions/f6-invitations/index.ts`: frontera HTTP de invitaciones y provisión.
- `supabase/functions/f6-support/index.ts`: frontera HTTP del panel, licencias y acciones seguras.
- `entregables/MiComercio-F6-PRUEBA.html`: copia de trabajo creada byte a byte desde el artefacto F5 rev10 aprobado; incorpora el flujo de invitación/onboarding, estado efectivo de licencia y cierre por turno sin modificar el paquete F5.
- `entregables/MiComercio-Soporte-F6.html`: panel interno separado, sin capacidad comercial.
- `tests/f6-baseline.test.cjs`: dos pruebas que congelan F5 rev10 y los tres gates previos al piloto.
- `tests/f6-invitations-edge.test.mjs`: ocho pruebas de contratos y transporte de invitaciones.
- `tests/f6-onboarding-client.test.cjs`: ocho pruebas del asistente y simulación sin efectos.
- `tests/f6-license-client.test.cjs`: seis pruebas del contrato cliente de licencia.
- `tests/f6-support-edge.test.mjs`: seis pruebas de soporte, límites e IP.
- `tests/f6-support-ui.test.cjs`: cuatro pruebas de permisos y presentación del panel.
- `tests/f6-turnos.test.cjs`: cuatro regresiones de cierres independientes y consolidado diario.
- `tests/f6-package-identity.test.cjs`: dos pruebas de identidad cruzada y cobertura del paquete F6.
- `supabase/tests/f6_schema.test.sql`: seguridad estructural y versión mínima.
- `supabase/tests/f6_invitations.test.sql`: unicidad, carreras, expiración y provisión.
- `supabase/tests/f6_onboarding.test.sql`: pasos, idempotencia y simulación.
- `supabase/tests/f6_licenses.test.sql`: tiempo, precedencia, saldo, concurrencia y auditoría.
- `supabase/tests/f6_support.test.sql`: autoridad interna, prohibiciones, rate limits y auditoría.
- `supabase/tests/f6_pilot_gate.test.sql`: build, precondiciones F5 y cierre turno por turno.
- `entregables/BUILD-IDENTITY-F6.json`: identidad normativa del candidato F6.
- `entregables/QA-F6-EVIDENCIA.md`: resultados, checkpoints y límites no ejecutados.
- `entregables/PILOTO-F6-7-DIAS.md`: bitácora y decisión de salida del piloto.

---

### Task 1: Congelar el baseline y comprobar precondiciones

**Files:**
- Create: `entregables/QA-F6-EVIDENCIA.md`
- Create: `entregables/MiComercio-F6-PRUEBA.html`
- Create: `tests/f6-baseline.test.cjs`
- Read: `entregables/MiComercio-F5-PAQUETE-REV10-2026-09-04/entregables/MiComercio-F5-PRUEBA.html`
- Read: `entregables/MiComercio-F5-PAQUETE-REV10-2026-09-04/BUILD-IDENTITY-F5.json`

**Interfaces:**
- Consumes: F5 rev10 y su verificador existente.
- Produces: baseline documentado con hashes, versión y bloqueantes del piloto.

- [x] **Step 1: Escribir las dos pruebas de identidad que deben fallar ante deriva**

```js
test('F6 parte exactamente de F5 rev10 rc2', () => {
  assert.equal(build.build, '5.0.0-f5-rc2');
  assert.equal(sha256(f5SourceHtml), '05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43');
  assert.deepEqual(f6WorkingHtml, f5SourceHtml);
});

test('la evidencia enumera los tres gates previos al piloto', () => {
  for (const gate of ['v4_only', 'baseline F2–F5', 'verificarPin()']) {
    assert.match(evidence, new RegExp(escapeRegex(gate)));
  }
});
```

- [x] **Step 2: Ejecutar la prueba y confirmar el fallo inicial**

Run: `node --test tests/f6-baseline.test.cjs`

Expected: FAIL porque todavía no existen `MiComercio-F6-PRUEBA.html` ni `QA-F6-EVIDENCIA.md`.

- [x] **Step 3: Crear la copia de trabajo y la evidencia inicial con hechos reproducibles**

Copiar sin transformar bytes `entregables/MiComercio-F5-PAQUETE-REV10-2026-09-04/entregables/MiComercio-F5-PRUEBA.html` a `entregables/MiComercio-F6-PRUEBA.html`; comprobar inmediatamente que ambos hashes son `05412b8b2edcd785716f854f88fc863c47c51a659f17394fb05bbd7a5a537d43`. No sobrescribir `entregables/MiComercio.html`, que es una copia anterior, ni modificar el paquete rev10.

La evidencia debe registrar el hash del HTML, `5.0.0-f5-rc2`, las 62 pruebas locales F5, las ocho suites SQL autorreportadas y distinguir expresamente los dos puntos todavía no reproducidos: navegador `v4_only` y baseline desde cero. Debe agregar `verificarPin()` como tercer gate previo al piloto, sin declararlo corregido.

- [x] **Step 4: Ejecutar el paquete F5 en frío y guardar la salida**

Run: `powershell -NoProfile -ExecutionPolicy Bypass -File entregables/MiComercio-F5-PAQUETE-REV10-2026-09-04/verificar.ps1`

Expected: cobertura completa, sintaxis válida y 62/62 pruebas. Si PowerShell produce otra cifra o falla, detener F6 y registrar el resultado real.

- [x] **Step 5: Ejecutar nuevamente la prueba de identidad**

Run: `node --test tests/f6-baseline.test.cjs`

Expected: 2/2 PASS para baseline y gates. Esta suite permanece inmutable durante F6.

- [x] **Step 6: Registrar checkpoint**

Run: `Get-FileHash entregables/MiComercio-F6-PRUEBA.html,tests/f6-baseline.test.cjs -Algorithm SHA256`

Copiar ambos hashes bajo `## Checkpoint Task 1` en la evidencia. No intentar que la evidencia contenga su propio hash: eso es autorreferencial e inestable; su hash final se registra desde `SHA256SUMS-F6.txt` al empaquetar.

### Task 2: Crear el esquema fundacional F6

**Files:**
- Create: `supabase/f6/01_foundation.sql`
- Create: `supabase/tests/f6_schema.test.sql`

**Interfaces:**
- Consumes: `public.comercios`, `public.comercio_configuracion`, `public.comercio_miembros`, `public.comercio_licencias`, `public.cajas`.
- Produces: `private.f6_alta_autorizaciones`, `private.f6_invitaciones`, `private.f6_onboarding`, `private.f6_licencia_eventos`, `private.f6_soporte_operadores`, `private.f6_soporte_eventos`, `private.f6_rate_intentos` y columnas F6 de `comercio_licencias`.

- [x] **Step 1: Escribir el test SQL estructural antes de la migración**

```sql
begin;
do $test$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'F6_POSTGRES_15_REQUIRED';
  end if;
  if to_regclass('private.f6_alta_autorizaciones') is null then raise exception 'F6_AUTHORIZATIONS_MISSING'; end if;
  if to_regclass('private.f6_invitaciones') is null then raise exception 'F6_INVITES_MISSING'; end if;
  if to_regclass('private.f6_onboarding') is null then raise exception 'F6_ONBOARDING_MISSING'; end if;
  if to_regclass('private.f6_licencia_eventos') is null then raise exception 'F6_LICENSE_AUDIT_MISSING'; end if;
  if has_table_privilege('authenticated','private.f6_invitaciones','SELECT') then
    raise exception 'F6_PRIVATE_EXPOSED';
  end if;
end
$test$;

select gen_random_uuid() as license_comercio_id \gset
select set_config('f6.test_license_comercio_id', :'license_comercio_id', true);

insert into public.comercios(
  id,nombre,timezone,business_day_cutoff,architecture_version,schema_version
) values (
  :'license_comercio_id','F6_SCHEMA_QA','America/Argentina/Buenos_Aires','04:00',4,4
);

insert into public.comercio_licencias(
  comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
  estado_administrativo,valid_from,valid_until
) values (
  :'license_comercio_id',false,'beta',30,7,
  'pendiente',null,null
);

do $test$
declare
  v_comercio_id uuid := current_setting('f6.test_license_comercio_id')::uuid;
begin
  begin
    update public.comercio_licencias
       set estado_administrativo='activa'
     where comercio_id=v_comercio_id;
    raise exception 'F6_ACTIVE_LICENSE_WITHOUT_DATES_ACCEPTED';
  exception when check_violation then
    null;
  end;
end
$test$;
rollback;
```

- [x] **Step 2: Ejecutar el test SQL en una transacción descartable**

Run against QA: `psql "$env:MICOMERCIO_QA_DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/f6_schema.test.sql`

Expected: FAIL con `F6_INVITES_MISSING`.

- [x] **Step 3: Implementar la guarda y tablas base**

```sql
do $guard$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'F6_POSTGRES_15_REQUIRED';
  end if;
end
$guard$;

alter table public.comercio_licencias
  add column if not exists estado_administrativo text not null default 'activa',
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists pause_started_at timestamptz,
  add column if not exists extension_used_seconds bigint not null default 0,
  add column if not exists state_version bigint not null default 1;

alter table public.comercio_licencias
  add constraint comercio_licencias_f6_estado_check
    check (estado_administrativo in ('pendiente','activa','pausada','cancelada')),
  add constraint comercio_licencias_f6_extension_check
    check (extension_used_seconds between 0 and 604800),
  add constraint comercio_licencias_f6_beta_dates_check
    check (
      plan <> 'beta'
      or (
        estado_administrativo = 'pendiente'
        and valid_from is null
        and valid_until is null
      )
      or (
        estado_administrativo in ('activa','pausada')
        and valid_from is not null
        and valid_until is not null
        and valid_until > valid_from
      )
      or (
        estado_administrativo = 'cancelada'
        and (
          (valid_from is null and valid_until is null)
          or (
            valid_from is not null
            and valid_until is not null
            and valid_until > valid_from
          )
        )
      )
    );
```

El test usa un `license_comercio_id` de fixture creado dentro de la misma transacción. Debe demostrar que la licencia beta `pendiente` sin fechas se inserta, que `activa` o `pausada` sin un par válido falla y que una fecha parcial falla para cualquier estado. También debe cubrir `cancelada` antes y después de activarse.

Crear las siete tablas privadas con PK, FK, timestamps de servidor, checks cerrados e índices por comercio/ventana. `private.f6_invitaciones.token_hash`, `contacto_hash`, `ip_hash` y hashes de rate limit deben exigir 64 hexadecimales. `private.f6_soporte_eventos` y `private.f6_licencia_eventos` son append-only.

- [x] **Step 4: Revocar privilegios y proteger auditoría contra truncación**

```sql
revoke all on table
  private.f6_invitaciones,
  private.f6_alta_autorizaciones,
  private.f6_onboarding,
  private.f6_licencia_eventos,
  private.f6_soporte_operadores,
  private.f6_soporte_eventos,
  private.f6_rate_intentos
from public, anon, authenticated, service_role;
revoke select on table public.comercio_licencias from anon, authenticated;
```

No revocar privilegios sobre otras tablas del esquema `private`: F5 debe quedar intacto. Agregar triggers `BEFORE UPDATE OR DELETE` y `BEFORE TRUNCATE` que eleven `F6_AUDIT_APPEND_ONLY`; el único camino de inserción es la función privada auditora. Conceder a `service_role` únicamente `EXECUTE` sobre los wrappers `_f6_service_*` necesarios.

- [x] **Step 5: Ejecutar migración y test dentro de una transacción descartable**

Run against QA copy: apply `supabase/f6/01_foundation.sql`, then `supabase/tests/f6_schema.test.sql`.

Expected: PASS y rollback sin objetos persistentes en la primera corrida.

- [x] **Step 6: Registrar checkpoint**

Run: `Get-FileHash supabase/f6/01_foundation.sql,supabase/tests/f6_schema.test.sql -Algorithm SHA256`

Anotar hashes bajo `## Checkpoint Task 2`.

### Task 3: Implementar invitación y provisión idempotente

**Files:**
- Create: `supabase/f6/02_invitations_provisioning.sql`
- Create: `supabase/tests/f6_invitations.test.sql`

**Interfaces:**
- Consumes: tablas de Task 2 y catálogo/permisos F5.
- Produces: núcleo `private._f6_provisionar_comercio(uuid,uuid,uuid)` y cinco mutaciones/consultas privadas; más wrappers `public.f6_service_*` ejecutables únicamente por `service_role`, para que PostgREST sirva a la Edge Function sin exponer el esquema `private`.
- Returns: JSONB con `ok`, `code`, `invitation_id`, `comercio_id`, `onboarding_estado`; nunca devuelve `token_hash` ni datos de otra invitación.

- [x] **Step 1: Escribir pruebas SQL de uso único, expiración e idempotencia**

```sql
select private._f6_service_emitir_invitacion(
  :'support_user'::uuid,
  repeat('a',64), repeat('b',64), repeat('c',64),
  'Comercio piloto', 'America/Argentina/Buenos_Aires', '04:00',
  'alta beta', '11111111-1111-4111-8111-111111111111'::uuid
);

select private._f6_service_consumir_invitacion(
  repeat('a',64), :'owner_user'::uuid,
  '22222222-2222-4222-8222-222222222222'::uuid
);
```

Las aserciones deben comprobar: un comercio, un dueño, una caja, una licencia `pendiente`, un onboarding `no_iniciado`; el mismo idempotency key devuelve los mismos IDs; otro usuario y un segundo consumo fallan; token vencido o revocado no revela el comercio. `pg_get_functiondef` debe demostrar que `_f6_provisionar_comercio` lee `f6_alta_autorizaciones` y no `f6_invitaciones`: el autoservicio futuro cambia el emisor de la autorización, no el núcleo de provisión.

- [x] **Step 2: Ejecutar y comprobar el fallo**

Run against QA copy: `supabase/tests/f6_invitations.test.sql`.

Expected: FAIL porque las seis funciones aún no existen.

- [x] **Step 3: Implementar emisión y validación**

Las funciones deben validar actor interno activo, crear una autorización con `source='invitacion_interna'`, conservar zona horaria y corte comercial, tomar locks en orden `operador → contacto_hash → invitación`, revocar una invitación previa activa del mismo contacto al regenerar y fijar `valid_until = statement_timestamp() + make_interval(secs => 604800)`. Token, contacto e IP llegan como tres hashes distintos de 64 hexadecimales; nunca se guarda ni devuelve el token en claro.

```sql
perform pg_advisory_xact_lock(hashtext('f6-invite-contact:' || p_contacto_hash));
insert into private.f6_invitaciones(...)
values (..., 'pendiente', statement_timestamp(), statement_timestamp()+make_interval(secs=>604800), ...);
```

- [x] **Step 4: Implementar consumo y provisión atómica**

Dentro del lock de invitación: releer `FOR UPDATE`, validar estado/fecha y delegar en `_f6_provisionar_comercio(authorization_id,owner_user_id,idempotency_key)`. El núcleo toma el lock de autorización, comprueba la unicidad F5 de membresía activa e inserta `comercios`, `comercio_configuracion`, `comercio_miembros(rol='duenio')`, `cajas`, `comercio_licencias(estado_administrativo='pendiente')` y `private.f6_onboarding`. Marcar autorización e invitación como consumidas sólo al final de la misma transacción.

- [ ] **Step 5: Probar dos consumos concurrentes**

Abrir dos transacciones QA con el mismo token y distinto usuario después de aplicar temporalmente `01` y `02` en el checkpoint QA. Expected: una confirma; la otra devuelve el código genérico de invitación no disponible; nunca existen dos comercios. Esta prueba no se simula con dos llamadas secuenciales dentro de la misma transacción descartable y permanece pendiente hasta disponer de objetos visibles para dos conexiones.

- [ ] **Step 6: Ejecutar la suite SQL completa de invitaciones**

Expected: PASS para estados, carrera, idempotencia y ausencia de DML público.

- [x] **Step 7: Registrar checkpoint**

Run: `Get-FileHash supabase/f6/02_invitations_provisioning.sql,supabase/tests/f6_invitations.test.sql -Algorithm SHA256`

### Task 4: Crear la frontera HTTP de invitaciones

**Files:**
- Create: `supabase/functions/_shared/f6-contracts.mjs`
- Create: `supabase/functions/f6-invitations/index.ts`
- Create: `tests/f6-invitations-edge.test.mjs`
- Modify: `supabase/functions/_shared/f5-auth-core.mjs` only if an export required by the tests is absent; do not change `clientIp()`.

**Interfaces:**
- Consumes: `clientIp`, `sha256Hex`, `jsonResponse` de `_shared/f5-auth-core.mjs`; wrappers `public.f6_service_*` de Task 3 restringidos a `service_role`. El esquema `private` no se agrega a los esquemas expuestos de PostgREST.
- Produces: POST actions `preview`, `consume`, `issue`, `regenerate`, `revoke`.
- Rate-limited response: HTTP 429, `Retry-After`, body `{code:'RATE_LIMITED',retry_after:number}`.

- [x] **Step 1: Escribir exactamente ocho pruebas Node**

Cubrir: allowlist de acciones/campos; token inválido; preview genérico; consumo exige JWT; issue exige soporte; 429 traduce JSONB; usa extremo derecho de XFF; token y contacto se envían a SQL sólo como SHA-256 con pepper.

```js
test('F6 reutiliza clientIp y toma el extremo derecho de XFF', () => {
  const request = new Request('https://qa/f6', {
    headers: {'x-forwarded-for':'1.1.1.1, 203.0.113.8'},
  });
  assert.equal(clientIp(request), '203.0.113.8');
});
```

- [x] **Step 2: Ejecutar las ocho pruebas y confirmar el fallo**

Run: `node --test tests/f6-invitations-edge.test.mjs`

Expected: 0/8 PASS porque los contratos F6 no existen.

- [x] **Step 3: Implementar validadores puros**

```js
export const F6_INVITE_ACTIONS = Object.freeze(
  new Set(['preview','consume','issue','regenerate','revoke'])
);
export function limitedResponse(preflight) {
  return jsonResponse(
    {code:'RATE_LIMITED',retry_after:Number(preflight.retry_after)},
    429,
    {'Retry-After':String(preflight.retry_after)}
  );
}
```

- [x] **Step 4: Implementar la Edge Function sin duplicar resolución de IP**

```ts
import {clientIp, jsonResponse, sha256Hex} from '../_shared/f5-auth-core.mjs';
import {validateInvitationRequest, limitedResponse} from '../_shared/f6-contracts.mjs';
```

Validar CORS por allowlist de origen QA, tamaño máximo del body, JWT según acción y respuesta genérica para token inexistente/vencido/revocado. La Edge llama preflight SQL antes de la operación y nunca registra token o contraseña.

- [x] **Step 5: Ejecutar las ocho pruebas**

Run: `node --test tests/f6-invitations-edge.test.mjs`

Expected: 8/8 PASS.

- [x] **Step 6: Registrar checkpoint**

Hash de los tres archivos nuevos y del módulo F5 compartido; anotar que el hash de `f5-auth-core.mjs` debe permanecer igual al baseline si no se modificó.

### Task 5: Implementar onboarding reanudable y simulación

**Files:**
- Create: `supabase/f6/03_onboarding.sql`
- Create: `supabase/tests/f6_onboarding.test.sql`
- Modify: `entregables/MiComercio-F6-PRUEBA.html`
- Create: `tests/f6-onboarding-client.test.cjs`

**Interfaces:**
- Consumes: comercio provisionado, dueño F5 y licencia `pendiente`.
- Produces: `public.f6_onboarding_actual(uuid)`, `public.f6_confirmar_paso(uuid,text,jsonb,uuid)`, `public.f6_comprobar_onboarding(uuid)`.
- Client API: `window.MiComercioF6Onboarding.cargar()`, `.confirmarPaso(step,payload,key)`, `.simularFinal()`.

- [x] **Step 1: Escribir tests SQL para pasos y cero efectos**

Probar el orden cerrado `datos → caja → modulos → productos → empleados → clientes → comprobacion`, saltos permitidos sólo para empleados/clientes, idempotencia por key, rechazo a no-dueño y que `f6_comprobar_onboarding` no cambia los conteos de ventas, movimientos, cierres, outbox ni numeración.

- [x] **Step 2: Ejecutar SQL y confirmar funciones ausentes**

Expected: FAIL con `F6_ONBOARDING_RPC_MISSING`.

- [x] **Step 3: Implementar las tres RPC**

```sql
create or replace function public.f6_confirmar_paso(
  p_comercio_id uuid,
  p_paso text,
  p_payload jsonb,
  p_idempotency_key uuid
) returns jsonb
language sql security invoker set search_path = ''
as $$ select private._f6_confirmar_paso(auth.uid(),p_comercio_id,p_paso,p_payload,p_idempotency_key) $$;
```

El mutador privado toma `pg_advisory_xact_lock(hashtext(p_comercio_id::text))`, relee al dueño, usa las RPC canónicas de configuración/productos/personas y sólo actualiza progreso después de confirmar. `f6_comprobar_onboarding` confirma los invariantes, cambia onboarding a `completo` y activa la licencia pendiente en la misma transacción con `valid_from=statement_timestamp()` y `valid_until=statement_timestamp()+make_interval(secs=>604800)`; también inserta el primer evento de licencia. Si cualquier escritura falla, ninguna de las tres transiciones queda aplicada.

- [x] **Step 4: Escribir exactamente ocho pruebas cliente**

Cubrir: render inicial; reanuda último paso; guarda sólo al confirmar; corte conserva estado; pasos opcionales; exige caja; exige producto; simulación no llama `guardar`, `f3NuevaOperacion`, apertura/cierre ni mutaciones de `db`.

- [x] **Step 5: Ejecutar y confirmar las ocho fallas**

Run: `node --test tests/f6-onboarding-client.test.cjs`

- [x] **Step 6: Agregar el core F6 al HTML entre marcadores**

```js
/* F6_ONBOARDING_CORE_START */
const F6_ONBOARDING_STEPS=Object.freeze([
  'datos','caja','modulos','productos','empleados','clientes','comprobacion'
]);
function f6SimularComprobacion(snapshot){
  const clone=structuredClone(snapshot);
  return {
    ok:!!clone.cajaActiva&&clone.productosActivos>0,
    sideEffects:0
  };
}
/* F6_ONBOARDING_CORE_END */
```

La interfaz muestra progreso simple, botones Atrás/Continuar, “Omitir por ahora” sólo en empleados/clientes y un único resumen final. No entra al POS mientras los cuatro pasos obligatorios estén incompletos.

- [x] **Step 7: Ejecutar pruebas SQL y Node**

Expected: suite SQL PASS y 8/8 Node PASS.

- [x] **Step 8: Registrar checkpoint**

Hash de migración, SQL test, HTML y test cliente.

### Task 6: Implementar la máquina de estados de licencia

**Files:**
- Create: `supabase/f6/04_licenses.sql`
- Create: `supabase/tests/f6_licenses.test.sql`
- Modify: `entregables/MiComercio-F6-PRUEBA.html`
- Create: `tests/f6-license-client.test.cjs`

**Interfaces:**
- Produces: `private.f6_estado_licencia(uuid,timestamptz)`, `private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid)`, `public.f6_licencia_actual(uuid)`.
- State result: `{estado_efectivo,puede_operar,valid_from,valid_until,extension_used_seconds,extension_remaining_seconds,state_version}`.
- Commands: `pause`, `reactivate_without_compensation`, `reactivate_with_compensation`, `extend`, `cancel`.

- [x] **Step 1: Escribir test SQL de precedencia temporal**

```sql
select private.f6_estado_licencia(:'license_id', :'before_expiry'::timestamptz);
select private.f6_estado_licencia(:'license_id', :'at_expiry'::timestamptz);
```

Probar `cancelada > vencida > pausada > activa`, con igualdad exacta en `valid_until` resultando `vencida`. Confirmar que evaluar una fila pausada vencida no la escribe y que el estado público sí devuelve `vencida`.

- [x] **Step 2: Escribir tests SQL del saldo compartido**

Casos obligatorios: base 604800; extender 5 días; pedir 4 con 2 restantes y recibir rechazo completo; extender 2; dos reintentos con misma key consumen una vez; dos transacciones concurrentes no exceden 604800; pausas de 4+4 días rechazan la segunda compensación completa; reactivación sin compensación de una pausa todavía vigente no consume saldo; pausar, alcanzar `valid_until` y ejecutar `reactivate_without_compensation` devuelve `F6_REACTIVAR_REQUIERE_VIGENCIA` sin cambiar estado, fechas, saldo ni `state_version`; extender esa licencia vencida crea vigencia desde `statement_timestamp()` y la deja `activa` en la misma transacción.

- [x] **Step 3: Ejecutar y confirmar fallos**

Expected: FAIL por funciones ausentes.

- [x] **Step 4: Implementar evaluador perezoso**

```sql
v_estado := case
  when l.estado_administrativo = 'cancelada' then 'cancelada'
  when l.valid_until is not null and p_now >= l.valid_until then 'vencida'
  when l.estado_administrativo = 'pausada' then 'pausada'
  when l.estado_administrativo = 'pendiente' then 'pendiente'
  else 'activa'
end;
```

Reemplazar `private.licencia_activa(uuid)` para que delegue en este evaluador. Actualizar el contrato usado por `obtener_licencia_v4(uuid,uuid)` sin cambiar sus argumentos F3.3.

- [x] **Step 5: Implementar mutador con rechazo total**

```sql
if v_used + v_requested > 604800 then
  raise exception 'F6_EXTENSION_SUPERA_SALDO:%:%', v_requested, 604800-v_used;
end if;
if p_command = 'reactivate_without_compensation'
   and v_effective_state = 'vencida' then
  raise exception 'F6_REACTIVAR_REQUIERE_VIGENCIA';
end if;
v_new_until := greatest(v_license.valid_until, statement_timestamp())
               + make_interval(secs => v_requested);
```

Evaluar el estado efectivo después de tomar el lock y antes de cualquier mutación. `reactivate_without_compensation` sólo opera sobre una pausa todavía vigente. Sobre una pausa ya vencida, `extend` consume el plazo solicitado, usa `statement_timestamp()` como ancla cuando sea posterior y cambia `estado_administrativo` a `activa` atómicamente; `reactivate_with_compensation` hace la misma transición sólo si la pausa completa entra en el saldo. Calcular compensación con timestamps de servidor, comprobar idempotencia antes de consumir saldo, incrementar `state_version` y escribir evento before/after en la misma transacción.

- [x] **Step 6: Escribir exactamente seis pruebas cliente**

Cubrir: usa `estado_efectivo` y no ofrece una reactivación simple cuando requiere nueva vigencia; vencida domina pausa; muestra saldo restante; traduce exceso sin recorte; compone licencia con lease F5; sólo lectura conserva exportación y outbox. Son exactamente seis pruebas: el primer caso agrupa la presentación de estado y la acción permitida sin crear una séptima prueba.

- [x] **Step 7: Implementar presentación cliente mínima**

`f33NormalizarLicencia` debe aceptar los nuevos campos sin volver a derivar el estado desde `estado_administrativo`. `f5AssertWritable` continúa componiendo preparación F4.3, licencia y lease; el banner muestra causa y acción.

- [x] **Step 8: Ejecutar suites**

Run: `node --test tests/f6-license-client.test.cjs tests/f5-client.test.cjs`

Expected: 6/6 F6 y toda la regresión F5 PASS; SQL de licencias PASS.

- [x] **Step 9: Registrar checkpoint**

Hash de los cuatro archivos.

### Task 7: Implementar soporte privado y auditoría

**Files:**
- Create: `supabase/f6/05_support.sql`
- Create: `supabase/tests/f6_support.test.sql`

**Interfaces:**
- Produces: `private._f6_bootstrap_support_operator(uuid,text)`, `private._f6_service_panel(uuid,uuid,text,text)`, `private._f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)` y `private._f6_rate_limit_preflight(text,text,text,text)`.
- Panel result: estado agregado sin secretos de onboarding, licencia, build, dispositivos, leases, sesiones, outbox, conciliaciones y respaldo.

- [x] **Step 1: Escribir tests de autoridad de soporte**

Probar operador activo/inactivo, usuario comercial sin soporte, ausencia de suplantación y revocación de `EXECUTE` a `anon`/`authenticated`. Verificar que ninguna función acepta payload para editar ventas, caja, cierres, stock, fiado o saldos.

El primer operador se incorpora exclusivamente mediante `_f6_bootstrap_support_operator`, ejecutable por `service_role`, con usuario Auth existente y motivo obligatorio. La función no permite que un operador se autootorgue acceso desde el panel y deja el alta en la auditoría append-only.

- [x] **Step 2: Escribir tests de auditoría append-only**

Ejecutar comando autorizado y denegado; comprobar actor, motivo, before/after, resultado y correlación. Intentar `UPDATE`, `DELETE` y `TRUNCATE`; los tres deben fallar.

- [x] **Step 3: Escribir tests exactos de rate limit**

Probar 5/15 min token+IP, 20/h token, 50/h IP, 20/h operador y 5/h contacto, 10/h operador y 5/h comercio, 120/5 min operador y 300/5 min IP. Rotar una dimensión no debe eludir las otras; locks se toman en orden estable.

- [x] **Step 4: Implementar modelo de lectura**

Construir un único JSONB por comercio con conteos y estados; nunca incluir hashes de token, credenciales, PIN, secretos, payload comercial completo ni correo técnico. Usar `f6_estado_licencia` para estado efectivo y la cola única F5 para conciliaciones.

- [x] **Step 5: Implementar comandos permitidos con allowlist cerrada**

```sql
if p_action not in (
  'invite_resend','invite_regenerate','invite_revoke',
  'license_pause','license_reactivate','license_extend','license_cancel',
  'device_revoke','sync_retry','diagnostic_export','reconciliation_note'
) then raise exception 'F6_SUPPORT_ACTION_UNKNOWN'; end if;
```

Delegar licencias a Task 6 y membresía/dispositivo/conciliación a las RPC F5 existentes. `reconciliation_note` agrega contexto pero no resuelve ni modifica datos comerciales.

- [x] **Step 6: Implementar preflight de frecuencia**

Usar una allowlist de superficies con ventanas/umbrales exactos, hashes de dimensiones, `pg_advisory_xact_lock` por cada dimensión y JSONB `{limited,retry_after}`. El contacto normalizado sólo persiste como hash.

- [x] **Step 7: Ejecutar la suite SQL**

Expected: autoridad, prohibiciones, append-only, límites y concurrencia PASS.

- [x] **Step 8: Registrar checkpoint**

Hash de migración y test.

### Task 8: Crear la Edge Function de soporte

**Files:**
- Modify: `supabase/functions/_shared/f6-contracts.mjs`
- Create: `supabase/functions/f6-support/index.ts`
- Create: `tests/f6-support-edge.test.mjs`

**Interfaces:**
- Actions: `panel`, `license`, `invite`, `device_revoke`, `sync_retry`, `diagnostic_export`, `reconciliation_note`.
- Consumes: `clientIp()` F5 y las funciones privadas Task 7.
- Produces: respuestas HTTP sin secretos y 429 literal con `Retry-After`.

- [x] **Step 1: Escribir exactamente seis pruebas Node**

Cubrir: JWT obligatorio; operador activo; panel redacted; comandos desconocidos rechazados; `clientIp()` derecho; JSONB limitado traducido a 429.

- [x] **Step 2: Ejecutar y confirmar las seis fallas**

Run: `node --test tests/f6-support-edge.test.mjs`

- [x] **Step 3: Implementar validadores cerrados**

```js
export const F6_SUPPORT_ACTIONS=Object.freeze(new Set([
  'panel','license','invite','device_revoke','sync_retry',
  'diagnostic_export','reconciliation_note'
]));
```

Cada payload tiene allowlist propia, tamaño máximo y `reason` obligatorio para mutaciones. No aceptar nombres de tabla, SQL, paths o campos comerciales arbitrarios.

- [x] **Step 4: Implementar handler Edge**

Importar `clientIp`, calcular `ip_hash` con pepper de servidor, autenticar JWT, ejecutar preflight, traducir 429 y llamar la función privada con service role. Los logs sólo guardan correlación, acción, resultado y hashes no reversibles.

- [x] **Step 5: Ejecutar pruebas de soporte e invitaciones**

Run: `node --test tests/f6-support-edge.test.mjs tests/f6-invitations-edge.test.mjs tests/f5-edge-contract.test.mjs`

Expected: 6/6 soporte, 8/8 invitaciones y regresión F5 completa PASS.

- [x] **Step 6: Registrar checkpoint**

Hash del contrato y Edge Function.

### Task 9: Construir el panel interno no técnico

**Files:**
- Create: `entregables/MiComercio-Soporte-F6.html`
- Create: `tests/f6-support-ui.test.cjs`

**Interfaces:**
- Consumes: `f6-support` actions `panel` y comandos permitidos.
- Produces: vista por comercio con estados rojo/amarillo/informativo y confirmaciones auditables.

- [x] **Step 1: Escribir exactamente cuatro pruebas UI**

Comprobar: no existen controles para editar ventas/stock/caja; muestra `estado_efectivo`; toda mutación exige motivo; errores muestran el mismo `code` que soporte y comerciante. Una de las cuatro pruebas compara el mapa completo de comandos visibles con las acciones permitidas: reenviar/regenerar/revocar invitación, pausar/reactivar/extender/cancelar licencia, revocar dispositivo, reintentar sincronización, exportar diagnóstico y agregar nota de conciliación.

- [x] **Step 2: Ejecutar y confirmar fallos**

Run: `node --test tests/f6-support-ui.test.cjs`

- [x] **Step 3: Implementar el panel**

Usar una cabecera con búsqueda de comercio y cinco bloques: Alta, Licencia, Dispositivos, Sincronización y Conciliaciones. Mantener detalles colapsados y mostrar primero la acción recomendada. No renderizar JSON crudo por defecto.

```js
const SUPPORT_COMMANDS=Object.freeze({
  reenviarInvitacion:'invite', regenerarInvitacion:'invite',
  revocarInvitacion:'invite', extender:'license', pausar:'license',
  reactivar:'license', cancelar:'license',
  revocarDispositivo:'device_revoke', reintentarSync:'sync_retry',
  exportarDiagnostico:'diagnostic_export',
  anotarConciliacion:'reconciliation_note'
});
```

- [x] **Step 4: Agregar confirmaciones específicas**

Extender muestra saldo solicitado/restante y advierte rechazo total; compensar muestra segundos exactos de la pausa; cancelar advierte que es terminal y requiere una licencia nueva; revocar dispositivo repite la advertencia F5 sobre outbox; la nota de conciliación agrega contexto pero no resuelve ni modifica datos comerciales. Cada confirmación exige motivo no vacío antes de habilitar el botón final.

- [ ] **Step 5: Ejecutar las cuatro pruebas y revisión responsive**

Run: `node --test tests/f6-support-ui.test.cjs`

Expected: 4/4 PASS; verificar manualmente a 360 px y 1280 px sin scroll horizontal.

- [x] **Step 6: Registrar checkpoint**

Hash del HTML y test.

### Task 10: Integrar invitación, onboarding y licencia en el sistema

**Files:**
- Modify: `entregables/MiComercio-F6-PRUEBA.html`
- Modify: `tests/f6-onboarding-client.test.cjs`
- Modify: `tests/f6-license-client.test.cjs`

**Interfaces:**
- Consumes: `f6-invitations`, RPC onboarding y `f6_licencia_actual`.
- Produces: `window.MiComercioF6`, flujo `?invite=`, reanudación y entrada controlada al POS.

- [x] **Step 1: Agregar pruebas de integración a las suites existentes sin cambiar su cantidad total**

Reemplazar fixtures aislados por un flujo completo: preview válido → signUp/signIn simulado → consume → pasos → comprobación → licencia activa. Mantener exactamente ocho tests de onboarding y seis de licencia agrupando asserts relacionados.

- [x] **Step 2: Implementar detección de invitación antes del login normal**

Si existe `?invite=`, llamar `preview`. Ante respuesta genérica no disponible, mostrar “El enlace no está disponible” y contacto con soporte; nunca revelar comercio. Con sesión Auth válida, llamar `consume` con UUID de idempotencia persistido hasta confirmar.

- [x] **Step 3: Implementar reanudación**

Después del login, consultar `f6_onboarding_actual`. `completo` entra a la app; los demás estados muestran el asistente en el último paso confirmado. Un error de red no marca el paso siguiente.

- [x] **Step 4: Activar la licencia sólo después de la comprobación**

La respuesta final debe traer `estado_efectivo='activa'`, `valid_from` y `valid_until` separados exactamente por 604800 segundos. Instalar el contrato en F3.3 y recién entonces habilitar la navegación operativa.

- [x] **Step 5: Ejecutar regresión cliente**

Run: `node --test tests/f6-onboarding-client.test.cjs tests/f6-license-client.test.cjs tests/f5-client.test.cjs tests/ui-busquedas-pagos.test.cjs`

Expected: todas las pruebas PASS.

- [x] **Step 6: Registrar checkpoint**

Hash del HTML y las suites.

### Task 11: Cerrar cada turno por separado y consolidar el día

**Files:**
- Modify: `entregables/MiComercio-F6-PRUEBA.html`
- Create: `tests/f6-turnos.test.cjs`
- Modify: `supabase/f6/06_pilot_gate.sql`
- Create: `supabase/tests/f6_pilot_gate.test.sql`

**Interfaces:**
- Consumes: `turnoActual(sessionId)`, `f5EstamparSesionLocal`, `cerrar_sesion_caja_v4`, `session_segment_id` y `cierre_ajustes` F5.
- Produces: `f6AgruparCierresPorDia(cierres,timezone,cutoff)`, `f6ConsolidadoDia(grupo)` y gate de cierres independientes.

- [x] **Step 1: Escribir exactamente cuatro pruebas Node**

Casos: dos turnos del mismo día permanecen separados; consolidado suma ventas pero no fondos/diferencias; cerrar primero no corta lease ni impide abrir segundo; segmento provisional nunca entra al arqueo de otra sesión.

```js
test('el consolidado diario no mezcla fondos ni diferencias', () => {
  const r=f6ConsolidadoDia([turnoManana,turnoTarde]);
  assert.equal(r.totalVendido, turnoManana.total+turnoTarde.total);
  assert.equal('fondoInicial' in r, false);
  assert.equal('diferencia' in r, false);
});
```

- [x] **Step 2: Ejecutar y confirmar fallos**

Run: `node --test tests/f6-turnos.test.cjs`

- [x] **Step 3: Extraer el core de agrupación entre marcadores F6**

La clave de turno es `_v4sessionSegmentId ?? _v4cajaSesionId`; la fecha diaria respeta timezone y `business_day_cutoff`. Resumen lista cada cierre y agrega una tarjeta “Total del día” sólo de lectura.

- [x] **Step 4: Reforzar el cierre actual**

Antes de crear el cierre, exigir sesión/segmento efectivo y comprobar localmente que no exista otro cierre efectivo para esa misma clave. El servidor conserva la constraint F5; el rechazo remoto muestra el cierre ya existente. Después de cerrar se limpia sólo la sesión activa, no el lease ni cierres previos.

- [x] **Step 5: Implementar gate SQL**

Comprobar que dos cierres para sesiones distintas del mismo día pasan, dos cierres de la misma sesión/segmento fallan y una sesión provisional conserva conciliación. Agregar checks de build observado, `v4_only`, baseline y evidencia PIN como flags separados; ninguno puede omitirse del resultado.

- [x] **Step 6: Ejecutar Node y SQL**

Expected: 4/4 Node PASS y suite SQL PASS.

- [x] **Step 7: Registrar checkpoint**

Hash del HTML, migración y tests.

### Task 12: Aplicar F6 completo en QA y ejecutar el navegador real

**Files:**
- Modify: `entregables/QA-F6-EVIDENCIA.md`
- Read: `supabase/f6/01_foundation.sql` through `supabase/f6/06_pilot_gate.sql`
- Read: all `supabase/tests/f6_*.test.sql`

**Interfaces:**
- Consumes: Tasks 2–11.
- Produces: migración QA trazable, seis suites SQL F6 y recorrido real completo.

- [x] **Step 1: Ejecutar preflight de datos antes de DDL**

Contar licencias duplicadas, comercios sin dueño, cajas activas duplicadas incompatibles, estados desconocidos e idempotency keys repetidas. Expected: cero; cualquier hallazgo detiene la migración y se documenta, nunca se corrige automáticamente.

- [x] **Step 2: Aplicar migraciones en orden a QA**

Aplicar `01` a `06`, registrando nombre, timestamp, hash y resultado. No usar `DROP ... CASCADE` ni reemplazar firmas públicas sin contar operaciones/payloads en vuelo.

- [x] **Step 3: Desplegar Edge Functions QA**

Desplegar `f6-invitations` y `f6-support` con orígenes QA, pepper y credenciales de servicio guardados como secrets. Confirmar que ninguna credencial aparece en HTML, logs, evidencia o ZIP.

- [x] **Step 4: Ejecutar las catorce suites SQL acumuladas**

Ejecutar las ocho F5 y las seis F6 sobre el baseline QA, cada una dentro de transacción descartable. Expected: 14/14 suites PASS.

- [ ] **Step 5: Resolver y demostrar los tres gates F5**

Crear el comercio dedicado, recorrer F3.4 → F4.1 → F4.2 → F4.3 hasta `v4_only`, reproducir el baseline desde cero y adjuntar la evidencia separada que corrige o elimina conscientemente el bypass local de `verificarPin()`. Si alguno no pasa, F6 puede seguir como candidato técnico pero el piloto no comienza.

- [ ] **Step 6: Ejecutar recorrido real en navegador**

Emitir enlace, abrirlo en perfil limpio, registrar dueño, interrumpir/reanudar onboarding, completar simulación, confirmar licencia de 604800 segundos, realizar dos turnos el mismo día, cerrar ambos por separado y comprobar el consolidado.

Avance 2026-09-05: se creó y designó el primer operador interno de soporte. El bootstrap real descubrió el caso `raw_user_meta_data={}`; se agregó primero una regresión roja, se corrigió el fallback `NULL` en `05_support.sql`, se aplicó `f6_rc1_05_support_null_name_fix_qa` y se repitieron las 14 suites con PASS. Auth y la lectura autenticada del panel F6 pasaron de punta a punta. Este avance no sustituye el recorrido comercial de invitación, onboarding y dos turnos que sigue pendiente en este paso.

- [ ] **Step 7: Ejecutar escenarios offline**

Cerrar un turno offline, abrir el siguiente con el mismo lease, registrar operaciones, reconectar y verificar orden de drenaje, sesión/segmento y conciliación. No aceptar capturas como sustituto de filas/IDs comprobables.

- [ ] **Step 8: Registrar evidencia**

Documentar resultados reales, IDs no secretos, hashes, timestamps y cualquier límite. No escribir “PASS” para una prueba no ejecutada.

### Task 13: Congelar identidad y empaquetar el candidato F6

**Files:**
- Create: `entregables/BUILD-IDENTITY-F6.json`
- Modify: `entregables/MiComercio-F6-PRUEBA.html`
- Create: `tests/f6-package-identity.test.cjs`
- Create: `entregables/MiComercio-F6-PAQUETE-RC1/`
- Create: `entregables/MiComercio-F6-PAQUETE-RC1/verificar.ps1`
- Create: `entregables/MiComercio-F6-PAQUETE-RC1/verificar.sh`
- Create: `entregables/MiComercio-F6-PAQUETE-RC1/SHA256SUMS-F6.txt`
- Create: `entregables/MiComercio-F6-PAQUETE-RC1.zip`

**Interfaces:**
- Consumes: candidato QA verificado.
- Produces: build `6.0.0-f6-rc1`, paquete autocontenido, 102 pruebas locales esperadas y 14 suites SQL documentadas.

- [x] **Step 1: Escribir identidad normativa**

```json
{
  "build": "6.0.0-f6-rc1",
  "base_build": "5.0.0-f5-rc2",
  "projection_contract": "f5-projection-v1",
  "config_contract": "10-canonical+6-legacy-only",
  "license_contract": "f6-license-v1",
  "expected_local_tests": 102,
  "expected_sql_suites": 14,
  "acceptance": "candidate-pending-seven-day-pilot"
}
```

- [x] **Step 2: Actualizar identidad dentro del HTML**

`window.MiComercioBuild.version` debe ser `6.0.0-f6-rc1` y exponer los mismos contratos del JSON. La prueba ejecuta el script en VM y compara campo por campo; no basta con buscar texto.

- [x] **Step 3: Ejecutar las 102 pruebas locales**

Run: `node --test tests`

Expected: `# pass 102`, `# fail 0`. La cuenta es 62 F5 + 2 baseline F6 + 38 pruebas funcionales/de paquete F6. Si el baseline cambió legítimamente antes de ejecutar este plan, actualizar en un cambio explícito y conjunto el inventario, ambas pruebas de identidad y los dos verificadores; nunca ajustar sólo el número impreso.

- [x] **Step 4: Crear verificadores con cobertura exacta**

Ambos scripts verifican hashes, igualdad de conjuntos disco/manifiesto, sintaxis, conteos medidos, identidad JSON/HTML y secretos. Deben tolerar CRLF al leer el manifiesto, pero el manifiesto generado queda LF.

- [x] **Step 5: Ejecutar sabotajes sobre copias limpias**

Los verificadores deben rechazar: manifiesto truncado; suite borrada; archivo colado; byte modificado en SQL; una prueba borrada con manifiesto regenerado; JSON/HTML con builds distintos; `clientIp()` copiado o alterado en F6.

- [x] **Step 6: Verificar ZIP extraído desde cero**

Extraer en un directorio temporal nuevo, ejecutar `verificar.ps1` y `verificar.sh` donde estén disponibles y comparar todos los archivos fuente con el workspace. Registrar lo no ejecutable como no verificado.

- [x] **Step 7: Registrar checksum final**

Run: `Get-FileHash entregables/MiComercio-F6-PAQUETE-RC1.zip -Algorithm SHA256`

Guardar el hash en `entregables/MiComercio-F6-PAQUETE-RC1.zip.sha256.txt`, fuera del ZIP. No intentar incluir el checksum del ZIP dentro del propio ZIP porque eso crea una referencia circular inestable.

### Task 14: Ejecutar el piloto de siete días y decidir salida

**Files:**
- Create: `entregables/PILOTO-F6-7-DIAS.md`
- Modify: `entregables/QA-F6-EVIDENCIA.md`

**Interfaces:**
- Consumes: paquete RC1 y gates completos.
- Produces: decisión `aprobado`, `repetir_escenario` o `rechazado`; no despliega automáticamente.

- [ ] **Step 1: Día 0 — alta y respaldo**

Registrar invitación, dueño, onboarding completo, build exacto, `valid_from`, `valid_until`, diferencia exacta de 604800 segundos, respaldo y hashes. No comenzar si algún gate previo es falso.

- [ ] **Step 2: Días 1–6 — operación diaria**

Por cada día registrar turnos abiertos/cerrados, ventas, stock, outbox, última sincronización, alertas, acciones de soporte y cortes controlados. Cerrar cada turno por separado cuando corresponda; nunca usar el consolidado diario como cierre.

- [ ] **Step 3: Probar pausa y saldo adicional**

En ventana controlada, pausar y reactivar sin compensación; después compensar una pausa corta y verificar `extension_used_seconds`. Intentar una solicitud mayor al remanente y comprobar rechazo total sin cambios before/after.

- [ ] **Step 4: Día 7 — cierre y drenaje**

Cerrar cada turno abierto, drenar toda operación, listar conciliaciones, exportar diagnóstico y respaldo, y comprobar que no existen operaciones válidas sin destino.

- [ ] **Step 5: Ejecutar gate final**

Exigir cero pérdida, cero diferencias económicas sin explicación/flujo, cero fallas críticas, respaldo recuperable, cierres independientes correctos y suites completas PASS.

- [ ] **Step 6: Resolver resultado**

Si pasa, marcar `aprobado` y preparar un plan separado de integración/migración conjunta. Si falla por problema crítico, corregir y repetir sólo el escenario afectado; una extensión usa el saldo auditado. Si el saldo se agotó, detener el piloto y pedir una nueva decisión de producto.

- [ ] **Step 7: Congelar evidencia**

Calcular hashes de bitácora, evidencia, paquete y exportaciones permitidas. El final de la semana no ejecuta despliegue ni migración productiva.

## Final Verification Matrix

- Invitaciones: uso único, 7 días, revocación, no enumeración, idempotencia y carreras.
- Onboarding: pasos obligatorios/opcionales, reanudación y simulación con cero efectos.
- Licencia: 604800 segundos base, 604800 adicionales compartidos, evaluación perezosa y rechazo sin recorte.
- Soporte: actor separado, allowlist, auditoría append-only, límites exactos, `clientIp()` reutilizado y 429 real en Edge.
- Turnos: cierre por sesión/segmento, múltiples cierres diarios y consolidado sólo lectura.
- Compatibilidad: F5 completo, 10/6 config, proyección F5, rollback y outbox.
- Piloto: baseline desde cero, navegador `v4_only`, resolución de PIN local, respaldo/recuperación y evidencia real.
- Despliegue: sólo QA; producción requiere otro plan y autorización explícita posterior al piloto.
