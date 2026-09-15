-- F6.3: estado efectivo perezoso y saldo adicional compartido de siete días.

create or replace function private.f6_estado_licencia(
  p_comercio_id uuid,
  p_now timestamptz default statement_timestamp()
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_license public.comercio_licencias%rowtype;
  v_estado text;
  v_puede boolean;
  v_offline_until timestamptz;
begin
  if p_comercio_id is null or p_now is null then raise exception 'F6_LICENSE_INPUT_INVALID'; end if;
  select l.* into v_license from public.comercio_licencias l where l.comercio_id=p_comercio_id;
  if not found then raise exception 'LICENSE_NOT_FOUND'; end if;

  v_estado:=case
    when v_license.estado_administrativo='cancelada' then 'cancelada'
    when v_license.valid_until is not null and p_now>=v_license.valid_until then 'vencida'
    when v_license.estado_administrativo='pausada' then 'pausada'
    when v_license.estado_administrativo='pendiente' then 'pendiente'
    else 'activa'
  end;
  v_puede:=v_estado='activa';
  v_offline_until:=case
    when v_puede then least(
      v_license.valid_until,
      p_now+make_interval(days=>greatest(v_license.offline_grace_days,0))
    )
    else p_now
  end;

  return jsonb_build_object(
    'comercio_id',v_license.comercio_id,
    'plan',v_license.plan,
    'estado_efectivo',v_estado,
    'puede_operar',v_puede,
    'valid_from',v_license.valid_from,
    'valid_until',v_license.valid_until,
    'offline_valid_until',v_offline_until,
    'offline_grace_days',v_license.offline_grace_days,
    'extension_used_seconds',v_license.extension_used_seconds,
    'extension_remaining_seconds',604800-v_license.extension_used_seconds,
    'state_version',v_license.state_version,
    'server_now',p_now,
    'limite_ia_diario',v_license.limite_ia_diario,
    'periodo_hasta',v_license.periodo_hasta
  );
end
$function$;

create or replace function private.licencia_activa(p_comercio_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce((private.f6_estado_licencia(p_comercio_id,statement_timestamp())->>'puede_operar')::boolean,false)
$function$;

create or replace function private._f6_service_cambiar_licencia(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_command text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_license public.comercio_licencias%rowtype;
  v_effective jsonb;
  v_effective_state text;
  v_existing jsonb;
  v_before jsonb;
  v_after jsonb;
  v_motivo text;
  v_requested bigint:=0;
  v_days integer;
  v_now timestamptz:=statement_timestamp();
  v_new_until timestamptz;
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_comercio_id is null or p_idempotency_key is null
     or p_command not in ('pause','reactivate_without_compensation','reactivate_with_compensation','extend','cancel')
     or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'F6_LICENSE_COMMAND_INVALID';
  end if;
  v_motivo:=trim(coalesce(p_payload->>'motivo',''));
  if length(v_motivo) not between 1 and 500 then raise exception 'F6_LICENSE_MOTIVO_REQUIRED'; end if;
  if (p_command='extend' and exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('dias','motivo')))
     or (p_command<>'extend' and exists(select 1 from jsonb_object_keys(p_payload) k where k<>'motivo')) then
    raise exception 'F6_LICENSE_PAYLOAD_INVALID';
  end if;

  select e.despues into v_existing
    from private.f6_licencia_eventos e
   where e.correlation_id=p_idempotency_key;
  if found then return v_existing; end if;

  perform pg_advisory_xact_lock(hashtext('f6-license:'||p_comercio_id::text));
  select l.* into strict v_license
    from public.comercio_licencias l
   where l.comercio_id=p_comercio_id and l.plan='beta'
   for update;

  select e.despues into v_existing
    from private.f6_licencia_eventos e
   where e.correlation_id=p_idempotency_key;
  if found then return v_existing; end if;

  v_effective:=private.f6_estado_licencia(p_comercio_id,v_now);
  v_effective_state:=v_effective->>'estado_efectivo';
  v_before:=to_jsonb(v_license);
  if v_effective_state='cancelada' then raise exception 'F6_LICENSE_CANCELLED'; end if;

  if p_command='pause' then
    if v_effective_state<>'activa' then raise exception 'F6_LICENSE_PAUSE_REQUIRES_ACTIVE'; end if;
    update public.comercio_licencias
       set activo=false,estado_administrativo='pausada',pause_started_at=v_now,
           state_version=state_version+1
     where comercio_id=p_comercio_id;

  elsif p_command='reactivate_without_compensation' then
    if v_effective_state='vencida' then raise exception 'F6_REACTIVAR_REQUIERE_VIGENCIA'; end if;
    if v_license.estado_administrativo<>'pausada' or v_effective_state<>'pausada' then
      raise exception 'F6_LICENSE_REACTIVATE_REQUIRES_PAUSED';
    end if;
    update public.comercio_licencias
       set activo=true,estado_administrativo='activa',pause_started_at=null,
           state_version=state_version+1
     where comercio_id=p_comercio_id;

  elsif p_command='reactivate_with_compensation' then
    if v_license.estado_administrativo<>'pausada' or v_license.pause_started_at is null then
      raise exception 'F6_LICENSE_REACTIVATE_REQUIRES_PAUSED';
    end if;
    v_requested:=ceil(extract(epoch from (v_now-v_license.pause_started_at)))::bigint;
    if v_requested<1 then v_requested:=1; end if;
    if v_license.extension_used_seconds+v_requested>604800 then
      raise exception 'F6_EXTENSION_SUPERA_SALDO:solicitado=%,remanente=%',
        v_requested,604800-v_license.extension_used_seconds;
    end if;
    v_new_until:=greatest(v_license.valid_until,v_now)+make_interval(secs=>v_requested);
    update public.comercio_licencias
       set activo=true,estado_administrativo='activa',pause_started_at=null,
           valid_until=v_new_until,
           extension_used_seconds=extension_used_seconds+v_requested,
           state_version=state_version+1
     where comercio_id=p_comercio_id;

  elsif p_command='extend' then
    if jsonb_typeof(p_payload->'dias')<>'number'
       or (p_payload->>'dias')::numeric<>trunc((p_payload->>'dias')::numeric)
       or (p_payload->>'dias')::integer not between 1 and 7 then
      raise exception 'F6_EXTENSION_DIAS_INVALIDOS';
    end if;
    if v_effective_state='pendiente' then raise exception 'F6_EXTENSION_REQUIERE_VIGENCIA'; end if;
    v_days:=(p_payload->>'dias')::integer;
    v_requested:=v_days::bigint*86400;
    if v_license.extension_used_seconds+v_requested>604800 then
      raise exception 'F6_EXTENSION_SUPERA_SALDO:solicitado=%,remanente=%',
        v_requested,604800-v_license.extension_used_seconds;
    end if;
    v_new_until:=greatest(v_license.valid_until,v_now)+make_interval(secs=>v_requested);
    update public.comercio_licencias
       set activo=case when v_effective_state='vencida' then true else activo end,
           estado_administrativo=case when v_effective_state='vencida' then 'activa' else estado_administrativo end,
           pause_started_at=case when v_effective_state='vencida' then null else pause_started_at end,
           valid_until=v_new_until,
           extension_used_seconds=extension_used_seconds+v_requested,
           state_version=state_version+1
     where comercio_id=p_comercio_id;

  else
    update public.comercio_licencias
       set activo=false,estado_administrativo='cancelada',pause_started_at=null,
           state_version=state_version+1
     where comercio_id=p_comercio_id;
  end if;

  v_after:=private.f6_estado_licencia(p_comercio_id,v_now);
  insert into private.f6_licencia_eventos(
    comercio_id,actor_user_id,accion,motivo,antes,despues,correlation_id
  ) values (
    p_comercio_id,p_actor_user_id,p_command,v_motivo,v_before,v_after,p_idempotency_key
  );
  return v_after;
end
$function$;

create or replace function public.f6_licencia_actual(p_comercio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if not private.es_miembro(p_comercio_id) then raise exception 'COMERCIO_FORBIDDEN'; end if;
  return private.f6_estado_licencia(p_comercio_id,statement_timestamp());
end
$function$;

create or replace function private._obtener_licencia_v4(
  p_comercio_id uuid,
  p_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_state jsonb;
begin
  if not private.es_miembro(p_comercio_id) then raise exception 'COMERCIO_FORBIDDEN'; end if;
  v_state:=private.f6_estado_licencia(p_comercio_id,statement_timestamp());
  if p_device_id is not null then
    update public.comercio_dispositivos set last_seen_at=now()
      where id=p_device_id and comercio_id=p_comercio_id and revoked_at is null;
  end if;
  return jsonb_build_object(
    'activo',(v_state->>'puede_operar')::boolean,
    'puede_operar',(v_state->>'puede_operar')::boolean,
    'estado_efectivo',v_state->>'estado_efectivo',
    'plan',v_state->>'plan',
    'server_now',v_state->'server_now',
    'offline_valid_until',v_state->'offline_valid_until',
    'offline_grace_days',(v_state->>'offline_grace_days')::integer,
    'limite_ia_diario',(v_state->>'limite_ia_diario')::integer,
    'periodo_hasta',v_state->'periodo_hasta',
    'valid_from',v_state->'valid_from',
    'valid_until',v_state->'valid_until',
    'extension_used_seconds',(v_state->>'extension_used_seconds')::bigint,
    'extension_remaining_seconds',(v_state->>'extension_remaining_seconds')::bigint,
    'state_version',(v_state->>'state_version')::bigint
  );
end
$function$;

create or replace function public.obtener_licencia_v4(
  p_comercio_id uuid,
  p_device_id uuid default null
)
returns jsonb
language sql
security invoker
set search_path = ''
as $function$
  select private._obtener_licencia_v4(p_comercio_id,p_device_id)
$function$;

revoke all on function private.f6_estado_licencia(uuid,timestamptz) from public,anon,authenticated,service_role;
revoke all on function private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_licencia_actual(uuid) from public,anon,authenticated,service_role;
revoke all on function private.licencia_activa(uuid) from public,anon,authenticated,service_role;
revoke all on function private._obtener_licencia_v4(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.obtener_licencia_v4(uuid,uuid) from public,anon,authenticated,service_role;

grant execute on function private.licencia_activa(uuid) to authenticated;
grant execute on function private._obtener_licencia_v4(uuid,uuid) to authenticated;
grant execute on function public.obtener_licencia_v4(uuid,uuid) to authenticated,service_role;
grant execute on function public.f6_licencia_actual(uuid) to authenticated;
