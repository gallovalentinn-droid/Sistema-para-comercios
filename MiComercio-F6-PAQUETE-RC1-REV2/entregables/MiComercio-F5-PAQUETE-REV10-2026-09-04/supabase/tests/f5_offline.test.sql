begin;

do $test$
begin
  if to_regclass('public.autoridad_leases') is null
     or to_regclass('public.autoridad_revocaciones') is null then
    raise exception 'F5_TEST_LEASE_STORAGE_AUSENTE';
  end if;
  if to_regprocedure('public.f5_chequear_autoridad(uuid,uuid)') is null
     or to_regprocedure('public.f5_obtener_lease(uuid,uuid,uuid)') is null
     or to_regprocedure('private.f5_validar_operacion_offline(text,uuid,uuid,uuid,timestamptz,text)') is null then
    raise exception 'F5_TEST_LEASE_RPC_AUSENTE';
  end if;
end
$test$;

do $fixture$
declare
  v_comercio uuid;
  v_owner uuid;
  v_caja uuid;
  v_device uuid := gen_random_uuid();
  v_family uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  select cm.comercio_id,cm.user_id,c.id into v_comercio,v_owner,v_caja
  from public.comercio_miembros cm
  join public.cajas c on c.comercio_id=cm.comercio_id and c.activa and c.deleted_at is null
  where cm.activo and cm.rol='duenio'
  order by cm.created_at,c.created_at
  limit 1;
  if v_comercio is null then raise exception 'F5_TEST_LEASE_FIXTURE_AUSENTE'; end if;

  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
  values(v_device,v_comercio,v_owner,v_caja,'F5 lease transactional fixture');
  insert into public.autoridad_leases(
    lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
    operation_types,permission_version,contract_version,ttl_seconds,
    issued_at,valid_until,aceptacion_hasta
  )
  select gen_random_uuid(),v_family,v_comercio,v_owner,v_device,'duenio',
    (select jsonb_object_agg(p,true) from unnest(private.f5_catalogo_permisos()) p),
    array[
      'abrir_sesion_caja_v4','registrar_venta_v4','registrar_pago_fiado_v4',
      'registrar_egreso_v4','cerrar_sesion_caja_v4'
    ]::text[],cm.permission_version,1,604800,
    v_now-make_interval(secs=>86400),v_now+make_interval(secs=>518400),v_now+make_interval(secs=>3110400)
  from public.comercio_miembros cm
  where cm.comercio_id=v_comercio and cm.user_id=v_owner;
end
$fixture$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_dispositivos where nombre='F5 lease transactional fixture'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select user_id::text from public.comercio_dispositivos where nombre='F5 lease transactional fixture'),
    'role','authenticated'
  )::text,
  true
);

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_device uuid;
  v_old public.autoridad_leases%rowtype;
  v_first jsonb;
  v_second jsonb;
  v_permission_replacement jsonb;
  v_before bigint;
  v_after bigint;
