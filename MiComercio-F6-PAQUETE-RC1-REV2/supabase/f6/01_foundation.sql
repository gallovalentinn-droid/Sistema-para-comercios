-- F6.1-F6.4: esquema fundacional. Requiere F5 rev10 y PostgreSQL 15+.

do $guard$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'F6_POSTGRES_15_REQUIRED';
  end if;
end
$guard$;

create schema if not exists private;

alter table public.comercio_licencias
  add column if not exists estado_administrativo text not null default 'activa',
  add column if not exists valid_from timestamptz,
  add column if not exists valid_until timestamptz,
  add column if not exists pause_started_at timestamptz,
  add column if not exists extension_used_seconds bigint not null default 0,
  add column if not exists state_version bigint not null default 1;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_estado_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_f6_estado_check
      check (estado_administrativo in ('pendiente','activa','pausada','cancelada'));
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_extension_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_f6_extension_check
      check (extension_used_seconds between 0 and 604800);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_state_version_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_f6_state_version_check
      check (state_version >= 1);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_beta_dates_check'
  ) then
    alter table public.comercio_licencias
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
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_pause_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_f6_pause_check
      check (
        plan <> 'beta'
        or (estado_administrativo='pausada' and pause_started_at is not null)
        or (estado_administrativo<>'pausada' and pause_started_at is null)
      );
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_activo_check'
  ) then
    alter table public.comercio_licencias
      add constraint comercio_licencias_f6_activo_check
      check (plan <> 'beta' or activo=(estado_administrativo='activa'));
  end if;
end
$constraints$;

create table if not exists private.f6_alta_autorizaciones (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'invitacion_interna',
  estado text not null default 'pendiente',
  comercio_nombre text not null,
  timezone text not null,
  business_day_cutoff time not null,
  contacto_hash text not null,
  issued_by uuid not null,
  motivo text not null,
  idempotency_key uuid not null,
  provision_idempotency_key uuid,
  comercio_id uuid references public.comercios(id),
  owner_user_id uuid,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  revoked_at timestamptz,
  constraint f6_alta_autorizaciones_source_check
    check (source in ('invitacion_interna','autoservicio_futuro')),
  constraint f6_alta_autorizaciones_estado_check
    check (estado in ('pendiente','consumida','revocada')),
  constraint f6_alta_autorizaciones_nombre_check
    check (length(trim(comercio_nombre)) between 1 and 160),
  constraint f6_alta_autorizaciones_timezone_check
    check (length(trim(timezone)) between 1 and 80),
  constraint f6_alta_autorizaciones_contacto_hash_check
    check (contacto_hash ~ '^[0-9a-f]{64}$'),
  constraint f6_alta_autorizaciones_motivo_check
    check (length(trim(motivo)) between 1 and 500),
  constraint f6_alta_autorizaciones_consumo_check
    check (
      (estado='pendiente' and consumed_at is null and revoked_at is null)
      or (
        estado='consumida' and consumed_at is not null and revoked_at is null
        and comercio_id is not null and owner_user_id is not null
        and provision_idempotency_key is not null
      )
      or (estado='revocada' and revoked_at is not null and consumed_at is null)
    ),
  unique (issued_by,idempotency_key)
);

create index if not exists f6_alta_autorizaciones_estado_created_idx
  on private.f6_alta_autorizaciones(estado,created_at desc);
create index if not exists f6_alta_autorizaciones_comercio_idx
  on private.f6_alta_autorizaciones(comercio_id)
  where comercio_id is not null;

create table if not exists private.f6_invitaciones (
  id uuid primary key default gen_random_uuid(),
  authorization_id uuid not null references private.f6_alta_autorizaciones(id),
  token_hash text not null unique,
  contacto_hash text not null,
  ip_hash text not null,
  estado text not null default 'pendiente',
  issued_by uuid not null,
  motivo text not null,
  idempotency_key uuid not null,
  issued_at timestamptz not null,
  valid_until timestamptz not null,
  bound_user_id uuid,
  consumed_by uuid,
  consumed_at timestamptz,
  revoked_at timestamptz,
  replaced_by uuid references private.f6_invitaciones(id),
  created_at timestamptz not null default now(),
  constraint f6_invitaciones_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint f6_invitaciones_contacto_hash_check
    check (contacto_hash ~ '^[0-9a-f]{64}$'),
  constraint f6_invitaciones_ip_hash_check
    check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint f6_invitaciones_estado_check
    check (estado in ('pendiente','consumida','vencida','revocada')),
  constraint f6_invitaciones_motivo_check
    check (length(trim(motivo)) between 1 and 500),
  constraint f6_invitaciones_exact_duration_check
    check (valid_until=issued_at+make_interval(secs=>604800)),
  constraint f6_invitaciones_consumo_check
    check (
      (estado='pendiente' and consumed_at is null and revoked_at is null)
      or (estado='consumida' and consumed_at is not null and consumed_by is not null and revoked_at is null)
      or (estado='vencida' and consumed_at is null and revoked_at is null)
      or (estado='revocada' and consumed_at is null and revoked_at is not null)
    ),
  unique (issued_by,idempotency_key)
);

