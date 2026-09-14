-- F5.5 — corrientes offline, raíces provisionales, segmentos y cola unificada.

do $postgres_version$
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'F5_REQUIERE_POSTGRES_15';
  end if;
end
$postgres_version$;

alter table public.caja_sesiones
  add column if not exists lease_family_id uuid,
  add column if not exists stream_key text,
  add column if not exists conflicto_con_sesion_id uuid references public.caja_sesiones(id),
  add column if not exists provisional boolean not null default false;

create table if not exists public.caja_sesion_segmentos (
  segment_id uuid primary key,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  root_session_id uuid not null references public.caja_sesiones(id) on delete cascade,
  opened_at_device timestamptz not null,
  closed_at_device timestamptz,
  created_at timestamptz not null default now(),
  unique (comercio_id,segment_id)
);

create index if not exists caja_sesion_segmentos_root_idx
  on public.caja_sesion_segmentos(comercio_id,root_session_id,created_at);

alter table public.ventas
  add column if not exists lease_id uuid references public.autoridad_leases(lease_id),
  add column if not exists lease_family_id uuid,
  add column if not exists session_segment_id uuid references public.caja_sesion_segmentos(segment_id),
  add column if not exists created_at_device timestamptz,
  add column if not exists stream_key text;
alter table public.pagos_fiado
  add column if not exists lease_id uuid references public.autoridad_leases(lease_id),
  add column if not exists lease_family_id uuid,
  add column if not exists session_segment_id uuid references public.caja_sesion_segmentos(segment_id),
  add column if not exists created_at_device timestamptz,
  add column if not exists stream_key text;
alter table public.egresos
  add column if not exists lease_id uuid references public.autoridad_leases(lease_id),
  add column if not exists lease_family_id uuid,
  add column if not exists session_segment_id uuid references public.caja_sesion_segmentos(segment_id),
  add column if not exists created_at_device timestamptz,
  add column if not exists stream_key text;
alter table public.movimientos_stock
  add column if not exists lease_id uuid references public.autoridad_leases(lease_id),
  add column if not exists lease_family_id uuid,
  add column if not exists session_segment_id uuid references public.caja_sesion_segmentos(segment_id),
  add column if not exists created_at_device timestamptz,
  add column if not exists stream_key text;
alter table public.cierres_caja
  add column if not exists lease_id uuid references public.autoridad_leases(lease_id),
  add column if not exists lease_family_id uuid,
  add column if not exists session_segment_id uuid references public.caja_sesion_segmentos(segment_id),
  add column if not exists created_at_device timestamptz,
  add column if not exists stream_key text;

create index if not exists ventas_lease_idx on public.ventas(lease_id);
create index if not exists ventas_segment_idx on public.ventas(session_segment_id);
create index if not exists pagos_fiado_lease_idx on public.pagos_fiado(lease_id);
create index if not exists pagos_fiado_segment_idx on public.pagos_fiado(session_segment_id);
create index if not exists egresos_lease_idx on public.egresos(lease_id);
create index if not exists egresos_segment_idx on public.egresos(session_segment_id);
create index if not exists movimientos_stock_lease_idx on public.movimientos_stock(lease_id);
create index if not exists movimientos_stock_segment_idx on public.movimientos_stock(session_segment_id);
create index if not exists cierres_caja_lease_idx on public.cierres_caja(lease_id);
create index if not exists cierres_caja_segment_idx on public.cierres_caja(session_segment_id);
create index if not exists caja_sesiones_conflicto_idx on public.caja_sesiones(conflicto_con_sesion_id);
create index if not exists caja_sesiones_familia_idx on public.caja_sesiones(lease_family_id);
create unique index if not exists caja_sesiones_raiz_provisional_device_uq
  on public.caja_sesiones(comercio_id,caja_id,device_id)
  where provisional and estado='requiere_conciliacion';

create table if not exists public.f5_excepciones_offline (
  id uuid primary key default gen_random_uuid(),
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  entidad text not null check (entidad in ('operacion','sesion','cierre')),
  entidad_id uuid not null,
  estado text not null check (estado in (
    'aplicada_sin_reconocer','pendiente_de_decision','requiere_conciliacion','resuelta'
  )),
  causa text not null,
  actor_user_id uuid references auth.users(id),
  device_id uuid references public.comercio_dispositivos(id),
  lease_id uuid references public.autoridad_leases(lease_id),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resuelta_at timestamptz,
  resuelta_por uuid references auth.users(id)
);

create index if not exists f5_excepciones_pendientes_idx
  on public.f5_excepciones_offline(comercio_id,estado,created_at)
  where estado<>'resuelta';
create unique index if not exists f5_excepciones_entidad_abierta_uq
  on public.f5_excepciones_offline(entidad,entidad_id)
  where estado<>'resuelta';
create index if not exists f5_excepciones_actor_idx on public.f5_excepciones_offline(actor_user_id);
create index if not exists f5_excepciones_device_idx on public.f5_excepciones_offline(device_id);
create index if not exists f5_excepciones_lease_idx on public.f5_excepciones_offline(lease_id);
create index if not exists f5_excepciones_resuelta_por_idx on public.f5_excepciones_offline(resuelta_por);

create or replace function private.f5_stream_key(
  p_comercio_id uuid,
  p_user_id uuid,
  p_device_id uuid,
  p_caja_id uuid,
  p_lease_family_id uuid,
  p_root_session_id uuid
)
returns text
language sql
immutable
security invoker
set search_path = ''
as $function$
  select encode(
    extensions.digest(
      convert_to(concat_ws(
        ':',p_comercio_id,p_user_id,p_device_id,p_caja_id,
        p_lease_family_id,p_root_session_id
      ),'UTF8'),
      'sha256'
    ),
    'hex'
  );
$function$;