begin
  select comercio_id,id into v_comercio,v_device
  from public.comercio_dispositivos
  where nombre='F5 lease transactional fixture';
  select * into v_old from public.autoridad_leases
  where device_id=v_device order by issued_at limit 1;

  select count(*) into v_before from public.autoridad_leases where device_id=v_device;
  perform public.f5_chequear_autoridad(v_comercio,v_device);
  select count(*) into v_after from public.autoridad_leases where device_id=v_device;
  if v_after<>v_before then raise exception 'F5_TEST_CHEQUEO_EMITIO_LEASE'; end if;

  v_first:=public.f5_obtener_lease(v_comercio,v_device,v_old.lease_id);
  if not coalesce((v_first->>'issued')::boolean,false)
     or (v_first->'lease'->>'ttl_seconds')::integer<>604800
     or v_first->'lease'->>'lease_family_id'<>v_old.lease_family_id::text then
    raise exception 'F5_TEST_REEMPLAZO_DIARIO_INVALIDO:%',v_first;
  end if;
  v_second:=public.f5_obtener_lease(
    v_comercio,v_device,(v_first->'lease'->>'lease_id')::uuid
  );
  if coalesce((v_second->>'issued')::boolean,true)
     or v_second->'lease'->>'lease_id'<>v_first->'lease'->>'lease_id' then
    raise exception 'F5_TEST_EMISION_REPETIDA_MISMO_DIA:%',v_second;
  end if;
  select count(*) into v_after from public.autoridad_leases where device_id=v_device;
  if v_after<>v_before+1 then raise exception 'F5_TEST_VOLUMEN_LEASE_INCORRECTO:%',v_after; end if;

  perform public.f5_actualizar_miembro(
    v_comercio,(select auth.uid()),'duenio','{}'::jsonb,true
  );
  v_permission_replacement:=public.f5_obtener_lease(
    v_comercio,v_device,(v_first->'lease'->>'lease_id')::uuid
  );
  if not coalesce((v_permission_replacement->>'issued')::boolean,false)
     or v_permission_replacement->'lease'->>'lease_family_id'<>v_old.lease_family_id::text
     or (v_permission_replacement->'lease'->>'permission_version')::bigint
        <= (v_first->'lease'->>'permission_version')::bigint then
    raise exception 'F5_TEST_CAMBIO_PERMISOS_NO_REEMPLAZO:%',v_permission_replacement;
  end if;

  begin
    insert into public.autoridad_leases(
      lease_family_id,comercio_id,user_id,device_id,rol,permisos,operation_types,
      permission_version,contract_version,ttl_seconds,issued_at,valid_until,aceptacion_hasta
    ) values (
      gen_random_uuid(),v_comercio,(select auth.uid()),v_device,'duenio','{}'::jsonb,
      array['registrar_venta_v4'],1,1,604800,now(),now()+make_interval(secs=>604800),now()+make_interval(secs=>3196800)
    );
    raise exception 'F5_TEST_INSERT_DIRECTO_LEASE_PERMITIDO';
  exception when insufficient_privilege then null;
  end;
end
$test$;

reset role;

do $test$
declare
  v_comercio uuid;
  v_device uuid := gen_random_uuid();
  v_uid uuid;
  v_caja uuid;
  v_issued timestamptz := '2026-03-05 12:00:00 America/New_York'::timestamptz;
  v_lease public.autoridad_leases%rowtype;
begin
  select comercio_id,user_id,caja_id into strict v_comercio,v_uid,v_caja
  from public.comercio_dispositivos where nombre='F5 lease transactional fixture';
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
  values(v_device,v_comercio,v_uid,v_caja,'F5 lease DST fixture');
  insert into public.autoridad_leases(
    lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
    operation_types,permission_version,contract_version,ttl_seconds,
    issued_at,valid_until,aceptacion_hasta
  ) values (
    gen_random_uuid(),gen_random_uuid(),v_comercio,v_uid,v_device,'duenio','{}'::jsonb,
    array['registrar_venta_v4'],1,1,604800,v_issued,
    v_issued+make_interval(secs=>604800),v_issued+make_interval(secs=>3196800)
  ) returning * into v_lease;
  if extract(epoch from v_lease.valid_until-v_lease.issued_at)<>604800
     or extract(epoch from v_lease.aceptacion_hasta-v_lease.valid_until)<>2592000 then
    raise exception 'F5_TEST_LEASE_DST_NO_ES_DURACION_EXACTA';
  end if;

  begin
    truncate table public.autoridad_leases cascade;
    raise exception 'F5_TEST_TRUNCATE_LEASES_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
  begin
    truncate table public.autoridad_revocaciones cascade;
    raise exception 'F5_TEST_TRUNCATE_REVOCACIONES_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
  begin
    truncate table private.f5_autoridad_eventos;
    raise exception 'F5_TEST_TRUNCATE_AUDITORIA_AUTORIDAD_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
end
$test$;