create index if not exists f6_invitaciones_authorization_idx
  on private.f6_invitaciones(authorization_id,issued_at desc);
create index if not exists f6_invitaciones_contacto_idx
  on private.f6_invitaciones(contacto_hash,issued_at desc);
create index if not exists f6_invitaciones_estado_valid_idx
  on private.f6_invitaciones(estado,valid_until);

create table if not exists private.f6_onboarding (
  comercio_id uuid primary key references public.comercios(id) on delete cascade,
  estado text not null default 'no_iniciado',
  ultimo_paso text,
  pasos_confirmados text[] not null default array[]::text[],
  pasos_idempotencia jsonb not null default '{}'::jsonb,
  state_version bigint not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint f6_onboarding_estado_check
    check (estado in ('no_iniciado','en_curso','completo')),
  constraint f6_onboarding_ultimo_paso_check
    check (
      ultimo_paso is null or ultimo_paso in (
        'datos_comercio','caja_inicial','modulos','productos',
        'empleados','clientes','comprobacion_final'
      )
    ),
  constraint f6_onboarding_pasos_check
    check (
      pasos_confirmados <@ array[
        'datos_comercio','caja_inicial','modulos','productos',
        'empleados','clientes','comprobacion_final'
      ]::text[]
    ),
  constraint f6_onboarding_idempotencia_check
    check (jsonb_typeof(pasos_idempotencia)='object'),
  constraint f6_onboarding_version_check
    check (state_version >= 1),
  constraint f6_onboarding_completion_check
    check (
      (estado='completo' and completed_at is not null)
      or (estado<>'completo' and completed_at is null)
    )
);

create index if not exists f6_onboarding_estado_updated_idx
  on private.f6_onboarding(estado,updated_at desc);

create table if not exists private.f6_licencia_eventos (
  id bigint generated always as identity primary key,
  comercio_id uuid not null references public.comercios(id),
  actor_user_id uuid not null,
  accion text not null,
  motivo text not null,
  antes jsonb not null,
  despues jsonb not null,
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint f6_licencia_eventos_accion_check
    check (accion in (
      'onboarding_activate','pause','reactivate_without_compensation',
      'reactivate_with_compensation','extend','cancel','reject'
    )),
  constraint f6_licencia_eventos_motivo_check
    check (length(trim(motivo)) between 1 and 500),
  constraint f6_licencia_eventos_antes_check
    check (jsonb_typeof(antes)='object'),
  constraint f6_licencia_eventos_despues_check
    check (jsonb_typeof(despues)='object')
);

create index if not exists f6_licencia_eventos_comercio_created_idx
  on private.f6_licencia_eventos(comercio_id,created_at desc);

create table if not exists private.f6_soporte_operadores (
  user_id uuid primary key references auth.users(id),
  nombre text not null,
  rol text not null default 'agente',
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint f6_soporte_operadores_nombre_check
    check (length(trim(nombre)) between 1 and 120),
  constraint f6_soporte_operadores_rol_check
    check (rol in ('agente','supervisor')),
  constraint f6_soporte_operadores_revocacion_check
    check ((activo and revoked_at is null) or (not activo and revoked_at is not null))
);

create index if not exists f6_soporte_operadores_activo_idx
  on private.f6_soporte_operadores(user_id)
  where activo;

