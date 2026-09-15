-- F5.4 — autoridad personal offline append-only, 7 días para todos los roles.

create table if not exists public.autoridad_leases (
  lease_id uuid primary key default gen_random_uuid(),
  lease_family_id uuid not null,
  comercio_id uuid not null references public.comercios(id),
  user_id uuid not null references auth.users(id),
  device_id uuid not null references public.comercio_dispositivos(id),
  rol text not null check (rol in ('duenio','admin','empleado')),
  permisos jsonb not null check (jsonb_typeof(permisos)='object'),
  operation_types text[] not null,
  permission_version bigint not null check (permission_version >= 1),
  contract_version integer not null default 1 check (contract_version >= 1),
  ttl_seconds integer not null check (ttl_seconds > 0),
  issued_at timestamptz not null,
  valid_until timestamptz not null,
  aceptacion_hasta timestamptz not null,
  created_at timestamptz not null default now(),
  constraint autoridad_leases_temporal_check
    check (valid_until = issued_at + make_interval(secs=>ttl_seconds)),
  constraint autoridad_leases_aceptacion_check
    check (aceptacion_hasta = valid_until + make_interval(secs=>2592000)),
  constraint autoridad_leases_operaciones_check
    check (
      cardinality(operation_types) > 0
      and operation_types <@ array[
        'abrir_sesion_caja_v4','registrar_venta_v4','registrar_pago_fiado_v4',
        'registrar_egreso_v4','cerrar_sesion_caja_v4'
      ]::text[]
    )
);

do $lease_duration_contract$
begin
  if exists (
    select 1
    from public.autoridad_leases l
    where l.valid_until<>l.issued_at+make_interval(secs=>l.ttl_seconds)
       or l.aceptacion_hasta<>l.valid_until+make_interval(secs=>2592000)
  ) then
    raise exception 'F5_LEASE_DURATION_LEGACY_INVALID'
      using hint='Reemitir o corregir los leases históricos antes de instalar F5; no convertir días calendario en segundos de forma implícita.';
  end if;
  alter table public.autoridad_leases
    drop constraint if exists autoridad_leases_temporal_check,
    drop constraint if exists autoridad_leases_aceptacion_check;
  alter table public.autoridad_leases
    add constraint autoridad_leases_temporal_check
      check (valid_until=issued_at+make_interval(secs=>ttl_seconds)),
    add constraint autoridad_leases_aceptacion_check
      check (aceptacion_hasta=valid_until+make_interval(secs=>2592000));
end
$lease_duration_contract$;

create index if not exists autoridad_leases_actor_device_idx
  on public.autoridad_leases(comercio_id,user_id,device_id,issued_at desc);
create index if not exists autoridad_leases_family_idx
  on public.autoridad_leases(lease_family_id,created_at desc);
create index if not exists autoridad_leases_acceptance_idx
  on public.autoridad_leases(aceptacion_hasta);
create index if not exists autoridad_leases_user_idx
  on public.autoridad_leases(user_id);
create index if not exists autoridad_leases_device_idx
  on public.autoridad_leases(device_id);

create table if not exists public.autoridad_revocaciones (
  id uuid primary key default gen_random_uuid(),
  lease_family_id uuid not null,
  comercio_id uuid not null references public.comercios(id),
  target_user_id uuid not null references auth.users(id),
  device_id uuid references public.comercio_dispositivos(id),
  motivo text not null,
  dura boolean not null,
  revocada_por uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint autoridad_revocaciones_motivo_check
    check (length(trim(motivo)) between 1 and 240)
);

create unique index if not exists autoridad_revocaciones_dura_family_uq
  on public.autoridad_revocaciones(lease_family_id)
  where dura;
create index if not exists autoridad_revocaciones_comercio_created_idx
  on public.autoridad_revocaciones(comercio_id,created_at desc);
create index if not exists autoridad_revocaciones_target_created_idx
  on public.autoridad_revocaciones(target_user_id,created_at desc);
create index if not exists autoridad_revocaciones_device_idx
  on public.autoridad_revocaciones(device_id);
create index if not exists autoridad_revocaciones_actor_idx
  on public.autoridad_revocaciones(revocada_por);