do $test$
declare
  v_comercio uuid;
  v_device uuid;
  v_uid uuid;
  v_old public.autoridad_leases%rowtype;
  v_latest public.autoridad_leases%rowtype;
  v_replacement jsonb;
  v_validation jsonb;
  v_expired_lease uuid := gen_random_uuid();
  v_expired_family uuid := gen_random_uuid();
  v_expired_issued timestamptz := clock_timestamp()-interval '40 days';
begin
  select comercio_id,id,user_id into v_comercio,v_device,v_uid
  from public.comercio_dispositivos where nombre='F5 lease transactional fixture';
  select * into v_latest from public.autoridad_leases
  where device_id=v_device order by issued_at desc limit 1;
  select * into v_old from public.autoridad_leases
  where device_id=v_device order by issued_at,lease_id limit 1;

  v_validation:=private.f5_validar_operacion_offline(
    'registrar_venta_v4',v_old.lease_id,v_comercio,v_device,
    v_old.issued_at+interval '1 hour',v_old.lease_family_id::text
  );
  if not coalesce((v_validation->>'valid')::boolean,false) then
    raise exception 'F5_TEST_LEASE_ANTERIOR_RECHAZADO:%',v_validation;
  end if;
  v_validation:=private.f5_validar_operacion_offline(
    'ajustar_stock_v4',v_old.lease_id,v_comercio,v_device,
    v_old.issued_at+interval '1 hour',v_old.lease_family_id::text
  );
  if v_validation->>'code'<>'F5_OPERATION_NOT_ALLOWED' then
    raise exception 'F5_TEST_TIPO_NO_OFFLINE_ACEPTADO:%',v_validation;
  end if;

  insert into public.autoridad_leases(
    lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
    operation_types,permission_version,contract_version,ttl_seconds,
    issued_at,valid_until,aceptacion_hasta
  ) values (
    v_expired_lease,v_expired_family,v_comercio,v_uid,v_device,'duenio','{}'::jsonb,
    array['registrar_venta_v4'],1,1,604800,v_expired_issued,
    v_expired_issued+make_interval(secs=>604800),v_expired_issued+make_interval(secs=>3196800)
  );
  v_validation:=private.f5_validar_operacion_offline(
    'registrar_venta_v4',v_expired_lease,v_comercio,v_device,
    v_expired_issued+interval '1 hour',v_expired_family::text
  );
  if v_validation->>'estado'<>'pendiente_de_decision'
     or v_validation->>'code'<>'F5_ACCEPTANCE_EXPIRED' then
    raise exception 'F5_TEST_ACEPTACION_30_DIAS_INVALIDA:%',v_validation;
  end if;

  begin
    update public.autoridad_leases set created_at=created_at where lease_id=v_latest.lease_id;
    raise exception 'F5_TEST_UPDATE_LEASE_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
  begin
    delete from public.autoridad_leases where lease_id=v_latest.lease_id;
    raise exception 'F5_TEST_DELETE_LEASE_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;

  insert into public.autoridad_revocaciones(
    lease_family_id,comercio_id,target_user_id,device_id,motivo,dura,revocada_por
  ) values (
    v_latest.lease_family_id,v_comercio,v_uid,v_device,'Prueba transaccional',true,v_uid
  );
  perform set_config('request.jwt.claim.sub',v_uid::text,true);
  perform set_config(
    'request.jwt.claims',jsonb_build_object('sub',v_uid::text,'role','authenticated')::text,true
  );

  v_validation:=private.f5_validar_operacion_offline(
    'registrar_venta_v4',v_latest.lease_id,v_comercio,v_device,
    v_latest.issued_at+interval '1 hour',v_latest.lease_family_id::text
  );
  if v_validation->>'code'<>'F5_HARD_REVOKED' then
    raise exception 'F5_TEST_REVOCACION_DURA_NO_CORTO:%',v_validation;
  end if;

  v_replacement:=private._f5_obtener_lease(v_comercio,v_device,v_latest.lease_id);
  if v_replacement->'lease'->>'lease_family_id'=v_latest.lease_family_id::text then
    raise exception 'F5_TEST_REVOCACION_DURA_REUTILIZO_FAMILIA:%',v_replacement;
  end if;
end
$test$;

rollback;
