-- F5.1 — autoridad de membresía y catálogo cerrado de permisos.
-- Iteración QA: se ejecuta con execute_sql; la migración consolidada se genera al integrar F5+F6.

do $preflight$
begin
  if exists (
    select 1
    from public.comercio_miembros
    where activo
    group by user_id
    having count(*) > 1
  ) then
    raise exception 'F5_MEMBRESIA_ACTIVA_DUPLICADA';
  end if;
end
$preflight$;

create schema if not exists private;

alter table public.comercio_miembros
  add column if not exists permission_version bigint not null default 1,
  add column if not exists revoked_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comercio_miembros'::regclass
      and conname = 'comercio_miembros_permission_version_check'
  ) then
    alter table public.comercio_miembros
      add constraint comercio_miembros_permission_version_check
      check (permission_version >= 1);
  end if;
end
$constraints$;

create or replace function private.f5_catalogo_permisos()
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $function$
  select array[
    'ventas_registrar','productos_editar','reposicion_ver','vencimientos_ver',
    'combos_editar','promociones_editar','fiado_operar','caja_operar',
    'movimientos_ver','resumen_ver'
  ]::text[];
$function$;

create or replace function private.f5_permisos_validos(p_permisos jsonb)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when p_permisos is null or jsonb_typeof(p_permisos) <> 'object' then false
    else
      not exists (
        select 1
        from jsonb_each(p_permisos) as permiso(clave, valor)
        where not (permiso.clave = any(private.f5_catalogo_permisos()))
           or jsonb_typeof(permiso.valor) <> 'boolean'
      )
  end;
$function$;

do $permisos_preflight$
begin
  if exists (
    select 1
    from public.comercio_miembros cm
    where not private.f5_permisos_validos(cm.permisos)
       or (cm.rol in ('duenio','admin') and cm.permisos <> '{}'::jsonb)
  ) then
    raise exception 'F5_PERMISOS_LEGACY_INVALIDOS';
  end if;
end
$permisos_preflight$;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comercio_miembros'::regclass
      and conname = 'comercio_miembros_permisos_f5_check'
  ) then
    alter table public.comercio_miembros
      add constraint comercio_miembros_permisos_f5_check
      check (private.f5_permisos_validos(permisos));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.comercio_miembros'::regclass
      and conname = 'comercio_miembros_permisos_derivados_check'
  ) then
    alter table public.comercio_miembros
      add constraint comercio_miembros_permisos_derivados_check
      check (rol = 'empleado' or permisos = '{}'::jsonb);
  end if;
end
$constraints$;

create unique index if not exists comercio_miembros_usuario_activo_uq
  on public.comercio_miembros(user_id)
  where activo;

