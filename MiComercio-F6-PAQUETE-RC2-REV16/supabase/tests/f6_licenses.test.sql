begin;

do $test$
declare v_missing text[];
begin
  select array_agg(signature order by signature) into v_missing
    from unnest(array[
      'private.f6_estado_licencia(uuid,timestamp with time zone)',
      'private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid)',
      'public.f6_licencia_actual(uuid)'
    ]) as expected(signature)
   where to_regprocedure(signature) is null;
  if coalesce(cardinality(v_missing),0)>0 then
    raise exception 'F6_LICENSE_FUNCTIONS_MISSING:%',array_to_string(v_missing,',');
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('f6000000-0000-4000-8000-000000000300','authenticated','authenticated','f6-license-support@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000301','authenticated','authenticated','f6-license-owner@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into private.f6_soporte_operadores(user_id,nombre,rol)
values ('f6000000-0000-4000-8000-000000000300','Soporte licencia QA','supervisor');

insert into public.comercios(id,nombre,timezone,business_day_cutoff,architecture_version,schema_version)
values ('f6000000-0000-4000-8000-000000000302','Comercio licencia QA','America/Argentina/Buenos_Aires','04:00',4,4);
insert into public.comercio_miembros(comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version)
values ('f6000000-0000-4000-8000-000000000302','f6000000-0000-4000-8000-000000000301','duenio','{}','Dueño licencia',true,1);
insert into public.comercio_licencias(
  comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
  estado_administrativo,valid_from,valid_until,pause_started_at,
  extension_used_seconds,state_version
) values (
  'f6000000-0000-4000-8000-000000000302',true,'beta',30,7,
  'activa',statement_timestamp()-interval '1 day',statement_timestamp()+interval '6 days',
  null,0,1
);

do $test$
declare
  v_comercio constant uuid:='f6000000-0000-4000-8000-000000000302';
  v_before jsonb;
  v_after jsonb;
  v_public jsonb;
  v_until timestamptz;
  v_version bigint;
begin
  select valid_until into v_until from public.comercio_licencias where comercio_id=v_comercio;
  v_before:=private.f6_estado_licencia(v_comercio,v_until-interval '1 microsecond');
  v_after:=private.f6_estado_licencia(v_comercio,v_until);
  if v_before->>'estado_efectivo'<>'activa' or v_before->>'puede_operar'<>'true'
     or v_after->>'estado_efectivo'<>'vencida' or v_after->>'puede_operar'<>'false' then
    raise exception 'F6_LICENSE_EXPIRY_BOUNDARY_INVALID:%:%',v_before,v_after;
  end if;
  if (v_before->>'offline_valid_until')::timestamptz>(v_before->>'valid_until')::timestamptz then
    raise exception 'F6_LICENSE_OFFLINE_EXCEEDS_VALID_UNTIL:%',v_before;
  end if;

  update public.comercio_licencias
     set activo=false,estado_administrativo='pausada',pause_started_at=statement_timestamp(),
         valid_from=statement_timestamp()-interval '8 days',valid_until=statement_timestamp()-interval '1 second',
         state_version=7
   where comercio_id=v_comercio;
  select state_version into v_version from public.comercio_licencias where comercio_id=v_comercio;
  v_after:=private.f6_estado_licencia(v_comercio,statement_timestamp());
  if v_after->>'estado_efectivo'<>'vencida'
     or (select estado_administrativo from public.comercio_licencias where comercio_id=v_comercio)<>'pausada'
     or (select state_version from public.comercio_licencias where comercio_id=v_comercio)<>v_version then
    raise exception 'F6_LICENSE_LAZY_EXPIRY_MUTATED_ROW:%',v_after;
  end if;

  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000301',true);
  v_public:=public.f6_licencia_actual(v_comercio);
  if v_public->>'estado_efectivo'<>'vencida' then
    raise exception 'F6_LICENSE_PUBLIC_STATE_INVALID:%',v_public;
  end if;

  update public.comercio_licencias set estado_administrativo='cancelada',pause_started_at=null where comercio_id=v_comercio;
  if private.f6_estado_licencia(v_comercio,statement_timestamp())->>'estado_efectivo'<>'cancelada' then
    raise exception 'F6_LICENSE_CANCELLED_PRECEDENCE_INVALID';
  end if;
end
$test$;

do $test$
declare
  v_actor constant uuid:='f6000000-0000-4000-8000-000000000300';
  v_comercio constant uuid:='f6000000-0000-4000-8000-000000000302';
  v_result jsonb;
  v_snapshot jsonb;
  v_until timestamptz;
  v_pause_until timestamptz;
begin
  update public.comercio_licencias
     set activo=true,estado_administrativo='activa',
         valid_from=statement_timestamp(),valid_until=statement_timestamp()+make_interval(secs=>604800),
         pause_started_at=null,extension_used_seconds=0,state_version=1
   where comercio_id=v_comercio;

  v_result:=private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'extend','{"dias":5,"motivo":"extensión QA cinco días"}',
    'f6000000-0000-4000-8000-000000000310'
  );
  if v_result->>'extension_used_seconds'<>'432000'
     or v_result->>'extension_remaining_seconds'<>'172800' then
    raise exception 'F6_LICENSE_FIVE_DAY_EXTENSION_INVALID:%',v_result;
  end if;
  select valid_until into v_until from public.comercio_licencias where comercio_id=v_comercio;
  perform private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'extend','{"dias":5,"motivo":"reintento"}',
    'f6000000-0000-4000-8000-000000000310'
  );
  if (select valid_until from public.comercio_licencias where comercio_id=v_comercio)<>v_until
     or (select extension_used_seconds from public.comercio_licencias where comercio_id=v_comercio)<>432000 then
    raise exception 'F6_LICENSE_EXTENSION_RETRY_DUPLICATED';
  end if;

  select to_jsonb(l.*) into v_snapshot from public.comercio_licencias l where comercio_id=v_comercio;
  begin
    perform private._f6_service_cambiar_licencia(
      v_actor,v_comercio,'extend','{"dias":4,"motivo":"debe rechazarse entera"}',
      'f6000000-0000-4000-8000-000000000311'
    );
    raise exception 'F6_LICENSE_OVERFLOW_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_EXTENSION_SUPERA_SALDO%' then raise; end if;
  end;
  if (select to_jsonb(l.*) from public.comercio_licencias l where comercio_id=v_comercio)<>v_snapshot then
    raise exception 'F6_LICENSE_OVERFLOW_PARTIAL_MUTATION';
  end if;

  v_result:=private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'extend','{"dias":2,"motivo":"consume remanente"}',
    'f6000000-0000-4000-8000-000000000312'
  );
  if v_result->>'extension_used_seconds'<>'604800'
     or v_result->>'extension_remaining_seconds'<>'0' then
    raise exception 'F6_LICENSE_FULL_BALANCE_INVALID:%',v_result;
  end if;

  -- Dos ciclos de pausa comparten el mismo saldo: 4 días pasan, otros 4 se rechazan enteros.
  update public.comercio_licencias
     set activo=true,estado_administrativo='activa',valid_from=statement_timestamp(),
         valid_until=statement_timestamp()+interval '12 days',pause_started_at=null,
         extension_used_seconds=0,state_version=20
   where comercio_id=v_comercio;
  perform private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'pause','{"motivo":"primera pausa"}',
    'f6000000-0000-4000-8000-000000000313'
  );
  update public.comercio_licencias set pause_started_at=statement_timestamp()-interval '4 days' where comercio_id=v_comercio;
  v_result:=private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'reactivate_with_compensation','{"motivo":"compensar cuatro días"}',
    'f6000000-0000-4000-8000-000000000314'
  );
  if (v_result->>'extension_used_seconds')::bigint not between 345599 and 345601 then
    raise exception 'F6_LICENSE_FIRST_COMPENSATION_INVALID:%',v_result;
  end if;
  perform private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'pause','{"motivo":"segunda pausa"}',
    'f6000000-0000-4000-8000-000000000315'
  );
  update public.comercio_licencias set pause_started_at=statement_timestamp()-interval '4 days' where comercio_id=v_comercio;
  select to_jsonb(l.*) into v_snapshot from public.comercio_licencias l where comercio_id=v_comercio;
  begin
    perform private._f6_service_cambiar_licencia(
      v_actor,v_comercio,'reactivate_with_compensation','{"motivo":"segunda no entra"}',
      'f6000000-0000-4000-8000-000000000316'
    );
    raise exception 'F6_LICENSE_SECOND_COMPENSATION_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_EXTENSION_SUPERA_SALDO%' then raise; end if;
  end;
  if (select to_jsonb(l.*) from public.comercio_licencias l where comercio_id=v_comercio)<>v_snapshot then
    raise exception 'F6_LICENSE_COMPENSATION_PARTIAL_MUTATION';
  end if;

  -- Reactivación vigente sin compensación no consume saldo ni mueve vencimiento.
  update public.comercio_licencias
     set activo=true,estado_administrativo='activa',valid_from=statement_timestamp(),
         valid_until=statement_timestamp()+interval '6 days',pause_started_at=null,
         extension_used_seconds=0,state_version=40
   where comercio_id=v_comercio;
  perform private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'pause','{"motivo":"pausa sin compensación"}',
    'f6000000-0000-4000-8000-000000000317'
  );
  select valid_until into v_pause_until from public.comercio_licencias where comercio_id=v_comercio;
  v_result:=private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'reactivate_without_compensation','{"motivo":"reactivar sin compensar"}',
    'f6000000-0000-4000-8000-000000000318'
  );
  if v_result->>'extension_used_seconds'<>'0'
     or (select valid_until from public.comercio_licencias where comercio_id=v_comercio)<>v_pause_until then
    raise exception 'F6_LICENSE_REACTIVATE_WITHOUT_COMP_INVALID:%',v_result;
  end if;

  -- Una pausa vencida no admite reactivación simple; extender crea vigencia nueva.
  perform private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'pause','{"motivo":"pausa que vence"}',
    'f6000000-0000-4000-8000-000000000319'
  );
  update public.comercio_licencias
     set valid_from=statement_timestamp()-interval '8 days',
         valid_until=statement_timestamp()-interval '1 second',
         pause_started_at=statement_timestamp()-interval '2 days'
   where comercio_id=v_comercio;
  select to_jsonb(l.*) into v_snapshot from public.comercio_licencias l where comercio_id=v_comercio;
  begin
    perform private._f6_service_cambiar_licencia(
      v_actor,v_comercio,'reactivate_without_compensation','{"motivo":"no debe reactivar"}',
      'f6000000-0000-4000-8000-000000000320'
    );
    raise exception 'F6_LICENSE_EXPIRED_SIMPLE_REACTIVATION_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_REACTIVAR_REQUIERE_VIGENCIA%' then raise; end if;
  end;
  if (select to_jsonb(l.*) from public.comercio_licencias l where comercio_id=v_comercio)<>v_snapshot then
    raise exception 'F6_LICENSE_EXPIRED_REACTIVATION_MUTATED';
  end if;

  v_result:=private._f6_service_cambiar_licencia(
    v_actor,v_comercio,'extend','{"dias":1,"motivo":"nueva vigencia"}',
    'f6000000-0000-4000-8000-000000000321'
  );
  if v_result->>'estado_efectivo'<>'activa'
     or v_result->>'extension_used_seconds'<>'86400'
     or abs(extract(epoch from ((v_result->>'valid_until')::timestamptz-statement_timestamp()))-86400)>2 then
    raise exception 'F6_LICENSE_EXPIRED_EXTENSION_INVALID:%',v_result;
  end if;
end
$test$;

do $test$
begin
  if has_function_privilege('anon','public.f6_licencia_actual(uuid)','EXECUTE')
     or not has_function_privilege('authenticated','public.f6_licencia_actual(uuid)','EXECUTE')
     or has_function_privilege('anon','private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid)','EXECUTE')
     or has_function_privilege('authenticated','private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid)','EXECUTE')
     or has_function_privilege('service_role','private._f6_service_cambiar_licencia(uuid,uuid,text,jsonb,uuid)','EXECUTE') then
    raise exception 'F6_LICENSE_PRIVILEGE_INVALID';
  end if;
end
$test$;

rollback;