create or replace function private._f5_validar_envelope(
  p_operation_type text,
  p_comercio_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'F5_OFFLINE_PAYLOAD_INVALID';
  end if;
  v_result:=private.f5_validar_operacion_offline(
    p_operation_type,
    nullif(p_payload->>'lease_id','')::uuid,
    p_comercio_id,
    nullif(p_payload->>'device_id','')::uuid,
    nullif(p_payload->>'created_at','')::timestamptz,
    p_payload->>'lease_family_id'
  );
  return v_result;
end;
$function$;

create or replace function private._f5_abrir_sesion_offline(
  p_operation_id text,
  p_comercio_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_auth jsonb;
  v_uid uuid := (select auth.uid());
  v_requested_session uuid;
  v_segment uuid;
  v_root public.caja_sesiones%rowtype;
  v_conflict public.caja_sesiones%rowtype;
  v_caja uuid;
  v_device uuid;
  v_lease uuid;
  v_family uuid;
  v_opened timestamptz;
  v_stream text;
  v_estado text;
  v_result jsonb;
begin
  v_existing:=private.reservar_operacion(
    p_operation_id,p_comercio_id,'abrir_sesion_caja_v4:f5_offline'
  );
  if v_existing is not null then return v_existing; end if;

  v_requested_session=nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment=coalesce(nullif(p_payload->>'session_segment_id','')::uuid,v_requested_session);
  v_caja=nullif(p_payload->>'caja_id','')::uuid;
  v_device=nullif(p_payload->>'device_id','')::uuid;
  v_lease=nullif(p_payload->>'lease_id','')::uuid;
  v_family=nullif(p_payload->>'lease_family_id','')::uuid;
  v_opened=nullif(p_payload->>'opened_at_device','')::timestamptz;
  if v_requested_session is null or v_segment is null or v_caja is null
     or v_device is null or v_lease is null or v_family is null or v_opened is null then
    raise exception 'F5_OFFLINE_OPEN_FIELDS_REQUIRED';
  end if;

  v_auth:=private._f5_validar_envelope('abrir_sesion_caja_v4',p_comercio_id,p_payload);
  if not coalesce((v_auth->>'valid')::boolean,false) then
    if v_auth->>'estado'='pendiente_de_decision' then
      insert into public.f5_excepciones_offline(
        comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
      ) values (
        p_comercio_id,'operacion',v_segment,'pendiente_de_decision',
        v_auth->>'code',v_uid,v_device,v_lease,
        jsonb_build_object('operation_id',p_operation_id,'operation_type','abrir_sesion_caja_v4')
      ) on conflict do nothing;
      return private.completar_operacion(
        p_operation_id,p_comercio_id,
        jsonb_build_object('estado','pendiente_de_decision','entidad_id',v_segment)
      );
    end if;
    raise exception '%',coalesce(v_auth->>'code','F5_OFFLINE_AUTHORITY_INVALID');
  end if;
  if not exists (
    select 1 from public.cajas c
    where c.id=v_caja and c.comercio_id=p_comercio_id and c.activa and c.deleted_at is null
  ) then raise exception 'CAJA_INVALIDA'; end if;

  perform pg_advisory_xact_lock(hashtext(
    p_comercio_id::text||':'||v_caja::text||':'||v_device::text
  ));
  select * into v_root
  from public.caja_sesiones s
  where s.comercio_id=p_comercio_id and s.caja_id=v_caja and s.device_id=v_device
    and s.provisional and s.estado='requiere_conciliacion'
  order by s.created_at
  limit 1
  for update;

  if v_root.id is not null then
    if v_root.abierta_por<>v_uid or v_root.lease_family_id<>v_family then
      raise exception 'F5_PROVISIONAL_ROOT_SCOPE_INVALID';
    end if;
    insert into public.caja_sesion_segmentos(
      segment_id,comercio_id,root_session_id,opened_at_device
    ) values(v_segment,p_comercio_id,v_root.id,v_opened);
    perform private._f5_registrar_aplicada_sin_reconocer(
      p_comercio_id,'sesion',v_segment,v_device,v_lease,p_operation_id,
      'abrir_sesion_caja_v4',jsonb_build_object(
        'root_session_id',v_root.id,'session_segment_id',v_segment
      )
    );
    v_result:=jsonb_build_object(
      'sesion_id',v_root.id,'session_segment_id',v_segment,
      'stream_key',v_root.stream_key,'estado','requiere_conciliacion','reused_root',true
    );
    return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
  end if;

  select * into v_conflict
  from public.caja_sesiones s
  where s.comercio_id=p_comercio_id and s.caja_id=v_caja and s.estado='abierta'
  order by s.opened_at_server
  limit 1
  for update;
  v_estado:=case when v_conflict.id is null then 'abierta' else 'requiere_conciliacion' end;
  v_stream:=private.f5_stream_key(
    p_comercio_id,v_uid,v_device,v_caja,v_family,v_requested_session
  );
  insert into public.caja_sesiones(
    id,comercio_id,caja_id,device_id,abierta_por,fondo_inicial_general,
    fondo_inicial_cigarros,opened_at_device,business_date,estado,
    lease_family_id,stream_key,conflicto_con_sesion_id,provisional
  ) values (
    v_requested_session,p_comercio_id,v_caja,v_device,v_uid,
    greatest(coalesce((p_payload->>'fondo_general')::numeric,0),0),
    greatest(coalesce((p_payload->>'fondo_cigarros')::numeric,0),0),
    v_opened,private.business_date(p_comercio_id,v_opened),v_estado,
    v_family,v_stream,v_conflict.id,true
  );
  insert into public.caja_sesion_segmentos(
    segment_id,comercio_id,root_session_id,opened_at_device
  ) values(v_segment,p_comercio_id,v_requested_session,v_opened);

  if v_conflict.id is not null then
    insert into public.f5_excepciones_offline(
      comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
    ) values (
      p_comercio_id,'sesion',v_requested_session,'requiere_conciliacion',
      'F5_OFFLINE_OPEN_CONFLICT',v_uid,v_device,v_lease,
      jsonb_build_object(
        'conflicto_con_sesion_id',v_conflict.id,'caja_id',v_caja,
        'stream_key',v_stream,'alerta_informativa',true,'bloquea',false
      )
    ) on conflict do nothing;
  end if;
  perform private._f5_registrar_aplicada_sin_reconocer(
    p_comercio_id,'sesion',v_segment,v_device,v_lease,p_operation_id,
    'abrir_sesion_caja_v4',jsonb_build_object(
      'root_session_id',v_requested_session,'session_segment_id',v_segment
    )
  );
  v_result:=jsonb_build_object(
    'sesion_id',v_requested_session,'session_segment_id',v_segment,
    'stream_key',v_stream,'estado',v_estado,'reused_root',false,
    'conflicto_con_sesion_id',v_conflict.id
  );
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end;
$function$;

create or replace function public.abrir_sesion_caja_v4(
  p_operation_id text,
  p_comercio_id uuid,
  p_payload jsonb
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private._f5_abrir_sesion_offline(p_operation_id,p_comercio_id,p_payload);
$function$;

alter table public.caja_sesion_segmentos enable row level security;
alter table public.f5_excepciones_offline enable row level security;

drop policy if exists caja_sesion_segmentos_select on public.caja_sesion_segmentos;
create policy caja_sesion_segmentos_select on public.caja_sesion_segmentos
for select to authenticated using ((select private.es_miembro(comercio_id)));

drop policy if exists f5_excepciones_select on public.f5_excepciones_offline;
create policy f5_excepciones_select on public.f5_excepciones_offline
for select to authenticated using ((select private.tiene_rol(
  comercio_id,array['duenio','admin']
)));

revoke all on table public.caja_sesion_segmentos from public,anon,authenticated,service_role;
revoke all on table public.f5_excepciones_offline from public,anon,authenticated,service_role;
grant select on table public.caja_sesion_segmentos to authenticated;
grant select on table public.f5_excepciones_offline to authenticated;

revoke all on function private.f5_stream_key(uuid,uuid,uuid,uuid,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f5_validar_envelope(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_abrir_sesion_offline(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.abrir_sesion_caja_v4(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private._f5_abrir_sesion_offline(text,uuid,jsonb) to authenticated;
grant execute on function public.abrir_sesion_caja_v4(text,uuid,jsonb) to authenticated;

-- Expected result: zero duplicate groups. If this preflight fails, preserve the
-- old constraint, reconcile duplicate closes by session/segment, and rerun.
do $f5_close_preflight$
declare
  v_duplicate_groups bigint;
begin
  select count(*) into v_duplicate_groups
  from (
    select comercio_id,caja_sesion_id,session_segment_id
    from public.cierres_caja
    group by comercio_id,caja_sesion_id,session_segment_id
    having count(*)>1
  ) duplicates;
  if v_duplicate_groups<>0 then
    raise exception 'F5_CLOSE_UNIQUENESS_PREFLIGHT_FAILED:%',v_duplicate_groups
      using hint='Conciliar cierres duplicados bajo (comercio_id,caja_sesion_id,session_segment_id) antes de reintentar.';
  end if;
end
$f5_close_preflight$;

-- PostgreSQL 15+ treats the NULL segment of a normal session as one effective
-- key, while provisional roots may keep one close per non-NULL segment.
create unique index if not exists cierres_caja_sesion_segmento_f5_uq
  on public.cierres_caja(comercio_id,caja_sesion_id,session_segment_id)
  nulls not distinct;

-- Drop the old one-close-per-root rule only after the replacement is active.
alter table public.cierres_caja
  drop constraint if exists cierres_caja_comercio_id_caja_sesion_id_key;

create or replace function private._f5_validar_destino_stream(
  p_comercio_id uuid,
  p_payload jsonb,
  p_occurred_at timestamptz
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_root public.caja_sesiones%rowtype;
  v_segment public.caja_sesion_segmentos%rowtype;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_root_id uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment_id uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_stream text := p_payload->>'stream_key';
  v_expected text;
begin
  if v_uid is null or v_device is null or v_family is null or v_root_id is null
     or v_segment_id is null or coalesce(v_stream,'')='' then
    raise exception 'F5_STREAM_FIELDS_REQUIRED';
  end if;
  select * into v_root from public.caja_sesiones s
  where s.id=v_root_id and s.comercio_id=p_comercio_id
  for share;
  if not found then raise exception 'F5_STREAM_ROOT_INVALID'; end if;
  select * into v_segment from public.caja_sesion_segmentos x
  where x.segment_id=v_segment_id and x.comercio_id=p_comercio_id
    and x.root_session_id=v_root_id
  for share;
  if not found then raise exception 'F5_STREAM_SEGMENT_INVALID'; end if;
  if v_root.abierta_por is distinct from v_uid
     or v_root.device_id<>v_device
     or v_root.lease_family_id<>v_family then
    raise exception 'F5_STREAM_SCOPE_INVALID';
  end if;
  if v_root.estado not in ('abierta','cerrada','requiere_conciliacion') then
    raise exception 'F5_STREAM_STATE_INVALID';
  end if;
  if v_segment.closed_at_device is not null
     and coalesce(p_occurred_at,clock_timestamp())>v_segment.closed_at_device then
    raise exception 'F5_OPERATION_AFTER_SEGMENT_CLOSE';
  end if;
  v_expected:=private.f5_stream_key(
    p_comercio_id,v_uid,v_device,v_root.caja_id,v_family,v_root.id
  );
  if v_stream<>v_expected or v_root.stream_key<>v_expected then
    raise exception 'F5_STREAM_KEY_INVALID';
  end if;
  return jsonb_build_object(
    'root_session_id',v_root.id,'session_segment_id',v_segment.segment_id,
    'caja_id',v_root.caja_id,'estado',v_root.estado,'stream_key',v_expected
  );
end;
$function$;

create or replace function private._f5_registrar_aplicada_sin_reconocer(
  p_comercio_id uuid,
  p_entidad text,
  p_entidad_id uuid,
  p_device_id uuid,
  p_lease_id uuid,
  p_operation_id text,
  p_operation_type text,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1 from public.comercio_miembros cm
    where cm.comercio_id=p_comercio_id and cm.user_id=(select auth.uid()) and cm.activo
  ) then
    return;
  end if;
  insert into public.f5_excepciones_offline(
    comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
  ) values (
    p_comercio_id,p_entidad,p_entidad_id,'aplicada_sin_reconocer',
    'F5_MEMBERSHIP_INACTIVE_DRAIN',(select auth.uid()),p_device_id,p_lease_id,
    coalesce(p_metadata,'{}'::jsonb)||jsonb_build_object(
      'operation_id',p_operation_id,'operation_type',p_operation_type,
      'received_at_server',clock_timestamp()
    )
  ) on conflict do nothing;
end;
$function$;

-- Route a late operation to the close for its own segment. Legacy rows without
-- a segment continue to match only the NULL-segment close of the real session.
create or replace function private.registrar_llegada_tardia()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_cierre uuid;
  v_monto numeric := 0;
  v_tipo text := tg_argv[0];
begin
  if new.caja_sesion_id is null then return new; end if;

  select c.id into v_cierre
  from public.cierres_caja c
  where c.comercio_id=new.comercio_id
    and c.caja_sesion_id=new.caja_sesion_id
    and c.session_segment_id is not distinct from new.session_segment_id
  limit 1;

  if v_cierre is null then return new; end if;

  if v_tipo='venta' then v_monto := new.total;
  elsif v_tipo='pago_fiado' then v_monto := new.monto;
  elsif v_tipo='egreso' then v_monto := -new.monto;
  end if;

  insert into public.cierre_ajustes(
    comercio_id,cierre_id,tipo,operacion_tipo,operacion_id,monto,motivo,metadata
  ) values (
    new.comercio_id,v_cierre,'llegada_tardia',v_tipo,new.id,v_monto,
    'Operación sincronizada después del cierre',
    jsonb_build_object(
      'received_at_server',new.received_at_server,'business_date',new.business_date,
      'session_segment_id',new.session_segment_id
    )
  ) on conflict do nothing;

  update public.cierres_caja set estado='requiere_conciliacion'
   where id=v_cierre and estado in ('registrado','conciliado');
  update public.caja_sesiones set estado='requiere_conciliacion'
   where id=new.caja_sesion_id and estado='cerrada';
  return new;
end;
$function$;

create or replace function private._f5_registrar_venta_offline(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_auth jsonb;
  v_dest jsonb;
  v_result jsonb;
  v_venta jsonb;
  v_item jsonb;
  v_comp jsonb;
  v_pago jsonb;
  v_venta_id uuid;
  v_root uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_lease uuid := nullif(p_payload->>'lease_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_created timestamptz := nullif(p_payload->>'created_at','')::timestamptz;
  v_cliente_id uuid;
  v_caja_id uuid;
  v_item_id uuid;
  v_producto_id uuid;
  v_combo_id uuid;
  v_occ timestamptz;
  v_business date;
  v_ticket_seq bigint;
  v_ticket_ref text;
  v_codigo text;
  v_total numeric;
  v_subtotal numeric;
  v_monto_fiado numeric;
  v_forma text;
  v_cant numeric;
  v_plazo integer;
  v_vence date;
  v_sum_pagos numeric := 0;
  v_sum_fiado numeric := 0;
  v_items_count integer := 0;
begin
  v_existing:=private.reservar_operacion(
    p_operation_id,p_comercio_id,'registrar_venta_v4:f5_offline'
  );
  if v_existing is not null then return v_existing; end if;

  v_venta:=p_payload->'venta';
  if v_venta is null or jsonb_typeof(v_venta)<>'object' then
    raise exception 'VENTA_PAYLOAD_INVALIDO';
  end if;
  v_venta_id:=nullif(v_venta->>'id','')::uuid;
  v_occ:=nullif(v_venta->>'occurred_at_device','')::timestamptz;
  if v_venta_id is null or v_occ is null or v_created is null then
    raise exception 'F5_OFFLINE_SALE_FIELDS_REQUIRED';
  end if;
  if nullif(v_venta->>'caja_sesion_id','')::uuid is distinct from v_root
     or nullif(v_venta->>'device_id','')::uuid is distinct from v_device then
    raise exception 'F5_SALE_ENVELOPE_SCOPE_MISMATCH';
  end if;

  v_auth:=private._f5_validar_envelope('registrar_venta_v4',p_comercio_id,p_payload);
  if not coalesce((v_auth->>'valid')::boolean,false) then
    if v_auth->>'estado'='pendiente_de_decision' then
      insert into public.f5_excepciones_offline(
        comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
      ) values (
        p_comercio_id,'operacion',v_venta_id,'pendiente_de_decision',v_auth->>'code',
        (select auth.uid()),v_device,v_lease,
        jsonb_build_object('operation_id',p_operation_id,'operation_type','registrar_venta_v4')
      ) on conflict do nothing;
      return private.completar_operacion(
        p_operation_id,p_comercio_id,
        jsonb_build_object('estado','pendiente_de_decision','venta_id',v_venta_id)
      );
    end if;
    raise exception '%',coalesce(v_auth->>'code','F5_OFFLINE_AUTHORITY_INVALID');
  end if;

  v_dest:=private._f5_validar_destino_stream(p_comercio_id,p_payload,v_occ);
  v_caja_id=nullif(v_dest->>'caja_id','')::uuid;
  v_cliente_id:=nullif(v_venta->>'cliente_id','')::uuid;
  v_ticket_seq:=(v_venta->>'ticket_seq')::bigint;
  v_total:=coalesce((v_venta->>'total')::numeric,0);
  v_subtotal:=coalesce((v_venta->>'subtotal')::numeric,v_total);
  v_monto_fiado:=coalesce((v_venta->>'monto_fiado')::numeric,0);
  v_forma:=v_venta->>'forma';

  if v_cliente_id is not null and not exists(
    select 1 from public.clientes c
    where c.id=v_cliente_id and c.comercio_id=p_comercio_id and c.deleted_at is null
  ) then raise exception 'CLIENTE_INVALIDO'; end if;
  if v_ticket_seq is null or v_ticket_seq<=0 then raise exception 'TICKET_SEQ_INVALIDO'; end if;
  if v_total<0 or v_subtotal<0 or v_monto_fiado<0 then raise exception 'MONTOS_INVALIDOS'; end if;
  if v_monto_fiado>0 and v_cliente_id is null then raise exception 'FIADO_REQUIERE_CLIENTE'; end if;

  select c.codigo into v_codigo from public.cajas c
  where c.id=v_caja_id and c.comercio_id=p_comercio_id;
  v_ticket_ref:=v_codigo||'-'||lpad(v_ticket_seq::text,6,'0');
  v_business:=private.business_date(p_comercio_id,v_occ);
  v_plazo:=nullif(v_venta->>'plazo_fiado_dias','')::integer;
  if v_monto_fiado>0 then
    v_plazo:=coalesce(
      v_plazo,
      (select dias_plazo_fiado from public.comercio_configuracion where comercio_id=p_comercio_id),
      30
    );
    v_vence:=coalesce(nullif(v_venta->>'vence_fiado','')::date,v_business+v_plazo);
  end if;

  insert into public.ventas(
    id,comercio_id,legacy_id,caja_sesion_id,device_id,ticket_seq,ticket_ref,cliente_id,
    occurred_at_device,business_date,subtotal,descuento_manual,descuento_detalle,
    promo_auto,promo_auto_detalle,promo_pago,promo_pago_detalle,total,forma,recibido,
    vuelto,monto_fiado,plazo_fiado_dias,vence_fiado,lease_id,lease_family_id,
    session_segment_id,created_at_device,stream_key
  ) values (
    v_venta_id,p_comercio_id,nullif(v_venta->>'legacy_id',''),v_root,v_device,
    v_ticket_seq,v_ticket_ref,v_cliente_id,v_occ,v_business,v_subtotal,
    coalesce((v_venta->>'descuento_manual')::numeric,0),v_venta->'descuento_detalle',
    coalesce((v_venta->>'promo_auto')::numeric,0),v_venta->'promo_auto_detalle',
    coalesce((v_venta->>'promo_pago')::numeric,0),v_venta->'promo_pago_detalle',
    v_total,v_forma,coalesce((v_venta->>'recibido')::numeric,v_total),
    coalesce((v_venta->>'vuelto')::numeric,0),v_monto_fiado,v_plazo,v_vence,
    v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
  );

  for v_item in select value from jsonb_array_elements(coalesce(p_payload->'items','[]'::jsonb)) loop
    v_item_id:=nullif(v_item->>'id','')::uuid;
    v_producto_id:=nullif(v_item->>'producto_id','')::uuid;
    v_combo_id:=nullif(v_item->>'combo_id','')::uuid;
    v_cant:=coalesce((v_item->>'cantidad')::numeric,0);
    if v_cant<=0 then raise exception 'ITEM_CANTIDAD_INVALIDA'; end if;

    insert into public.venta_items(
      id,comercio_id,venta_id,legacy_line_id,tipo,producto_id,combo_id,
      nombre_snapshot,rubro_snapshot,cantidad,precio_unitario,costo_unitario,
      promo_pct,bruto,neto
    ) values (
      v_item_id,p_comercio_id,v_venta_id,nullif(v_item->>'legacy_line_id',''),
      v_item->>'tipo',v_producto_id,v_combo_id,coalesce(v_item->>'nombre_snapshot',''),
      coalesce(v_item->>'rubro_snapshot',''),v_cant,
      coalesce((v_item->>'precio_unitario')::numeric,0),
      coalesce((v_item->>'costo_unitario')::numeric,0),
      nullif(v_item->>'promo_pct','')::numeric,
      coalesce((v_item->>'bruto')::numeric,0),coalesce((v_item->>'neto')::numeric,0)
    );
    v_items_count:=v_items_count+1;

    if v_item->>'tipo'='producto' then
      if not exists(
        select 1 from public.productos p
        where p.id=v_producto_id and p.comercio_id=p_comercio_id and p.deleted_at is null
      ) then raise exception 'PRODUCTO_INVALIDO'; end if;
      insert into public.movimientos_stock(
        comercio_id,producto_id,caja_sesion_id,device_id,tipo,cantidad,motivo,
        origen_tipo,origen_id,occurred_at_device,business_date,lease_id,
        lease_family_id,session_segment_id,created_at_device,stream_key
      ) values (
        p_comercio_id,v_producto_id,v_root,v_device,'venta',-v_cant,
        'Venta '||v_ticket_ref,'venta',v_venta_id,v_occ,v_business,
        v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
      );
    else
      for v_comp in select value from jsonb_array_elements(coalesce(v_item->'componentes','[]'::jsonb)) loop
        if not exists(
          select 1 from public.productos p
          where p.id=(v_comp->>'producto_id')::uuid
            and p.comercio_id=p_comercio_id and p.deleted_at is null
        ) then raise exception 'PRODUCTO_INVALIDO'; end if;
        insert into public.venta_item_componentes(
          venta_item_id,comercio_id,producto_id,nombre_snapshot,
          cantidad_por_combo,costo_unitario_snapshot
        ) values (
          v_item_id,p_comercio_id,(v_comp->>'producto_id')::uuid,
          coalesce(v_comp->>'nombre_snapshot',''),
          (v_comp->>'cantidad_por_combo')::numeric,
          coalesce((v_comp->>'costo_unitario')::numeric,0)
        );
        insert into public.movimientos_stock(
          comercio_id,producto_id,caja_sesion_id,device_id,tipo,cantidad,motivo,
          origen_tipo,origen_id,occurred_at_device,business_date,lease_id,
          lease_family_id,session_segment_id,created_at_device,stream_key
        ) values (
          p_comercio_id,(v_comp->>'producto_id')::uuid,v_root,v_device,'venta',
          -((v_comp->>'cantidad_por_combo')::numeric*v_cant),
          'Venta '||v_ticket_ref||' (combo)','venta',v_venta_id,v_occ,v_business,
          v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
        );
      end loop;
    end if;
  end loop;
  if v_items_count=0 then raise exception 'VENTA_SIN_ITEMS'; end if;

  for v_pago in select value from jsonb_array_elements(coalesce(p_payload->'pagos','[]'::jsonb)) loop
    insert into public.venta_pagos(comercio_id,venta_id,forma,monto)
    values(p_comercio_id,v_venta_id,v_pago->>'forma',(v_pago->>'monto')::numeric);
    v_sum_pagos:=v_sum_pagos+(v_pago->>'monto')::numeric;
    if v_pago->>'forma'='fiado' then
      v_sum_fiado:=v_sum_fiado+(v_pago->>'monto')::numeric;
    end if;
  end loop;
  if jsonb_array_length(coalesce(p_payload->'pagos','[]'::jsonb))=0 then
    if v_forma='mixto' then raise exception 'PAGO_MIXTO_REQUIERE_DETALLE'; end if;
    insert into public.venta_pagos(comercio_id,venta_id,forma,monto)
    values(p_comercio_id,v_venta_id,v_forma,v_total);
    v_sum_pagos:=v_total;
    if v_forma='fiado' then v_sum_fiado:=v_total; end if;
  end if;
  if abs(v_sum_pagos-v_total)>0.01 then raise exception 'PAGOS_NO_CUADRAN'; end if;
  if abs(v_sum_fiado-v_monto_fiado)>0.01 then raise exception 'FIADO_NO_CUADRA_CON_PAGOS'; end if;

  if v_monto_fiado>0 then
    insert into public.fiado_cargos(
      comercio_id,cliente_id,origen_tipo,origen_id,monto,fecha_origen_device,
      business_date,vence_fecha,recargable
    ) values (
      p_comercio_id,v_cliente_id,'venta',v_venta_id,v_monto_fiado,v_occ,
      v_business,v_vence,true
    );
  end if;

  perform private._f5_registrar_aplicada_sin_reconocer(
    p_comercio_id,'operacion',v_venta_id,v_device,v_lease,p_operation_id,
    'registrar_venta_v4',jsonb_build_object(
      'caja_sesion_id',v_root,'session_segment_id',v_segment,'monto',v_total
    )
  );
  v_result:=jsonb_build_object(
    'venta_id',v_venta_id,'ticket_ref',v_ticket_ref,'business_date',v_business,
    'received_at_server',clock_timestamp(),'sesion_id',v_root,
    'session_segment_id',v_segment,'estado',v_dest->>'estado'
  );
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end;
$function$;

create or replace function private._f5_aplicar_credito_fiado_offline(
  p_comercio_id uuid,p_cliente_id uuid,p_credito_tipo text,
  p_credito_id uuid,p_monto numeric
)
returns numeric
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_restante numeric := greatest(coalesce(p_monto,0),0);
  v_aplicado numeric;
  r record;
begin
  if p_credito_tipo not in ('pago','ajuste') then raise exception 'CREDITO_TIPO_INVALIDO'; end if;
  for r in
    select c.id,
      c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0) as pendiente
    from public.fiado_cargos c
    where c.comercio_id=p_comercio_id and c.cliente_id=p_cliente_id
      and c.monto>coalesce((select sum(a2.monto) from public.fiado_aplicaciones a2 where a2.cargo_id=c.id),0)
    order by c.vence_fecha,c.fecha_origen_device,c.received_at_server,c.id
    for update
  loop
    exit when v_restante<=0.004;
    v_aplicado:=least(v_restante,r.pendiente);
    insert into public.fiado_aplicaciones(
      comercio_id,cliente_id,credito_tipo,credito_id,cargo_id,monto
    ) values (
      p_comercio_id,p_cliente_id,p_credito_tipo,p_credito_id,r.id,v_aplicado
    ) on conflict (credito_tipo,credito_id,cargo_id) do nothing;
    v_restante:=v_restante-v_aplicado;
  end loop;
  return greatest(v_restante,0);
end;
$function$;

create or replace function private._f5_registrar_pago_fiado_offline(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_auth jsonb;
  v_dest jsonb;
  v_result jsonb;
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_cliente uuid := nullif(p_payload->>'cliente_id','')::uuid;
  v_root uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_lease uuid := nullif(p_payload->>'lease_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_occ timestamptz := nullif(p_payload->>'occurred_at_device','')::timestamptz;
  v_created timestamptz := nullif(p_payload->>'created_at','')::timestamptz;
  v_business date;
  v_monto numeric;
  v_restante numeric;
begin
  v_existing:=private.reservar_operacion(
    p_operation_id,p_comercio_id,'registrar_pago_fiado_v4:f5_offline'
  );
  if v_existing is not null then return v_existing; end if;
  if v_id is null or v_cliente is null or v_occ is null or v_created is null then
    raise exception 'F5_OFFLINE_PAYMENT_FIELDS_REQUIRED';
  end if;

  v_auth:=private._f5_validar_envelope('registrar_pago_fiado_v4',p_comercio_id,p_payload);
  if not coalesce((v_auth->>'valid')::boolean,false) then
    if v_auth->>'estado'='pendiente_de_decision' then
      insert into public.f5_excepciones_offline(
        comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
      ) values (
        p_comercio_id,'operacion',v_id,'pendiente_de_decision',v_auth->>'code',
        (select auth.uid()),v_device,v_lease,
        jsonb_build_object('operation_id',p_operation_id,'operation_type','registrar_pago_fiado_v4')
      ) on conflict do nothing;
      return private.completar_operacion(
        p_operation_id,p_comercio_id,
        jsonb_build_object('estado','pendiente_de_decision','pago_id',v_id)
      );
    end if;
    raise exception '%',coalesce(v_auth->>'code','F5_OFFLINE_AUTHORITY_INVALID');
  end if;

  v_dest:=private._f5_validar_destino_stream(p_comercio_id,p_payload,v_occ);
  if not exists(
    select 1 from public.clientes c
    where c.id=v_cliente and c.comercio_id=p_comercio_id and c.deleted_at is null
  ) then raise exception 'CLIENTE_INVALIDO'; end if;
  v_monto:=(p_payload->>'monto')::numeric;
  if v_monto<=0 then raise exception 'PAGO_INVALIDO'; end if;
  v_business:=private.business_date(p_comercio_id,v_occ);

  insert into public.pagos_fiado(
    id,comercio_id,legacy_id,cliente_id,caja_sesion_id,device_id,monto,forma,
    nota,occurred_at_device,business_date,lease_id,lease_family_id,
    session_segment_id,created_at_device,stream_key
  ) values (
    v_id,p_comercio_id,nullif(p_payload->>'legacy_id',''),v_cliente,v_root,v_device,
    v_monto,p_payload->>'forma',coalesce(p_payload->>'nota',''),v_occ,v_business,
    v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
  );
  v_restante:=private._f5_aplicar_credito_fiado_offline(
    p_comercio_id,v_cliente,'pago',v_id,v_monto
  );
  if v_restante>0.01 then raise exception 'PAGO_SUPERA_DEUDA'; end if;

  perform private._f5_registrar_aplicada_sin_reconocer(
    p_comercio_id,'operacion',v_id,v_device,v_lease,p_operation_id,
    'registrar_pago_fiado_v4',jsonb_build_object(
      'caja_sesion_id',v_root,'session_segment_id',v_segment,'monto',v_monto
    )
  );
  v_result:=jsonb_build_object(
    'pago_id',v_id,'aplicado',v_monto,'business_date',v_business,
    'sesion_id',v_root,'session_segment_id',v_segment,'estado',v_dest->>'estado'
  );
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end;
$function$;

create or replace function private._f5_registrar_egreso_offline(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_auth jsonb;
  v_dest jsonb;
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_occ timestamptz := nullif(p_payload->>'occurred_at_device','')::timestamptz;
  v_created timestamptz := nullif(p_payload->>'created_at','')::timestamptz;
  v_lease uuid := nullif(p_payload->>'lease_id','')::uuid;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_segment uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_root uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_business date;
  v_result jsonb;
begin
  v_existing:=private.reservar_operacion(
    p_operation_id,p_comercio_id,'registrar_egreso_v4:f5_offline'
  );
  if v_existing is not null then return v_existing; end if;
  if v_id is null or v_occ is null or v_created is null then
    raise exception 'F5_OFFLINE_EGRESO_FIELDS_REQUIRED';
  end if;
  v_auth:=private._f5_validar_envelope('registrar_egreso_v4',p_comercio_id,p_payload);
  if not coalesce((v_auth->>'valid')::boolean,false) then
    if v_auth->>'estado'='pendiente_de_decision' then
      insert into public.f5_excepciones_offline(
        comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
      ) values (
        p_comercio_id,'operacion',v_id,'pendiente_de_decision',v_auth->>'code',
        (select auth.uid()),v_device,v_lease,
        jsonb_build_object('operation_id',p_operation_id,'operation_type','registrar_egreso_v4')
      ) on conflict do nothing;
      return private.completar_operacion(
        p_operation_id,p_comercio_id,jsonb_build_object('estado','pendiente_de_decision','egreso_id',v_id)
      );
    end if;
    raise exception '%',coalesce(v_auth->>'code','F5_OFFLINE_AUTHORITY_INVALID');
  end if;
  v_dest:=private._f5_validar_destino_stream(p_comercio_id,p_payload,v_occ);
  v_business:=private.business_date(p_comercio_id,v_occ);
  if (p_payload->>'monto')::numeric<=0 then raise exception 'EGRESO_INVALIDO'; end if;

  insert into public.egresos(
    id,comercio_id,legacy_id,caja_sesion_id,device_id,monto,forma,caja_fisica,
    motivo,nota,occurred_at_device,business_date,lease_id,lease_family_id,
    session_segment_id,created_at_device,stream_key
  ) values (
    v_id,p_comercio_id,nullif(p_payload->>'legacy_id',''),v_root,v_device,
    (p_payload->>'monto')::numeric,p_payload->>'forma',coalesce(p_payload->>'caja_fisica',''),
    coalesce(p_payload->>'motivo','Egreso'),coalesce(p_payload->>'nota',''),v_occ,v_business,
    v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
  );
  perform private._f5_registrar_aplicada_sin_reconocer(
    p_comercio_id,'operacion',v_id,v_device,v_lease,p_operation_id,
    'registrar_egreso_v4',jsonb_build_object(
      'caja_sesion_id',v_root,'session_segment_id',v_segment,
      'monto',(p_payload->>'monto')::numeric
    )
  );
  v_result:=jsonb_build_object(
    'egreso_id',v_id,'business_date',v_business,'sesion_id',v_root,
    'session_segment_id',v_segment,'estado',v_dest->>'estado'
  );
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end;
$function$;

create or replace function private._f5_cerrar_sesion_offline(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing jsonb;
  v_auth jsonb;
  v_dest jsonb;
  v_id uuid := nullif(p_payload->>'id','')::uuid;
  v_occ timestamptz := nullif(p_payload->>'closed_at_device','')::timestamptz;
  v_created timestamptz := nullif(p_payload->>'created_at','')::timestamptz;
  v_root uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_lease uuid := nullif(p_payload->>'lease_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_estado text;
  v_x text;
  v_result jsonb;
begin
  v_existing:=private.reservar_operacion(
    p_operation_id,p_comercio_id,'cerrar_sesion_caja_v4:f5_offline'
  );
  if v_existing is not null then return v_existing; end if;
  if v_id is null or v_occ is null or v_created is null then
    raise exception 'F5_OFFLINE_CLOSE_FIELDS_REQUIRED';
  end if;
  v_auth:=private._f5_validar_envelope('cerrar_sesion_caja_v4',p_comercio_id,p_payload);
  if not coalesce((v_auth->>'valid')::boolean,false) then
    if v_auth->>'estado'='pendiente_de_decision' then
      insert into public.f5_excepciones_offline(
        comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
      ) values (
        p_comercio_id,'cierre',v_id,'pendiente_de_decision',v_auth->>'code',
        (select auth.uid()),v_device,v_lease,
        jsonb_build_object('operation_id',p_operation_id,'session_segment_id',v_segment)
      ) on conflict do nothing;
      return private.completar_operacion(
        p_operation_id,p_comercio_id,jsonb_build_object('estado','pendiente_de_decision','cierre_id',v_id)
      );
    end if;
    raise exception '%',coalesce(v_auth->>'code','F5_OFFLINE_AUTHORITY_INVALID');
  end if;
  v_dest:=private._f5_validar_destino_stream(p_comercio_id,p_payload,v_occ);
  select case when s.estado='requiere_conciliacion' then 'requiere_conciliacion' else 'registrado' end
    into v_estado from public.caja_sesiones s
    where s.id=v_root and s.comercio_id=p_comercio_id for update;
  if (select closed_at_device from public.caja_sesion_segmentos where segment_id=v_segment for update) is not null then
    raise exception 'F5_SEGMENT_ALREADY_CLOSED';
  end if;

  insert into public.cierres_caja(
    id,comercio_id,legacy_id,caja_sesion_id,cant_ventas,total_ventas,por_forma,cig_total,
    esperado_general,contado_general,diferencia_general,esperado_cigarros,contado_cigarros,
    diferencia_cigarros,egresos_general,egresos_cigarros,costo_ventas,nota,closed_at_device,
    cerrado_por,estado,lease_id,lease_family_id,session_segment_id,created_at_device,stream_key
  ) values (
    v_id,p_comercio_id,nullif(p_payload->>'legacy_id',''),v_root,
    coalesce((p_payload->>'cant_ventas')::integer,0),coalesce((p_payload->>'total_ventas')::numeric,0),
    coalesce(p_payload->'por_forma','{}'::jsonb),coalesce((p_payload->>'cig_total')::numeric,0),
    coalesce((p_payload->>'esperado_general')::numeric,0),coalesce((p_payload->>'contado_general')::numeric,0),
    coalesce((p_payload->>'diferencia_general')::numeric,0),coalesce((p_payload->>'esperado_cigarros')::numeric,0),
    coalesce((p_payload->>'contado_cigarros')::numeric,0),coalesce((p_payload->>'diferencia_cigarros')::numeric,0),
    coalesce((p_payload->>'egresos_general')::numeric,0),coalesce((p_payload->>'egresos_cigarros')::numeric,0),
    coalesce((p_payload->>'costo_ventas')::numeric,0),coalesce(p_payload->>'nota',''),v_occ,
    (select auth.uid()),v_estado,v_lease,v_family,v_segment,v_created,v_dest->>'stream_key'
  );
  for v_x in select jsonb_array_elements_text(coalesce(p_payload->'venta_ids','[]'::jsonb)) loop
    insert into public.cierre_ventas(cierre_id,venta_id,comercio_id) values(v_id,v_x::uuid,p_comercio_id);
  end loop;
  for v_x in select jsonb_array_elements_text(coalesce(p_payload->'pago_ids','[]'::jsonb)) loop
    insert into public.cierre_pagos_fiado(cierre_id,pago_id,comercio_id) values(v_id,v_x::uuid,p_comercio_id);
  end loop;
  for v_x in select jsonb_array_elements_text(coalesce(p_payload->'egreso_ids','[]'::jsonb)) loop
    insert into public.cierre_egresos(cierre_id,egreso_id,comercio_id) values(v_id,v_x::uuid,p_comercio_id);
  end loop;
  update public.caja_sesion_segmentos
     set closed_at_device=v_occ
   where segment_id=v_segment and comercio_id=p_comercio_id;
  if v_estado='registrado' then
    update public.caja_sesiones
       set estado='cerrada',closed_at_device=v_occ,closed_at_server=now(),cerrada_por=(select auth.uid())
     where id=v_root and comercio_id=p_comercio_id;
  else
    insert into public.f5_excepciones_offline(
      comercio_id,entidad,entidad_id,estado,causa,actor_user_id,device_id,lease_id,metadata
    ) values (
      p_comercio_id,'cierre',v_id,'requiere_conciliacion','F5_PROVISIONAL_CLOSE',
      (select auth.uid()),v_device,v_lease,
      jsonb_build_object('root_session_id',v_root,'session_segment_id',v_segment)
    ) on conflict do nothing;
  end if;
  perform private._f5_registrar_aplicada_sin_reconocer(
    p_comercio_id,'cierre',v_id,v_device,v_lease,p_operation_id,
    'cerrar_sesion_caja_v4',jsonb_build_object(
      'root_session_id',v_root,'session_segment_id',v_segment
    )
  );
  v_result:=jsonb_build_object(
    'cierre_id',v_id,'sesion_id',v_root,'session_segment_id',v_segment,'estado',v_estado
  );
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end;
$function$;

-- Compatibility preflight for operations created by clients without a lease
-- envelope. The public signatures stay unchanged and delegate those payloads
-- to the previous private implementations.
do $f5_rpc_compat_preflight$
begin
  if to_regprocedure('private._registrar_venta_v4(text,uuid,jsonb)') is null
     or to_regprocedure('private._registrar_pago_fiado_v4(text,uuid,jsonb)') is null
     or to_regprocedure('private._registrar_egreso_v4(text,uuid,jsonb)') is null
     or to_regprocedure('private._cerrar_sesion_caja_v4(text,uuid,jsonb)') is null then
    raise exception 'F5_LEGACY_RPC_TARGET_MISSING'
      using hint='Do not replace the public RPC until all four legacy private targets are restored.';
  end if;
end
$f5_rpc_compat_preflight$;

create or replace function public.registrar_venta_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_payload ? 'lease_id' then
    return private._f5_registrar_venta_offline(p_operation_id,p_comercio_id,p_payload);
  end if;
  return private._registrar_venta_v4(p_operation_id,p_comercio_id,p_payload);
end;
$function$;

create or replace function public.registrar_pago_fiado_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_payload ? 'lease_id' then
    return private._f5_registrar_pago_fiado_offline(p_operation_id,p_comercio_id,p_payload);
  end if;
  return private._registrar_pago_fiado_v4(p_operation_id,p_comercio_id,p_payload);
end;
$function$;

create or replace function public.registrar_egreso_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_payload ? 'lease_id' then
    return private._f5_registrar_egreso_offline(p_operation_id,p_comercio_id,p_payload);
  end if;
  return private._registrar_egreso_v4(p_operation_id,p_comercio_id,p_payload);
end;
$function$;

create or replace function public.cerrar_sesion_caja_v4(
  p_operation_id text,p_comercio_id uuid,p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if p_payload ? 'lease_id' then
    return private._f5_cerrar_sesion_offline(p_operation_id,p_comercio_id,p_payload);
  end if;
  return private._cerrar_sesion_caja_v4(p_operation_id,p_comercio_id,p_payload);
end;
$function$;

revoke all on function private._f5_validar_destino_stream(uuid,jsonb,timestamptz) from public,anon,authenticated,service_role;
revoke all on function private._f5_registrar_aplicada_sin_reconocer(uuid,text,uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_registrar_venta_offline(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_aplicar_credito_fiado_offline(uuid,uuid,text,uuid,numeric) from public,anon,authenticated,service_role;
revoke all on function private._f5_registrar_pago_fiado_offline(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_registrar_egreso_offline(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_cerrar_sesion_offline(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private._f5_registrar_venta_offline(text,uuid,jsonb) to authenticated;
grant execute on function private._f5_registrar_pago_fiado_offline(text,uuid,jsonb) to authenticated;
grant execute on function private._f5_registrar_egreso_offline(text,uuid,jsonb) to authenticated;
grant execute on function private._f5_cerrar_sesion_offline(text,uuid,jsonb) to authenticated;

-- CREATE OR REPLACE conserva privilegios preexistentes. Repetimos el cierre
-- explícito para que una instalación limpia no herede EXECUTE desde PUBLIC.
revoke all on function public.registrar_venta_v4(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.registrar_pago_fiado_v4(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.registrar_egreso_v4(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.cerrar_sesion_caja_v4(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.registrar_venta_v4(text,uuid,jsonb) to authenticated;
grant execute on function public.registrar_pago_fiado_v4(text,uuid,jsonb) to authenticated;
grant execute on function public.registrar_egreso_v4(text,uuid,jsonb) to authenticated;
grant execute on function public.cerrar_sesion_caja_v4(text,uuid,jsonb) to authenticated;