create table if not exists private.f5_membresia_eventos (
  id bigint generated always as identity primary key,
  comercio_id uuid not null references public.comercios(id),
  actor_user_id uuid not null,
  target_user_id uuid not null,
  antes jsonb not null,
  despues jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists f5_membresia_eventos_comercio_created_idx
  on private.f5_membresia_eventos(comercio_id, created_at desc);
create index if not exists f5_membresia_eventos_target_created_idx
  on private.f5_membresia_eventos(target_user_id, created_at desc);

create or replace function private._f5_append_only()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  raise exception 'F5_APPEND_ONLY';
end;
$function$;

drop trigger if exists f5_membresia_eventos_append_only on private.f5_membresia_eventos;
create trigger f5_membresia_eventos_append_only
before update or delete on private.f5_membresia_eventos
for each row execute function private._f5_append_only();

drop trigger if exists f5_membresia_eventos_append_only_truncate on private.f5_membresia_eventos;
create trigger f5_membresia_eventos_append_only_truncate
before truncate on private.f5_membresia_eventos
for each statement execute function private._f5_append_only();

revoke all on function private._f5_append_only() from public,anon,authenticated,service_role;

create or replace function private.f5_permisos_efectivos(p_comercio_id uuid)
returns text[]
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when cm.rol in ('duenio','admin') then private.f5_catalogo_permisos()
    else coalesce(
      array(
        select permiso.clave
        from jsonb_each(cm.permisos) as permiso(clave, valor)
        where permiso.valor = 'true'::jsonb
          and permiso.clave = any(private.f5_catalogo_permisos())
        order by permiso.clave
      ),
      array[]::text[]
    )
  end
  from public.comercio_miembros cm
  where cm.comercio_id = p_comercio_id
    and cm.user_id = (select auth.uid())
    and cm.activo;
$function$;

create or replace function private._f5_actualizar_miembro(
  p_comercio_id uuid,
  p_target_user_id uuid,
  p_rol text,
  p_permisos jsonb,
  p_activo boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_actor public.comercio_miembros%rowtype;
  v_target public.comercio_miembros%rowtype;
  v_after public.comercio_miembros%rowtype;
  v_before jsonb;
  v_actor_permisos text[];
  v_otros_duenios bigint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null or p_target_user_id is null then
    raise exception 'F5_MEMBRESIA_REQUERIDA';
  end if;
  if p_activo is null then raise exception 'F5_ACTIVO_REQUERIDO'; end if;
  if p_rol is null or p_rol not in ('duenio','admin','empleado') then
    raise exception 'F5_ROL_INVALIDO';
  end if;
  if not private.f5_permisos_validos(p_permisos) then
    raise exception 'F5_PERMISOS_INVALIDOS';
  end if;
  if p_rol in ('duenio','admin') and p_permisos <> '{}'::jsonb then
    raise exception 'F5_PERMISOS_DERIVADOS_POR_ROL';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));

  select *
    into v_actor
    from public.comercio_miembros cm
   where cm.comercio_id = p_comercio_id
     and cm.user_id = v_uid
     and cm.activo
   for update;
  if not found then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if v_actor.rol not in ('duenio','admin') then raise exception 'ROLE_REQUIRED'; end if;

  select *
    into v_target
    from public.comercio_miembros cm
   where cm.comercio_id = p_comercio_id
     and cm.user_id = p_target_user_id
   for update;
  if not found then raise exception 'F5_MIEMBRO_NO_EXISTE'; end if;

  if v_actor.rol = 'admin' then
    if v_actor.user_id = v_target.user_id then raise exception 'F5_ADMIN_SELF_EDIT'; end if;
    if v_target.rol <> 'empleado' or p_rol <> 'empleado' then
      raise exception 'F5_ADMIN_SOLO_EMPLEADOS';
    end if;
  end if;

  v_actor_permisos := private.f5_permisos_efectivos(p_comercio_id);
  if p_rol = 'empleado' and exists (
    select 1
    from jsonb_each(p_permisos) as permiso(clave, valor)
    where permiso.valor = 'true'::jsonb
      and not (permiso.clave = any(v_actor_permisos))
  ) then
    raise exception 'F5_PERMISOS_SUPERAN_ACTOR';
  end if;

  if v_target.rol = 'duenio'
     and v_target.activo
     and (not p_activo or p_rol <> 'duenio') then
    select count(*)
      into v_otros_duenios
      from public.comercio_miembros cm
     where cm.comercio_id = p_comercio_id
       and cm.activo
       and cm.rol = 'duenio'
       and cm.id <> v_target.id;
    if v_otros_duenios = 0 then raise exception 'F5_ULTIMO_DUENIO'; end if;
  end if;

  v_before := to_jsonb(v_target);
  update public.comercio_miembros
     set rol = p_rol,
         permisos = case when p_rol = 'empleado' then p_permisos else '{}'::jsonb end,
         activo = p_activo,
         revoked_at = case when p_activo then null else coalesce(revoked_at, now()) end,
         permission_version = permission_version + 1,
         updated_at = now()
   where id = v_target.id
   returning * into v_after;

  insert into private.f5_membresia_eventos(
    comercio_id, actor_user_id, target_user_id, antes, despues
  ) values (
    p_comercio_id, v_uid, p_target_user_id, v_before, to_jsonb(v_after)
  );

  return jsonb_build_object(
    'ok', true,
    'miembro_id', v_after.id,
    'user_id', v_after.user_id,
    'rol', v_after.rol,
    'activo', v_after.activo,
    'permission_version', v_after.permission_version
  );