create table if not exists private.f5_autoridad_eventos (
  id bigint generated always as identity primary key,
  comercio_id uuid not null references public.comercios(id),
  user_id uuid not null,
  device_id uuid,
  tipo text not null check (tipo in (
    'chequeo','emision','reemplazo','rechazo','revocacion_normal','revocacion_dura'
  )),
  lease_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists f5_autoridad_eventos_comercio_created_idx
  on private.f5_autoridad_eventos(comercio_id,created_at desc);

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

-- Incluye TRUNCATE para prevenir borrados accidentales en sesiones
-- administrativas. No sustituye el control de acceso del rol propietario.

drop trigger if exists autoridad_leases_append_only on public.autoridad_leases;
create trigger autoridad_leases_append_only
before update or delete on public.autoridad_leases
for each row execute function private._f5_append_only();

drop trigger if exists autoridad_leases_append_only_truncate on public.autoridad_leases;
create trigger autoridad_leases_append_only_truncate
before truncate on public.autoridad_leases
for each statement execute function private._f5_append_only();

drop trigger if exists autoridad_revocaciones_append_only on public.autoridad_revocaciones;
create trigger autoridad_revocaciones_append_only
before update or delete on public.autoridad_revocaciones
for each row execute function private._f5_append_only();

drop trigger if exists autoridad_revocaciones_append_only_truncate on public.autoridad_revocaciones;
create trigger autoridad_revocaciones_append_only_truncate
before truncate on public.autoridad_revocaciones
for each statement execute function private._f5_append_only();

drop trigger if exists f5_autoridad_eventos_append_only on private.f5_autoridad_eventos;
create trigger f5_autoridad_eventos_append_only
before update or delete on private.f5_autoridad_eventos
for each row execute function private._f5_append_only();

drop trigger if exists f5_autoridad_eventos_append_only_truncate on private.f5_autoridad_eventos;
create trigger f5_autoridad_eventos_append_only_truncate
before truncate on private.f5_autoridad_eventos
for each statement execute function private._f5_append_only();

create or replace function private._f5_operaciones_offline(p_permisos text[])
returns text[]
language sql
immutable
security invoker
set search_path = ''
as $function$
  select coalesce(array_agg(tipo order by orden),array[]::text[])
  from (
    values
      (1,'abrir_sesion_caja_v4',
        'ventas_registrar'=any(p_permisos) or 'caja_operar'=any(p_permisos)),
      (2,'registrar_venta_v4','ventas_registrar'=any(p_permisos)),
      (3,'registrar_pago_fiado_v4','fiado_operar'=any(p_permisos)),
      (4,'registrar_egreso_v4','caja_operar'=any(p_permisos)),
      (5,'cerrar_sesion_caja_v4','caja_operar'=any(p_permisos))
  ) as operacion(orden,tipo,permitida)
  where permitida;
$function$;

create or replace function private._f5_chequear_autoridad(
  p_comercio_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_member public.comercio_miembros%rowtype;
  v_device public.comercio_dispositivos%rowtype;
  v_permisos text[] := array[]::text[];
  v_ops text[] := array[]::text[];
  v_causas text[] := array[]::text[];
  v_latest public.autoridad_leases%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;

  select * into v_member
  from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.user_id=v_uid and cm.activo;
  if not found then v_causas:=array_append(v_causas,'F5_MEMBERSHIP_REVOKED'); end if;

  select * into v_device
  from public.comercio_dispositivos d
  where d.id=p_device_id and d.comercio_id=p_comercio_id and d.user_id=v_uid;
  if not found or v_device.revoked_at is not null then
    v_causas:=array_append(v_causas,'F5_DEVICE_REVOKED');
  end if;

  if not private.licencia_activa(p_comercio_id) then
    v_causas:=array_append(v_causas,'F33_LICENSE_NOT_OPERABLE');
  end if;

  if v_member.id is not null then
    v_permisos:=private.f5_permisos_efectivos(p_comercio_id);
    v_ops:=private._f5_operaciones_offline(v_permisos);
    if cardinality(v_ops)=0 then v_causas:=array_append(v_causas,'F5_NO_OFFLINE_OPERATIONS'); end if;
  end if;

  select * into v_latest
  from public.autoridad_leases l
  where l.comercio_id=p_comercio_id and l.user_id=v_uid and l.device_id=p_device_id
  order by l.issued_at desc,l.lease_id desc
  limit 1;
  if v_latest.lease_id is not null and exists (
    select 1 from public.autoridad_revocaciones r
    where r.lease_family_id=v_latest.lease_family_id and r.dura
  ) then
    v_causas:=array_append(v_causas,'F5_LEASE_FAMILY_REVOKED');
  end if;

  insert into private.f5_autoridad_eventos(
    comercio_id,user_id,device_id,tipo,lease_id,detalle
  ) values (
    p_comercio_id,v_uid,p_device_id,
    case when cardinality(v_causas)=0 then 'chequeo' else 'rechazo' end,
    v_latest.lease_id,
    jsonb_build_object('causas',to_jsonb(v_causas))
  );

  return jsonb_build_object(
    'writable',cardinality(v_causas)=0,
    'causas',to_jsonb(v_causas),
    'server_now',now(),
    'membership',case when v_member.id is null then null else jsonb_build_object(
      'comercio_id',v_member.comercio_id,'user_id',v_member.user_id,
      'rol',v_member.rol,'permission_version',v_member.permission_version,
      'permisos_efectivos',to_jsonb(v_permisos)
    ) end,
    'operation_types',to_jsonb(v_ops),
    'lease',case when v_latest.lease_id is null then null else to_jsonb(v_latest) end
  );
end;
$function$;

create or replace function private._f5_obtener_lease(
  p_comercio_id uuid,
  p_device_id uuid,
  p_current_lease_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_member public.comercio_miembros%rowtype;
  v_device public.comercio_dispositivos%rowtype;
  v_latest public.autoridad_leases%rowtype;
  v_new public.autoridad_leases%rowtype;
  v_permisos text[];
  v_permisos_json jsonb;
  v_ops text[];
  v_family uuid;
  v_now timestamptz := clock_timestamp();
  v_hard_revoked boolean := false;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null or p_device_id is null then raise exception 'F5_LEASE_SCOPE_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext(
    p_comercio_id::text||':'||v_uid::text||':'||p_device_id::text
  ));

  select * into v_member
  from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.user_id=v_uid and cm.activo
  for update;
  if not found then raise exception 'F5_MEMBERSHIP_REVOKED'; end if;

  select * into v_device
  from public.comercio_dispositivos d
  where d.id=p_device_id and d.comercio_id=p_comercio_id and d.user_id=v_uid
  for update;
  if not found or v_device.revoked_at is not null then raise exception 'F5_DEVICE_REVOKED'; end if;
  if not private.licencia_activa(p_comercio_id) then raise exception 'LICENSE_INACTIVE'; end if;

  if p_current_lease_id is not null and not exists (
    select 1 from public.autoridad_leases l
    where l.lease_id=p_current_lease_id and l.comercio_id=p_comercio_id
      and l.user_id=v_uid and l.device_id=p_device_id
  ) then
    raise exception 'F5_CURRENT_LEASE_INVALID';
  end if;

  v_permisos:=private.f5_permisos_efectivos(p_comercio_id);
  v_ops:=private._f5_operaciones_offline(v_permisos);
  if cardinality(v_ops)=0 then raise exception 'F5_NO_OFFLINE_OPERATIONS'; end if;
  select coalesce(jsonb_object_agg(p,true),'{}'::jsonb)
    into v_permisos_json
    from unnest(v_permisos) p;

  select * into v_latest
  from public.autoridad_leases l
  where l.comercio_id=p_comercio_id and l.user_id=v_uid and l.device_id=p_device_id
  order by l.issued_at desc,l.lease_id desc
  limit 1;
  if v_latest.lease_id is not null then
    select exists(
      select 1 from public.autoridad_revocaciones r
      where r.lease_family_id=v_latest.lease_family_id and r.dura
    ) into v_hard_revoked;
  end if;

  if v_latest.lease_id is not null
     and not v_hard_revoked
     and v_latest.permission_version=v_member.permission_version
     and v_latest.contract_version=1
     and v_latest.rol=v_member.rol
     and v_latest.permisos=v_permisos_json
     and v_latest.operation_types=v_ops
     and v_latest.valid_until-v_now > make_interval(secs=>518400) then
    return jsonb_build_object('issued',false,'server_now',v_now,'lease',to_jsonb(v_latest));
  end if;

  v_family:=case
    when v_latest.lease_id is not null and not v_hard_revoked then v_latest.lease_family_id
    else gen_random_uuid()
  end;
  insert into public.autoridad_leases(
    lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
    operation_types,permission_version,contract_version,ttl_seconds,
    issued_at,valid_until,aceptacion_hasta
  ) values (
    gen_random_uuid(),v_family,p_comercio_id,v_uid,p_device_id,v_member.rol,
    v_permisos_json,v_ops,v_member.permission_version,1,604800,
    v_now,v_now+make_interval(secs=>604800),v_now+make_interval(secs=>3196800)
  ) returning * into v_new;

  insert into private.f5_autoridad_eventos(
    comercio_id,user_id,device_id,tipo,lease_id,detalle
  ) values (
    p_comercio_id,v_uid,p_device_id,
    case when v_latest.lease_id is null or v_hard_revoked then 'emision' else 'reemplazo' end,
    v_new.lease_id,
    jsonb_build_object('lease_family_id',v_new.lease_family_id,'ttl_seconds',604800)
  );
  return jsonb_build_object('issued',true,'server_now',v_now,'lease',to_jsonb(v_new));
end;
$function$;

create or replace function private.f5_validar_operacion_offline(
  p_operation_type text,
  p_lease_id uuid,
  p_comercio_id uuid,
  p_device_id uuid,
  p_created_at timestamptz,
  p_lease_family_id text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_lease public.autoridad_leases%rowtype;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  select * into v_lease
  from public.autoridad_leases l
  where l.lease_id=p_lease_id
    and l.comercio_id=p_comercio_id
    and l.user_id=v_uid
    and l.device_id=p_device_id
    and l.lease_family_id::text=p_lease_family_id;
  if not found then return jsonb_build_object('valid',false,'code','F5_LEASE_SCOPE_INVALID'); end if;
  if exists (
    select 1 from public.autoridad_revocaciones r
    where r.lease_family_id=v_lease.lease_family_id and r.dura
  ) then return jsonb_build_object('valid',false,'code','F5_HARD_REVOKED'); end if;
  if not (p_operation_type=any(v_lease.operation_types)) then
    return jsonb_build_object('valid',false,'code','F5_OPERATION_NOT_ALLOWED');
  end if;
  if p_created_at is null or p_created_at<v_lease.issued_at or p_created_at>v_lease.valid_until then
    return jsonb_build_object('valid',false,'code','F5_CREATED_AT_OUTSIDE_LEASE');
  end if;
  if clock_timestamp()>v_lease.aceptacion_hasta then
    return jsonb_build_object(
      'valid',false,'code','F5_ACCEPTANCE_EXPIRED','estado','pendiente_de_decision',
      'lease_id',v_lease.lease_id,'lease_family_id',v_lease.lease_family_id
    );
  end if;
  return jsonb_build_object(
    'valid',true,'estado','aplicar','lease_id',v_lease.lease_id,
    'lease_family_id',v_lease.lease_family_id,'user_id',v_lease.user_id,
    'rol',v_lease.rol,'permisos',v_lease.permisos
  );
end;
$function$;

create or replace function private._f5_revocar_autoridad(
  p_comercio_id uuid,
  p_target_user_id uuid,
  p_device_id uuid,
  p_dura boolean,
  p_motivo text,
  p_ack_perdida text default null
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
  v_inserted integer := 0;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_dura is null or length(trim(coalesce(p_motivo,''))) not between 1 and 240 then
    raise exception 'F5_REVOCACION_INVALIDA';
  end if;
  if p_dura and p_ack_perdida is distinct from 'ACEPTO_PERDER_OPERACIONES_OFFLINE' then
    raise exception 'F5_ACK_PERDIDA_REQUERIDO';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));
  select * into v_actor from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.user_id=v_uid and cm.activo for update;
  if not found or v_actor.rol not in ('duenio','admin') then raise exception 'ROLE_REQUIRED'; end if;
  select * into v_target from public.comercio_miembros cm
  where cm.comercio_id=p_comercio_id and cm.user_id=p_target_user_id for update;
  if not found then raise exception 'F5_MIEMBRO_NO_EXISTE'; end if;
  if v_actor.rol='admin' and (v_actor.user_id=v_target.user_id or v_target.rol<>'empleado') then
    raise exception 'F5_ADMIN_SOLO_EMPLEADOS';
  end if;
  if p_device_id is not null and not exists (
    select 1 from public.comercio_dispositivos d
    where d.id=p_device_id and d.comercio_id=p_comercio_id and d.user_id=p_target_user_id
  ) then raise exception 'F5_DEVICE_SCOPE_INVALID'; end if;

  insert into public.autoridad_revocaciones(
    lease_family_id,comercio_id,target_user_id,device_id,motivo,dura,revocada_por
  )
  select distinct l.lease_family_id,p_comercio_id,p_target_user_id,p_device_id,
    trim(p_motivo),p_dura,v_uid
  from public.autoridad_leases l
  where l.comercio_id=p_comercio_id and l.user_id=p_target_user_id
    and (p_device_id is null or l.device_id=p_device_id)
    and not exists (
      select 1 from public.autoridad_revocaciones r
      where r.lease_family_id=l.lease_family_id and r.dura and p_dura
    );
  get diagnostics v_inserted=row_count;

  if p_dura then
    update public.comercio_dispositivos d
       set revoked_at=coalesce(d.revoked_at,now()),updated_at=now()
     where d.comercio_id=p_comercio_id and d.user_id=p_target_user_id
       and (p_device_id is null or d.id=p_device_id);
  end if;
  insert into private.f5_autoridad_eventos(
    comercio_id,user_id,device_id,tipo,detalle
  ) values (
    p_comercio_id,p_target_user_id,p_device_id,
    case when p_dura then 'revocacion_dura' else 'revocacion_normal' end,
    jsonb_build_object('actor_user_id',v_uid,'motivo',trim(p_motivo),'familias',v_inserted)
  );
  return jsonb_build_object('ok',true,'dura',p_dura,'familias_revocadas',v_inserted);
end;
$function$;

create or replace function public.f5_chequear_autoridad(p_comercio_id uuid,p_device_id uuid)
returns jsonb language sql security invoker set search_path=''
as $function$ select private._f5_chequear_autoridad(p_comercio_id,p_device_id); $function$;

create or replace function public.f5_obtener_lease(
  p_comercio_id uuid,p_device_id uuid,p_current_lease_id uuid default null
)
returns jsonb language sql security invoker set search_path=''
as $function$ select private._f5_obtener_lease(p_comercio_id,p_device_id,p_current_lease_id); $function$;

create or replace function public.f5_revocar_autoridad(
  p_comercio_id uuid,p_target_user_id uuid,p_device_id uuid,p_dura boolean,
  p_motivo text,p_ack_perdida text default null
)
returns jsonb language sql security invoker set search_path=''
as $function$
  select private._f5_revocar_autoridad(
    p_comercio_id,p_target_user_id,p_device_id,p_dura,p_motivo,p_ack_perdida
  );
$function$;

alter table public.autoridad_leases enable row level security;
alter table public.autoridad_revocaciones enable row level security;

drop policy if exists autoridad_leases_select_own on public.autoridad_leases;
create policy autoridad_leases_select_own on public.autoridad_leases
for select to authenticated using (user_id=(select auth.uid()));

drop policy if exists autoridad_revocaciones_select_own on public.autoridad_revocaciones;
create policy autoridad_revocaciones_select_own on public.autoridad_revocaciones
for select to authenticated using (
  exists (
    select 1 from public.autoridad_leases l
    where l.lease_family_id=autoridad_revocaciones.lease_family_id
      and l.user_id=(select auth.uid())
  )
);

revoke all on table public.autoridad_leases from public,anon,authenticated,service_role;
revoke all on table public.autoridad_revocaciones from public,anon,authenticated,service_role;
revoke all on table private.f5_autoridad_eventos from public,anon,authenticated,service_role;
revoke all on sequence private.f5_autoridad_eventos_id_seq from public,anon,authenticated,service_role;
grant select on table public.autoridad_leases to authenticated;
grant select on table public.autoridad_revocaciones to authenticated;

revoke all on function private._f5_append_only() from public,anon,authenticated,service_role;
revoke all on function private._f5_operaciones_offline(text[]) from public,anon,authenticated,service_role;
revoke all on function private._f5_chequear_autoridad(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f5_obtener_lease(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private.f5_validar_operacion_offline(text,uuid,uuid,uuid,timestamptz,text) from public,anon,authenticated,service_role;
revoke all on function private._f5_revocar_autoridad(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated,service_role;
revoke all on function public.f5_chequear_autoridad(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f5_obtener_lease(uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f5_revocar_autoridad(uuid,uuid,uuid,boolean,text,text) from public,anon,authenticated,service_role;

grant execute on function private._f5_chequear_autoridad(uuid,uuid) to authenticated;
grant execute on function private._f5_obtener_lease(uuid,uuid,uuid) to authenticated;
grant execute on function private._f5_revocar_autoridad(uuid,uuid,uuid,boolean,text,text) to authenticated;
grant execute on function public.f5_chequear_autoridad(uuid,uuid) to authenticated;
grant execute on function public.f5_obtener_lease(uuid,uuid,uuid) to authenticated;
grant execute on function public.f5_revocar_autoridad(uuid,uuid,uuid,boolean,text,text) to authenticated;
