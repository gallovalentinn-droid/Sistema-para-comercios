-- F6.4: soporte interno separado, diagnóstico redactado y comandos cerrados.

alter table private.f6_soporte_eventos
  drop constraint if exists f6_soporte_eventos_accion_check;
alter table private.f6_soporte_eventos
  add constraint f6_soporte_eventos_accion_check
  check (accion in (
    'operator_bootstrap','panel_view','command_rejected',
    'invite_resend','invite_regenerate','invite_revoke',
    'license_pause','license_reactivate','license_extend','license_cancel',
    'device_revoke','sync_retry','diagnostic_export','reconciliation_note'
  ));

create unique index if not exists f6_rate_intentos_request_dimension_uq
  on private.f6_rate_intentos(request_id,dimension_tipo);

create or replace function private._f6_bootstrap_support_operator(
  p_user_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user auth.users%rowtype;
  v_operator private.f6_soporte_operadores%rowtype;
  v_name text;
begin
  if p_user_id is null or length(trim(coalesce(p_motivo,''))) not between 1 and 500 then
    raise exception 'F6_SUPPORT_BOOTSTRAP_INPUT_INVALID';
  end if;
  select u.* into v_user from auth.users u
   where u.id=p_user_id and u.deleted_at is null;
  if not found then raise exception 'F6_SUPPORT_AUTH_USER_REQUIRED'; end if;

  perform pg_advisory_xact_lock(hashtext('f6-support-bootstrap:'||p_user_id::text));
  select o.* into v_operator from private.f6_soporte_operadores o where o.user_id=p_user_id;
  if found then
    if not v_operator.activo or v_operator.revoked_at is not null then
      raise exception 'F6_SUPPORT_OPERATOR_REVOKED';
    end if;
    return jsonb_build_object('ok',true,'code','SUPPORT_OPERATOR_EXISTS','user_id',p_user_id);
  end if;

  v_name:=trim(coalesce(nullif(v_user.raw_user_meta_data->>'name',''),nullif(v_user.raw_user_meta_data->>'full_name','')));
  if coalesce(v_name,'')='' then v_name:='Operador '||left(p_user_id::text,8); end if;
  v_name:=left(v_name,120);

  insert into private.f6_soporte_operadores(user_id,nombre,rol)
  values (p_user_id,v_name,'supervisor') returning * into v_operator;
  insert into private.f6_soporte_eventos(
    operador_user_id,comercio_id,accion,motivo,ok,resultado_codigo,
    antes,despues,correlation_id
  ) values (
    p_user_id,null,'operator_bootstrap',trim(p_motivo),true,'SUPPORT_OPERATOR_CREATED',
    '{}'::jsonb,jsonb_build_object('user_id',p_user_id,'rol',v_operator.rol),gen_random_uuid()
  );
  return jsonb_build_object('ok',true,'code','SUPPORT_OPERATOR_CREATED','user_id',p_user_id);
end
$function$;

create or replace function private._f6_rate_limit_preflight(
  p_superficie text,
  p_dimensions jsonb,
  p_operador_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_types text[]:=array[]::text[];
  v_hashes text[]:=array[]::text[];
  v_limits integer[]:=array[]::integer[];
  v_windows integer[]:=array[]::integer[];
  v_operator_hash text;
  v_token text;
  v_ip text;
  v_contact text;
  v_commerce text;
  v_i integer;
  v_count integer;
  v_limited boolean:=false;
  v_retry integer:=0;
  v_candidate integer;
  v_existing boolean;
  v_now timestamptz:=statement_timestamp();
begin
  if p_request_id is null or p_dimensions is null or jsonb_typeof(p_dimensions)<>'object'
     or p_superficie not in (
       'invite_validate','invite_consume','invite_issue','invite_regenerate',
       'license_mutation','support_panel'
     ) then
    raise exception 'F6_RATE_INPUT_INVALID';
  end if;

  select exists(select 1 from private.f6_rate_intentos r where r.request_id=p_request_id)
    into v_existing;
  if v_existing then
    select coalesce(bool_or(r.limitado),false) into v_limited
      from private.f6_rate_intentos r where r.request_id=p_request_id;
    return jsonb_build_object('limited',v_limited,'retry_after',case when v_limited then 1 else 0 end,'replayed',true);
  end if;

  if p_superficie in ('invite_issue','invite_regenerate','license_mutation','support_panel') then
    perform private._f6_assert_support(p_operador_user_id);
    v_operator_hash:=encode(extensions.digest(p_operador_user_id::text,'sha256'),'hex');
  end if;

  if p_superficie in ('invite_validate','invite_consume') then
    if (select count(*) from jsonb_object_keys(p_dimensions))<>2
       or not (p_dimensions ?& array['token_hash','ip_hash']) then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    v_token:=p_dimensions->>'token_hash'; v_ip:=p_dimensions->>'ip_hash';
    if v_token !~ '^[0-9a-f]{64}$' or v_ip !~ '^[0-9a-f]{64}$' then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    v_types:=array['token_ip','token','ip'];
    v_hashes:=array[
      encode(extensions.digest(v_token||':'||v_ip,'sha256'),'hex'),v_token,v_ip
    ];
    v_limits:=array[5,20,50];
    v_windows:=array[900,3600,3600];
  elsif p_superficie='invite_issue' then
    if (select count(*) from jsonb_object_keys(p_dimensions))<>1 or not (p_dimensions ? 'contacto_hash') then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    v_contact:=p_dimensions->>'contacto_hash';
    if v_contact !~ '^[0-9a-f]{64}$' then raise exception 'F6_RATE_DIMENSIONS_INVALID'; end if;
    v_types:=array['operador','contacto']; v_hashes:=array[v_operator_hash,v_contact];
    v_limits:=array[20,5]; v_windows:=array[3600,3600];
  elsif p_superficie='invite_regenerate' then
    if (select count(*) from jsonb_object_keys(p_dimensions))<>1 or not (p_dimensions ? 'invitation_id') then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    begin
      select i.contacto_hash into strict v_contact
        from private.f6_invitaciones i
       where i.id=(p_dimensions->>'invitation_id')::uuid;
    exception when others then
      raise exception 'F6_INVITATION_NOT_AVAILABLE';
    end;
    v_types:=array['operador','contacto']; v_hashes:=array[v_operator_hash,v_contact];
    v_limits:=array[20,5]; v_windows:=array[3600,3600];
  elsif p_superficie='license_mutation' then
    if (select count(*) from jsonb_object_keys(p_dimensions))<>1 or not (p_dimensions ? 'comercio_hash') then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    v_commerce:=p_dimensions->>'comercio_hash';
    if v_commerce !~ '^[0-9a-f]{64}$' then raise exception 'F6_RATE_DIMENSIONS_INVALID'; end if;
    v_types:=array['operador','comercio']; v_hashes:=array[v_operator_hash,v_commerce];
    v_limits:=array[10,5]; v_windows:=array[3600,3600];
  else
    if (select count(*) from jsonb_object_keys(p_dimensions))<>1 or not (p_dimensions ? 'ip_hash') then
      raise exception 'F6_RATE_DIMENSIONS_INVALID';
    end if;
    v_ip:=p_dimensions->>'ip_hash';
    if v_ip !~ '^[0-9a-f]{64}$' then raise exception 'F6_RATE_DIMENSIONS_INVALID'; end if;
    v_types:=array['operador','ip']; v_hashes:=array[v_operator_hash,v_ip];
    v_limits:=array[120,300]; v_windows:=array[300,300];
  end if;

  -- Todos los locks se toman en el mismo orden, aunque cambie el orden del JSON.
  for v_i in
    select s from generate_subscripts(v_types,1) s
     order by p_superficie||':'||v_types[s]||':'||v_hashes[s]
  loop
    perform pg_advisory_xact_lock(hashtext(p_superficie||':'||v_types[v_i]||':'||v_hashes[v_i]));
  end loop;

  for v_i in 1..cardinality(v_types) loop
    select count(*) into v_count
      from private.f6_rate_intentos r
     where r.superficie=p_superficie
       and r.dimension_tipo=v_types[v_i]
       and r.dimension_hash=v_hashes[v_i]
       and r.created_at>v_now-make_interval(secs=>v_windows[v_i]);
    if v_count>=v_limits[v_i] then
      v_limited:=true;
      select greatest(1,ceil(extract(epoch from (
        min(r.created_at)+make_interval(secs=>v_windows[v_i])-v_now
      )))::integer) into v_candidate
        from private.f6_rate_intentos r
       where r.superficie=p_superficie
         and r.dimension_tipo=v_types[v_i]
         and r.dimension_hash=v_hashes[v_i]
         and r.created_at>v_now-make_interval(secs=>v_windows[v_i]);
      v_retry:=greatest(v_retry,coalesce(v_candidate,1));
    end if;
  end loop;

  for v_i in 1..cardinality(v_types) loop
    insert into private.f6_rate_intentos(
      request_id,superficie,dimension_tipo,dimension_hash,operador_user_id,limitado,created_at
    ) values (
      p_request_id,p_superficie,v_types[v_i],v_hashes[v_i],p_operador_user_id,v_limited,v_now
    );
  end loop;
  return jsonb_build_object('limited',v_limited,'retry_after',case when v_limited then v_retry else 0 end,'replayed',false);
end
$function$;

create or replace function private._f6_service_panel(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_build_observado text,
  p_ip_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_comercio jsonb;
  v_onboarding jsonb;
  v_license jsonb;
  v_devices jsonb;
  v_sessions jsonb;
  v_sync jsonb;
  v_invites jsonb;
  v_backup jsonb;
  v_result jsonb;
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_comercio_id is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or length(coalesce(p_build_observado,'')) not between 1 and 80
     or p_build_observado !~ '^[A-Za-z0-9._-]+$' then
    raise exception 'F6_SUPPORT_PANEL_INPUT_INVALID';
  end if;
  select jsonb_build_object(
    'id',c.id,'nombre',c.nombre,'timezone',c.timezone,
    'business_day_cutoff',c.business_day_cutoff,
    'architecture_version',c.architecture_version,'schema_version',c.schema_version
  ) into v_comercio from public.comercios c where c.id=p_comercio_id;
  if v_comercio is null then raise exception 'F6_SUPPORT_COMERCIO_NOT_FOUND'; end if;

  select coalesce(jsonb_build_object(
    'estado',o.estado,'ultimo_paso',o.ultimo_paso,
    'pasos_confirmados',o.pasos_confirmados,'state_version',o.state_version,
    'updated_at',o.updated_at,'completed_at',o.completed_at
  ),jsonb_build_object('estado','no_disponible')) into v_onboarding
    from private.f6_onboarding o where o.comercio_id=p_comercio_id;
  if v_onboarding is null then v_onboarding:=jsonb_build_object('estado','no_disponible'); end if;
  v_license:=private.f6_estado_licencia(p_comercio_id,statement_timestamp());

  select coalesce(jsonb_agg(jsonb_build_object(
    'id',d.id,'nombre',d.nombre,'schema_version',d.schema_version,
    'payload_version',d.payload_version,'last_seen_at',d.last_seen_at,
    'last_sync_at',d.last_sync_at,'revocado',d.revoked_at is not null
  ) order by d.created_at),'[]'::jsonb) into v_devices
    from public.comercio_dispositivos d where d.comercio_id=p_comercio_id;

  select jsonb_build_object(
    'total',count(*),'abiertas',count(*) filter(where s.estado='abierta'),
    'cerradas',count(*) filter(where s.estado='cerrada'),
    'requiere_conciliacion',count(*) filter(where s.estado='requiere_conciliacion'),
    'ultima_apertura',max(s.opened_at_server),'ultimo_cierre',max(s.closed_at_server)
  ) into v_sessions from public.caja_sesiones s where s.comercio_id=p_comercio_id;

  select jsonb_build_object(
    'leases_vigentes',count(*) filter(where l.valid_until>statement_timestamp()),
    'leases_aceptables',count(*) filter(where l.aceptacion_hasta>statement_timestamp()),
    'ultimo_lease',max(l.issued_at),
    'excepciones_pendientes',(select count(*) from public.f5_excepciones_offline e where e.comercio_id=p_comercio_id and e.estado<>'resuelta'),
    'excepciones_por_estado',coalesce((
      select jsonb_object_agg(x.estado,x.cantidad) from (
        select e.estado,count(*) cantidad from public.f5_excepciones_offline e
         where e.comercio_id=p_comercio_id group by e.estado
      ) x
    ),'{}'::jsonb)
  ) into v_sync from public.autoridad_leases l where l.comercio_id=p_comercio_id;

  select jsonb_build_object(
    'total',count(*),'pendientes',count(*) filter(where i.estado='pendiente'),
    'consumidas',count(*) filter(where i.estado='consumida'),
    'vencidas',count(*) filter(where i.estado='vencida'),
    'revocadas',count(*) filter(where i.estado='revocada'),
    'ultima_emision',max(i.issued_at),'proximo_vencimiento',min(i.valid_until) filter(where i.estado='pendiente')
  ) into v_invites
    from private.f6_invitaciones i
    join private.f6_alta_autorizaciones a on a.id=i.authorization_id
   where a.comercio_id=p_comercio_id;

  select coalesce(jsonb_build_object('ultima_fecha',max(b.fecha),'cantidad',count(*)),jsonb_build_object('cantidad',0))
    into v_backup from public.backups_kiosco b where b.comercio_id=p_comercio_id;

  v_result:=jsonb_build_object(
    'ok',true,'code','SUPPORT_PANEL_READY','comercio',v_comercio,
    'onboarding',v_onboarding,'licencia',v_license,
    'build',jsonb_build_object('observado',p_build_observado,'base_aprobada','5.0.0-f5-rc2'),
    'dispositivos',v_devices,'sesiones',v_sessions,'sincronizacion',v_sync,
    'invitaciones',v_invites,'respaldo',v_backup,'server_now',statement_timestamp()
  );
  insert into private.f6_soporte_eventos(
    operador_user_id,comercio_id,accion,motivo,ok,resultado_codigo,antes,despues,correlation_id
  ) values (
    p_actor_user_id,p_comercio_id,'panel_view','Consulta diagnóstica',true,'SUPPORT_PANEL_READY',
    '{}'::jsonb,jsonb_build_object('build_observado',p_build_observado),gen_random_uuid()
  );
  return v_result;
end
$function$;

create or replace function private._f6_service_comando(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_action text,
  p_payload jsonb,
  p_correlation_id uuid,
  p_motivo text,
  p_build_observado text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing private.f6_soporte_eventos%rowtype;
  v_before jsonb:='{}'::jsonb;
  v_after jsonb:='{}'::jsonb;
  v_result jsonb;
  v_command text;
  v_invitation_id uuid;
  v_device_id uuid;
  v_device public.comercio_dispositivos%rowtype;
  v_code text;
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_correlation_id is null or p_payload is null or jsonb_typeof(p_payload)<>'object'
     or length(trim(coalesce(p_motivo,''))) not between 1 and 500
     or length(coalesce(p_build_observado,'')) not between 1 and 80 then
    raise exception 'F6_SUPPORT_COMMAND_INPUT_INVALID';
  end if;
  select e.* into v_existing from private.f6_soporte_eventos e
   where e.correlation_id=p_correlation_id;
  if found then
    return jsonb_build_object('ok',v_existing.ok,'code',v_existing.resultado_codigo,'result',v_existing.despues,'replayed',true);
  end if;

  if p_action not in (
    'invite_resend','invite_regenerate','invite_revoke',
    'license_pause','license_reactivate','license_extend','license_cancel',
    'device_revoke','sync_retry','diagnostic_export','reconciliation_note'
  ) then
    insert into private.f6_soporte_eventos(
      operador_user_id,comercio_id,accion,motivo,ok,resultado_codigo,antes,despues,correlation_id
    ) values (
      p_actor_user_id,p_comercio_id,'command_rejected',trim(p_motivo),false,'F6_SUPPORT_ACTION_UNKNOWN',
      jsonb_build_object('action',left(coalesce(p_action,''),80)),
      jsonb_build_object('payload_keys',coalesce((select jsonb_agg(k order by k) from jsonb_object_keys(p_payload) k),'[]'::jsonb)),
      p_correlation_id
    );
    return jsonb_build_object('ok',false,'code','F6_SUPPORT_ACTION_UNKNOWN','replayed',false);
  end if;
  if p_comercio_id is null and p_action not like 'invite_%' then raise exception 'F6_SUPPORT_COMERCIO_REQUIRED'; end if;
  if p_comercio_id is not null and not exists(select 1 from public.comercios c where c.id=p_comercio_id) then
    raise exception 'F6_SUPPORT_COMERCIO_NOT_FOUND';
  end if;

  begin
    if p_action in ('license_pause','license_cancel') then
      if (select count(*) from jsonb_object_keys(p_payload))<>0 then raise exception 'F6_SUPPORT_PAYLOAD_INVALID'; end if;
      v_before:=private.f6_estado_licencia(p_comercio_id,statement_timestamp());
      v_command:=case p_action when 'license_pause' then 'pause' else 'cancel' end;
      v_after:=private._f6_service_cambiar_licencia(
        p_actor_user_id,p_comercio_id,v_command,jsonb_build_object('motivo',trim(p_motivo)),p_correlation_id
      );
      v_code:=case p_action when 'license_pause' then 'LICENSE_PAUSED' else 'LICENSE_CANCELLED' end;
    elsif p_action='license_extend' then
      if (select count(*) from jsonb_object_keys(p_payload))<>1 or not (p_payload ? 'dias') then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_before:=private.f6_estado_licencia(p_comercio_id,statement_timestamp());
      v_after:=private._f6_service_cambiar_licencia(
        p_actor_user_id,p_comercio_id,'extend',jsonb_build_object('dias',p_payload->'dias','motivo',trim(p_motivo)),p_correlation_id
      );
      v_code:='LICENSE_EXTENDED';
    elsif p_action='license_reactivate' then
      if (select count(*) from jsonb_object_keys(p_payload))<>1
         or not (p_payload ? 'compensar') or jsonb_typeof(p_payload->'compensar')<>'boolean' then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_before:=private.f6_estado_licencia(p_comercio_id,statement_timestamp());
      v_command:=case when (p_payload->>'compensar')::boolean then 'reactivate_with_compensation' else 'reactivate_without_compensation' end;
      v_after:=private._f6_service_cambiar_licencia(
        p_actor_user_id,p_comercio_id,v_command,jsonb_build_object('motivo',trim(p_motivo)),p_correlation_id
      );
      v_code:='LICENSE_REACTIVATED';
    elsif p_action in ('invite_resend','invite_revoke') then
      if (select count(*) from jsonb_object_keys(p_payload))<>1 or not (p_payload ? 'invitation_id') then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_invitation_id:=(p_payload->>'invitation_id')::uuid;
      select jsonb_build_object('invitation_id',i.id,'estado',i.estado,'valid_until',i.valid_until)
        into v_before from private.f6_invitaciones i where i.id=v_invitation_id;
      if v_before is null then raise exception 'F6_INVITATION_NOT_AVAILABLE'; end if;
      if p_action='invite_revoke' then
        v_after:=private._f6_service_revocar_invitacion(p_actor_user_id,v_invitation_id,trim(p_motivo));
        v_code:='INVITATION_REVOKED';
      else
        if v_before->>'estado'<>'pendiente' or (v_before->>'valid_until')::timestamptz<=statement_timestamp() then
          raise exception 'F6_INVITATION_NOT_AVAILABLE';
        end if;
        v_after:=v_before; v_code:='INVITATION_RESEND_READY';
      end if;
    elsif p_action='invite_regenerate' then
      if (select count(*) from jsonb_object_keys(p_payload))<>3
         or not (p_payload ?& array['invitation_id','new_token_hash','ip_hash']) then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_invitation_id:=(p_payload->>'invitation_id')::uuid;
      select jsonb_build_object('invitation_id',i.id,'estado',i.estado,'valid_until',i.valid_until)
        into v_before from private.f6_invitaciones i where i.id=v_invitation_id;
      v_after:=private._f6_service_regenerar_invitacion(
        p_actor_user_id,v_invitation_id,p_payload->>'new_token_hash',p_payload->>'ip_hash',trim(p_motivo),p_correlation_id
      );
      v_code:='INVITATION_REGENERATED';
    elsif p_action='device_revoke' then
      if (select count(*) from jsonb_object_keys(p_payload))<>2
         or not (p_payload ?& array['device_id','ack_perdida'])
         or p_payload->>'ack_perdida'<>'ACEPTO_PERDER_OPERACIONES_OFFLINE' then
        raise exception 'F5_ACK_PERDIDA_REQUERIDO';
      end if;
      v_device_id:=(p_payload->>'device_id')::uuid;
      perform pg_advisory_xact_lock(hashtext('f6-device:'||v_device_id::text));
      select d.* into v_device from public.comercio_dispositivos d
       where d.id=v_device_id and d.comercio_id=p_comercio_id for update;
      if not found then raise exception 'F6_DEVICE_NOT_FOUND'; end if;
      v_before:=jsonb_build_object('device_id',v_device.id,'revoked_at',v_device.revoked_at,'last_sync_at',v_device.last_sync_at);
      insert into public.autoridad_revocaciones(
        lease_family_id,comercio_id,target_user_id,device_id,motivo,dura,revocada_por
      ) select distinct l.lease_family_id,p_comercio_id,l.user_id,v_device_id,left(trim(p_motivo),240),true,p_actor_user_id
          from public.autoridad_leases l
         where l.comercio_id=p_comercio_id and l.device_id=v_device_id
           and not exists(select 1 from public.autoridad_revocaciones r where r.lease_family_id=l.lease_family_id and r.dura);
      update public.comercio_dispositivos
         set revoked_at=coalesce(revoked_at,statement_timestamp()),updated_at=statement_timestamp()
       where id=v_device_id;
      select jsonb_build_object('device_id',d.id,'revoked_at',d.revoked_at,'last_sync_at',d.last_sync_at)
        into v_after from public.comercio_dispositivos d where d.id=v_device_id;
      v_code:='DEVICE_REVOKED';
    elsif p_action='sync_retry' then
      if (select count(*) from jsonb_object_keys(p_payload))<>1 or not (p_payload ? 'device_id') then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_device_id:=(p_payload->>'device_id')::uuid;
      select jsonb_build_object('device_id',d.id,'last_seen_at',d.last_seen_at,'last_sync_at',d.last_sync_at)
        into v_before from public.comercio_dispositivos d
       where d.id=v_device_id and d.comercio_id=p_comercio_id;
      if v_before is null then raise exception 'F6_DEVICE_NOT_FOUND'; end if;
      v_after:=jsonb_build_object('device_id',v_device_id,'solicitud','registrada');
      v_code:='SYNC_RETRY_REQUESTED';
    elsif p_action='diagnostic_export' then
      if (select count(*) from jsonb_object_keys(p_payload))<>0 then raise exception 'F6_SUPPORT_PAYLOAD_INVALID'; end if;
      v_after:=private._f6_service_panel(p_actor_user_id,p_comercio_id,p_build_observado,repeat('0',64));
      v_code:='DIAGNOSTIC_EXPORTED';
    else
      if (select count(*) from jsonb_object_keys(p_payload))<>3
         or not (p_payload ?& array['entidad','entidad_id','nota'])
         or p_payload->>'entidad' not in ('operacion','sesion','cierre')
         or length(trim(coalesce(p_payload->>'nota',''))) not between 1 and 500 then
        raise exception 'F6_SUPPORT_PAYLOAD_INVALID';
      end if;
      v_after:=jsonb_build_object(
        'entidad',p_payload->>'entidad','entidad_id',(p_payload->>'entidad_id')::uuid,
        'nota',trim(p_payload->>'nota'),'resuelve',false
      );
      v_code:='RECONCILIATION_NOTE_ADDED';
    end if;

    insert into private.f6_soporte_eventos(
      operador_user_id,comercio_id,accion,motivo,ok,resultado_codigo,antes,despues,correlation_id
    ) values (p_actor_user_id,p_comercio_id,p_action,trim(p_motivo),true,v_code,v_before,v_after,p_correlation_id);
    return jsonb_build_object('ok',true,'code',v_code,'result',v_after,'replayed',false);
  exception when others then
    v_code:=upper(regexp_replace(split_part(sqlerrm,':',1),'[^A-Za-z0-9_]+','_','g'));
    if length(v_code) not between 2 and 120 then v_code:='F6_SUPPORT_COMMAND_FAILED'; end if;
    insert into private.f6_soporte_eventos(
      operador_user_id,comercio_id,accion,motivo,ok,resultado_codigo,antes,despues,correlation_id
    ) values (
      p_actor_user_id,p_comercio_id,p_action,trim(p_motivo),false,v_code,
      v_before,jsonb_build_object('code',v_code),p_correlation_id
    );
    return jsonb_build_object('ok',false,'code',v_code,'replayed',false);
  end;
end
$function$;

-- Wrappers públicos para PostgREST; sólo service_role puede ejecutarlos.
create or replace function public.f6_service_bootstrap_support_operator(p_user_id uuid,p_motivo text)
returns jsonb language sql security definer set search_path=''
as $function$ select private._f6_bootstrap_support_operator(p_user_id,p_motivo) $function$;

create or replace function public.f6_service_panel(p_actor_user_id uuid,p_comercio_id uuid,p_build_observado text,p_ip_hash text)
returns jsonb language sql security definer set search_path=''
as $function$ select private._f6_service_panel(p_actor_user_id,p_comercio_id,p_build_observado,p_ip_hash) $function$;

create or replace function public.f6_service_comando(
  p_actor_user_id uuid,p_comercio_id uuid,p_action text,p_payload jsonb,
  p_correlation_id uuid,p_motivo text,p_build_observado text
)
returns jsonb language sql security definer set search_path=''
as $function$ select private._f6_service_comando(p_actor_user_id,p_comercio_id,p_action,p_payload,p_correlation_id,p_motivo,p_build_observado) $function$;

create or replace function public.f6_service_rate_limit_preflight(
  p_superficie text,p_dimensions jsonb,p_operador_user_id uuid,p_request_id uuid
)
returns jsonb language sql security definer set search_path=''
as $function$ select private._f6_rate_limit_preflight(p_superficie,p_dimensions,p_operador_user_id,p_request_id) $function$;

revoke all on function private._f6_bootstrap_support_operator(uuid,text) from public,anon,authenticated,service_role;
revoke all on function private._f6_rate_limit_preflight(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f6_service_panel(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function private._f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.f6_service_bootstrap_support_operator(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.f6_service_rate_limit_preflight(text,jsonb,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_service_panel(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text) from public,anon,authenticated,service_role;

grant execute on function public.f6_service_bootstrap_support_operator(uuid,text) to service_role;
grant execute on function public.f6_service_rate_limit_preflight(text,jsonb,uuid,uuid) to service_role;
grant execute on function public.f6_service_panel(uuid,uuid,text,text) to service_role;
grant execute on function public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text) to service_role;