end;
$function$;

create or replace function public.f5_miembro_actual(p_comercio_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select jsonb_build_object(
    'comercio_id', cm.comercio_id,
    'user_id', cm.user_id,
    'rol', cm.rol,
    'nombre_mostrado', cm.nombre_mostrado,
    'activo', cm.activo,
    'permission_version', cm.permission_version,
    'permisos_efectivos', to_jsonb(private.f5_permisos_efectivos(p_comercio_id))
  )
  from public.comercio_miembros cm
  where cm.comercio_id = p_comercio_id
    and cm.user_id = (select auth.uid())
    and cm.activo;
$function$;

create or replace function public.f5_actualizar_miembro(
  p_comercio_id uuid,
  p_target_user_id uuid,
  p_rol text,
  p_permisos jsonb,
  p_activo boolean
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private._f5_actualizar_miembro(
    p_comercio_id,
    p_target_user_id,
    p_rol,
    p_permisos,
    p_activo
  );
$function$;

drop policy if exists miembros_write on public.comercio_miembros;
revoke insert, update, delete on public.comercio_miembros from anon, authenticated;
grant select on public.comercio_miembros to authenticated;

revoke all on table private.f5_membresia_eventos from public, anon, authenticated, service_role;
revoke all on sequence private.f5_membresia_eventos_id_seq from public, anon, authenticated, service_role;

revoke all on function private.f5_catalogo_permisos() from public, anon, authenticated, service_role;
revoke all on function private.f5_permisos_validos(jsonb) from public, anon, authenticated, service_role;
revoke all on function private.f5_permisos_efectivos(uuid) from public, anon, authenticated, service_role;
revoke all on function private._f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean) from public, anon, authenticated, service_role;
revoke all on function public.f5_miembro_actual(uuid) from public, anon, authenticated, service_role;
revoke all on function public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean) from public, anon, authenticated, service_role;

-- Los wrappers son SECURITY INVOKER. Por eso authenticated necesita ejecutar los
-- helpers privados, aunque el esquema private no esté expuesto por Data API.
grant usage on schema private to authenticated;
grant execute on function private.f5_permisos_efectivos(uuid) to authenticated;
grant execute on function private._f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean) to authenticated;
grant execute on function public.f5_miembro_actual(uuid) to authenticated;
grant execute on function public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean) to authenticated;

-- F5.3 — configuración operativa/privilegiada y contrato rollback 10/6.
create or replace function private.f5_config_keys_validas(
  p_patch jsonb,
  p_allowed text[]
)
returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select case
    when p_patch is null or jsonb_typeof(p_patch) <> 'object' then false
    else not exists (
      select 1
      from jsonb_object_keys(p_patch) as key(clave)
      where not (key.clave = any(p_allowed))
    )
  end;
$function$;