create table if not exists private.f6_soporte_eventos (
  id bigint generated always as identity primary key,
  operador_user_id uuid not null references private.f6_soporte_operadores(user_id),
  comercio_id uuid references public.comercios(id),
  accion text not null,
  motivo text not null,
  ok boolean not null,
  resultado_codigo text not null,
  antes jsonb not null default '{}'::jsonb,
  despues jsonb not null default '{}'::jsonb,
  correlation_id uuid not null unique,
  created_at timestamptz not null default now(),
  constraint f6_soporte_eventos_accion_check
    check (accion in (
      'invite_resend','invite_regenerate','invite_revoke',
      'license_pause','license_reactivate','license_extend','license_cancel',
      'device_revoke','sync_retry','diagnostic_export','reconciliation_note'
    )),
  constraint f6_soporte_eventos_motivo_check
    check (length(trim(motivo)) between 1 and 500),
  constraint f6_soporte_eventos_codigo_check
    check (resultado_codigo ~ '^[A-Z0-9_]{2,120}$'),
  constraint f6_soporte_eventos_antes_check
    check (jsonb_typeof(antes)='object'),
  constraint f6_soporte_eventos_despues_check
    check (jsonb_typeof(despues)='object')
);

create index if not exists f6_soporte_eventos_comercio_created_idx
  on private.f6_soporte_eventos(comercio_id,created_at desc);
create index if not exists f6_soporte_eventos_operador_created_idx
  on private.f6_soporte_eventos(operador_user_id,created_at desc);

create table if not exists private.f6_rate_intentos (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  superficie text not null,
  dimension_tipo text not null,
  dimension_hash text not null,
  operador_user_id uuid,
  limitado boolean not null default false,
  created_at timestamptz not null default now(),
  constraint f6_rate_intentos_superficie_check
    check (superficie in (
      'invite_validate','invite_consume','invite_issue','invite_regenerate',
      'license_mutation','support_panel'
    )),
  constraint f6_rate_intentos_dimension_tipo_check
    check (dimension_tipo in ('token_ip','token','ip','operador','contacto','comercio')),
  constraint f6_rate_intentos_dimension_hash_check
    check (dimension_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists f6_rate_intentos_window_idx
  on private.f6_rate_intentos(superficie,dimension_tipo,dimension_hash,created_at desc);
create index if not exists f6_rate_intentos_request_idx
  on private.f6_rate_intentos(request_id);

alter table private.f6_alta_autorizaciones enable row level security;
alter table private.f6_invitaciones enable row level security;
alter table private.f6_onboarding enable row level security;
alter table private.f6_licencia_eventos enable row level security;
alter table private.f6_soporte_operadores enable row level security;
alter table private.f6_soporte_eventos enable row level security;
alter table private.f6_rate_intentos enable row level security;

create or replace function private._f6_audit_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'F6_AUDIT_APPEND_ONLY';
end
$function$;

drop trigger if exists f6_licencia_eventos_append_only on private.f6_licencia_eventos;
create trigger f6_licencia_eventos_append_only
before update or delete on private.f6_licencia_eventos
for each row execute function private._f6_audit_append_only();

drop trigger if exists f6_licencia_eventos_append_only_truncate on private.f6_licencia_eventos;
create trigger f6_licencia_eventos_append_only_truncate
before truncate on private.f6_licencia_eventos
for each statement execute function private._f6_audit_append_only();

drop trigger if exists f6_soporte_eventos_append_only on private.f6_soporte_eventos;
create trigger f6_soporte_eventos_append_only
before update or delete on private.f6_soporte_eventos
for each row execute function private._f6_audit_append_only();

drop trigger if exists f6_soporte_eventos_append_only_truncate on private.f6_soporte_eventos;
create trigger f6_soporte_eventos_append_only_truncate
before truncate on private.f6_soporte_eventos
for each statement execute function private._f6_audit_append_only();

revoke all on table
  private.f6_alta_autorizaciones,
  private.f6_invitaciones,
  private.f6_onboarding,
  private.f6_licencia_eventos,
  private.f6_soporte_operadores,
  private.f6_soporte_eventos,
  private.f6_rate_intentos
from public,anon,authenticated,service_role;

revoke all on sequence
  private.f6_licencia_eventos_id_seq,
  private.f6_soporte_eventos_id_seq,
  private.f6_rate_intentos_id_seq
from public,anon,authenticated,service_role;

revoke all on function private._f6_audit_append_only()
from public,anon,authenticated,service_role;

revoke select on table public.comercio_licencias from anon,authenticated;