create or replace function private._f5_actualizar_config_operativa(
  p_comercio_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_actor public.comercio_miembros%rowtype;
  v_permisos text[];
  v_row public.comercio_configuracion%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null then raise exception 'F5_COMERCIO_REQUERIDO'; end if;
  if not private.f5_config_keys_validas(
    p_patch,
    array[
      'fondo_caja','fondo_caja_cigarros','dias_aviso_vence',
      'dias_plazo_fiado','recargo_fiado_pct','motivos_egreso_extra'
    ]::text[]
  ) then
    raise exception 'F5_CONFIG_KEYS_INVALIDAS';
  end if;

  select * into v_actor
  from public.comercio_miembros cm
  where cm.comercio_id = p_comercio_id
    and cm.user_id = v_uid
    and cm.activo;
  if not found then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'LICENSE_INACTIVE'; end if;

  if v_actor.rol = 'empleado' then
    v_permisos := private.f5_permisos_efectivos(p_comercio_id);
    if ((p_patch ? 'fondo_caja' or p_patch ? 'fondo_caja_cigarros' or p_patch ? 'motivos_egreso_extra')
        and not ('caja_operar' = any(v_permisos)))
       or (p_patch ? 'dias_aviso_vence' and not ('vencimientos_ver' = any(v_permisos)))
       or ((p_patch ? 'dias_plazo_fiado' or p_patch ? 'recargo_fiado_pct')
        and not ('fiado_operar' = any(v_permisos))) then
      raise exception 'F5_CONFIG_PERMISSION_REQUIRED';
    end if;
  elsif v_actor.rol not in ('duenio','admin') then
    raise exception 'ROLE_REQUIRED';
  end if;

  if p_patch ? 'fondo_caja' and (
       jsonb_typeof(p_patch->'fondo_caja') <> 'number'
       or (p_patch->>'fondo_caja')::numeric < 0
     ) then raise exception 'F5_FONDO_CAJA_INVALIDO'; end if;
  if p_patch ? 'fondo_caja_cigarros' and (
       jsonb_typeof(p_patch->'fondo_caja_cigarros') <> 'number'
       or (p_patch->>'fondo_caja_cigarros')::numeric < 0
     ) then raise exception 'F5_FONDO_CIGARROS_INVALIDO'; end if;
  if p_patch ? 'dias_aviso_vence' and (
       jsonb_typeof(p_patch->'dias_aviso_vence') <> 'number'
       or (p_patch->>'dias_aviso_vence')::integer not between 1 and 3650
     ) then raise exception 'F5_DIAS_AVISO_INVALIDO'; end if;
  if p_patch ? 'dias_plazo_fiado' and (
       jsonb_typeof(p_patch->'dias_plazo_fiado') <> 'number'
       or (p_patch->>'dias_plazo_fiado')::integer not between 1 and 3650
     ) then raise exception 'F5_DIAS_FIADO_INVALIDO'; end if;
  if p_patch ? 'recargo_fiado_pct' and (
       jsonb_typeof(p_patch->'recargo_fiado_pct') <> 'number'
       or (p_patch->>'recargo_fiado_pct')::numeric not between 0 and 1000
     ) then raise exception 'F5_RECARGO_FIADO_INVALIDO'; end if;
  if p_patch ? 'motivos_egreso_extra' then
    if jsonb_typeof(p_patch->'motivos_egreso_extra') <> 'array'
       or jsonb_array_length(p_patch->'motivos_egreso_extra') > 50
       or exists (
         select 1 from jsonb_array_elements(p_patch->'motivos_egreso_extra') item(valor)
         where jsonb_typeof(item.valor) <> 'string'
            or length(item.valor #>> '{}') not between 1 and 120
       ) then
      raise exception 'F5_MOTIVOS_EGRESO_INVALIDOS';
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));
  insert into public.comercio_configuracion(comercio_id)
  values(p_comercio_id)
  on conflict (comercio_id) do nothing;

  update public.comercio_configuracion cfg
     set fondo_caja = case when p_patch ? 'fondo_caja' then (p_patch->>'fondo_caja')::numeric else cfg.fondo_caja end,
         fondo_caja_cigarros = case when p_patch ? 'fondo_caja_cigarros' then (p_patch->>'fondo_caja_cigarros')::numeric else cfg.fondo_caja_cigarros end,
         dias_aviso_vence = case when p_patch ? 'dias_aviso_vence' then (p_patch->>'dias_aviso_vence')::integer else cfg.dias_aviso_vence end,
         dias_plazo_fiado = case when p_patch ? 'dias_plazo_fiado' then (p_patch->>'dias_plazo_fiado')::integer else cfg.dias_plazo_fiado end,
         recargo_fiado_pct = case when p_patch ? 'recargo_fiado_pct' then (p_patch->>'recargo_fiado_pct')::numeric else cfg.recargo_fiado_pct end,
         motivos_egreso_extra = case when p_patch ? 'motivos_egreso_extra' then array(
           select jsonb_array_elements_text(p_patch->'motivos_egreso_extra')
         ) else cfg.motivos_egreso_extra end,
         updated_at = now()
   where cfg.comercio_id = p_comercio_id
   returning * into v_row;

  return jsonb_build_object(
    'ok',true,'comercio_id',v_row.comercio_id,'updated_at',v_row.updated_at
  );
end;
$function$;

create or replace function private._f5_actualizar_config_privilegiada(
  p_comercio_id uuid,
  p_patch jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_row public.comercio_configuracion%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null then raise exception 'F5_COMERCIO_REQUERIDO'; end if;
  if not private.f5_config_keys_validas(
    p_patch,
    -- pin_hash y permisos_empleado quedan fuera del contrato: son autoridad de la
    -- era legacy, ningún cliente los escribe y f32MapConfig ya no los lee. Aceptarlos
    -- dejaba una ruta de escritura a un campo de autoridad sin lector. F5.1 los
    -- reemplaza por comercio_miembros.permisos.
    array[
      'modulo_fiado','modulo_vencimientos','modulo_cigarros','whatsapp_dueno'
    ]::text[]
  ) then
    raise exception 'F5_CONFIG_KEYS_INVALIDAS';
  end if;
  if not private.tiene_rol(p_comercio_id,array['duenio','admin']) then
    raise exception 'ROLE_REQUIRED';
  end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'LICENSE_INACTIVE'; end if;

  if p_patch ? 'whatsapp_dueno' and (
       jsonb_typeof(p_patch->'whatsapp_dueno') <> 'string'
       or length(p_patch->>'whatsapp_dueno') > 40
     ) then raise exception 'F5_WHATSAPP_INVALIDO'; end if;
  if (p_patch ? 'modulo_fiado' and jsonb_typeof(p_patch->'modulo_fiado') <> 'boolean')
     or (p_patch ? 'modulo_vencimientos' and jsonb_typeof(p_patch->'modulo_vencimientos') <> 'boolean')
     or (p_patch ? 'modulo_cigarros' and jsonb_typeof(p_patch->'modulo_cigarros') <> 'boolean') then
    raise exception 'F5_MODULO_INVALIDO';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));
  insert into public.comercio_configuracion(comercio_id)
  values(p_comercio_id)
  on conflict (comercio_id) do nothing;

  update public.comercio_configuracion cfg
     set modulo_fiado = case when p_patch ? 'modulo_fiado' then (p_patch->>'modulo_fiado')::boolean else cfg.modulo_fiado end,
         modulo_vencimientos = case when p_patch ? 'modulo_vencimientos' then (p_patch->>'modulo_vencimientos')::boolean else cfg.modulo_vencimientos end,
         modulo_cigarros = case when p_patch ? 'modulo_cigarros' then (p_patch->>'modulo_cigarros')::boolean else cfg.modulo_cigarros end,
         whatsapp_dueno = case when p_patch ? 'whatsapp_dueno' then p_patch->>'whatsapp_dueno' else cfg.whatsapp_dueno end,
         updated_at = now()
   where cfg.comercio_id = p_comercio_id
   returning * into v_row;

  return jsonb_build_object(
    'ok',true,'comercio_id',v_row.comercio_id,'updated_at',v_row.updated_at
  );
end;
$function$;

create or replace function public.f5_actualizar_config_operativa(
  p_comercio_id uuid,
  p_patch jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private._f5_actualizar_config_operativa(p_comercio_id,p_patch);
$function$;

create or replace function public.f5_actualizar_config_privilegiada(
  p_comercio_id uuid,
  p_patch jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private._f5_actualizar_config_privilegiada(p_comercio_id,p_patch);
$function$;

-- Conserva el proyector F4.3 original como base una sola vez y coloca delante la
-- costura F5 que mezcla los cinco centinelas del blob congelado.
do $projection$
begin
  if to_regprocedure('qa.v4_to_legacy_f43_base(uuid)') is null then
    if to_regprocedure('qa.v4_to_legacy(uuid)') is null then
      raise exception 'F5_V4_TO_LEGACY_BASE_AUSENTE';
    end if;
    alter function qa.v4_to_legacy(uuid) rename to v4_to_legacy_f43_base;
  end if;
end
$projection$;

-- Costura de rollback. Definida UNA sola vez: en rev7 convivia con una segunda
-- definicion en 08_rollback_contract_fix.sql y ganaba la ultima aplicada, asi que
-- un replay parcial de la cadena revertia el arreglo. 08 se elimino.
-- 10 canonicas desde comercio_configuracion + nombre desde comercios + 5
-- preservadas verbatim del blob = 16 claves.
create or replace function private._f5_merge_legacy_config(
  p_comercio_id uuid,
  p_projection jsonb
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_legacy_user_id uuid;
  v_legacy_config jsonb;
  v_preserved jsonb;
  v_canonical jsonb;
  v_config public.comercio_configuracion%rowtype;
  v_nombre text;
begin
  select m.f43_legacy_user_id
    into v_legacy_user_id
    from public.migraciones_f4 m
   where m.comercio_id = p_comercio_id;
  if v_legacy_user_id is null then return p_projection; end if;

  select d.db->'config'
    into v_legacy_config
    from public.datos_kiosco d
   where d.id = v_legacy_user_id;
  if v_legacy_config is null or jsonb_typeof(v_legacy_config) <> 'object' then
    raise exception 'F5_LEGACY_CONFIG_FALTANTE';
  end if;
  if not (v_legacy_config ?& array[
    'nroVenta','ultBackup','pinDuenio','pinHash','permisosEmpleado'
  ]::text[]) then
    raise exception 'F5_LEGACY_CONFIG_INCOMPLETA';
  end if;

  v_preserved := jsonb_build_object(
    'nroVenta',v_legacy_config->'nroVenta',
    'ultBackup',v_legacy_config->'ultBackup',
    'pinDuenio',v_legacy_config->'pinDuenio',
    'pinHash',v_legacy_config->'pinHash',
    'permisosEmpleado',v_legacy_config->'permisosEmpleado'
  );
  select * into strict v_config
  from public.comercio_configuracion cfg where cfg.comercio_id=p_comercio_id;
  select c.nombre into strict v_nombre
  from public.comercios c where c.id=p_comercio_id;
  v_canonical:=jsonb_build_object(
    'nombre',v_nombre,
    'fondoCaja',v_config.fondo_caja,
    'fondoCajaCigarros',v_config.fondo_caja_cigarros,
    'whatsappDueno',v_config.whatsapp_dueno,
    'diasAvisoVence',v_config.dias_aviso_vence,
    'diasPlazoFiado',v_config.dias_plazo_fiado,
    'recargoFiadoPct',v_config.recargo_fiado_pct,
    'moduloFiado',v_config.modulo_fiado,
    'moduloVencimientos',v_config.modulo_vencimientos,
    'moduloCigarros',v_config.modulo_cigarros,
    'motivosEgresoExtra',to_jsonb(v_config.motivos_egreso_extra)
  );
  return jsonb_set(
    p_projection,
    '{config}',
    v_canonical || v_preserved,
    true
  );
end;
$function$;

create or replace function qa.v4_to_legacy(p_comercio_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select private._f5_merge_legacy_config(
    p_comercio_id,
    qa.v4_to_legacy_f43_base(p_comercio_id)
  );
$function$;

create or replace function private._f43_v4_to_legacy(p_comercio_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select qa.v4_to_legacy(p_comercio_id);
$function$;

drop policy if exists config_write on public.comercio_configuracion;
revoke insert,update,delete on public.comercio_configuracion from public,anon,authenticated;

revoke all on function private.f5_config_keys_validas(jsonb,text[]) from public,anon,authenticated,service_role;
revoke all on function private._f5_actualizar_config_operativa(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_actualizar_config_privilegiada(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_merge_legacy_config(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.f5_actualizar_config_operativa(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.f5_actualizar_config_privilegiada(uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function qa.v4_to_legacy_f43_base(uuid) from public,anon,authenticated,service_role;
revoke all on function qa.v4_to_legacy(uuid) from public,anon,authenticated,service_role;

grant execute on function private._f5_actualizar_config_operativa(uuid,jsonb) to authenticated;
grant execute on function private._f5_actualizar_config_privilegiada(uuid,jsonb) to authenticated;
grant execute on function public.f5_actualizar_config_operativa(uuid,jsonb) to authenticated;
grant execute on function public.f5_actualizar_config_privilegiada(uuid,jsonb) to authenticated;
