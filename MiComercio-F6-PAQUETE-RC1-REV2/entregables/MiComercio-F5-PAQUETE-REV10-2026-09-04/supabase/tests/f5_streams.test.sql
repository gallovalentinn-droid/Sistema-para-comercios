begin;

do $test$
begin
  if current_setting('server_version_num')::integer<150000 then
    raise exception 'F5_TEST_REQUIERE_POSTGRES_15';
  end if;
  if to_regclass('public.caja_sesion_segmentos') is null
     or to_regclass('public.f5_excepciones_offline') is null then
    raise exception 'F5_TEST_STREAM_STORAGE_AUSENTE';
  end if;
  if to_regprocedure('private.f5_stream_key(uuid,uuid,uuid,uuid,uuid,uuid)') is null
     or to_regprocedure('public.abrir_sesion_caja_v4(text,uuid,jsonb)') is null then
    raise exception 'F5_TEST_STREAM_RPC_AUSENTE';
  end if;
  if exists (
    select 1
    from unnest(array[
      'public.registrar_venta_v4(text,uuid,jsonb)',
      'public.registrar_pago_fiado_v4(text,uuid,jsonb)',
      'public.registrar_egreso_v4(text,uuid,jsonb)',
      'public.cerrar_sesion_caja_v4(text,uuid,jsonb)'
    ]) firma
    where has_function_privilege('public',firma,'EXECUTE')
       or has_function_privilege('anon',firma,'EXECUTE')
       or not has_function_privilege('authenticated',firma,'EXECUTE')
  ) then
    raise exception 'F5_TEST_STREAM_RPC_GRANTS_INCORRECTOS';
  end if;
end
$test$;

do $fixture$
declare
  v_comercio uuid;
  v_owner uuid;
  v_caja uuid := gen_random_uuid();
  v_remote_device uuid := gen_random_uuid();
  v_offline_device uuid := gen_random_uuid();
  v_remote_session uuid := gen_random_uuid();
  v_lease uuid := gen_random_uuid();
  v_family uuid := gen_random_uuid();
  v_now timestamptz := clock_timestamp();
begin
  select comercio_id,user_id into v_comercio,v_owner
  from public.comercio_miembros
  where activo and rol='duenio'
  order by created_at limit 1;
  insert into public.cajas(id,comercio_id,codigo,nombre)
  values(v_caja,v_comercio,'F5STR'||substr(v_caja::text,1,6),'F5 stream transactional fixture');
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
  values
    (v_remote_device,v_comercio,v_owner,v_caja,'F5 stream remote fixture'),
    (v_offline_device,v_comercio,v_owner,v_caja,'F5 stream offline fixture');
  insert into public.caja_sesiones(
    id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date
  ) values (
    v_remote_session,v_comercio,v_caja,v_remote_device,v_owner,v_now,
    private.business_date(v_comercio,v_now)
  );
  insert into public.autoridad_leases(
    lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
    operation_types,permission_version,contract_version,ttl_seconds,
    issued_at,valid_until,aceptacion_hasta
  )
  select v_lease,v_family,v_comercio,v_owner,v_offline_device,'duenio',
    (select jsonb_object_agg(p,true) from unnest(private.f5_catalogo_permisos()) p),
    array[
      'abrir_sesion_caja_v4','registrar_venta_v4','registrar_pago_fiado_v4',
      'registrar_egreso_v4','cerrar_sesion_caja_v4'
    ]::text[],cm.permission_version,1,604800,
    v_now,v_now+make_interval(secs=>604800),v_now+make_interval(secs=>3196800)
  from public.comercio_miembros cm
  where cm.comercio_id=v_comercio and cm.user_id=v_owner;
end
$fixture$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_dispositivos where nombre='F5 stream offline fixture'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select user_id::text from public.comercio_dispositivos where nombre='F5 stream offline fixture'),
    'role','authenticated'
  )::text,
  true
);

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_caja uuid;
  v_device uuid;
  v_lease public.autoridad_leases%rowtype;
  v_root uuid := gen_random_uuid();
  v_segment_2 uuid := gen_random_uuid();
  v_first jsonb;
  v_repeat jsonb;
  v_second jsonb;
  v_payload jsonb;
  v_egreso uuid := gen_random_uuid();
  v_late_egreso uuid := gen_random_uuid();
  v_cierre_root uuid := gen_random_uuid();
  v_cierre uuid := gen_random_uuid();
  v_stream text;
  v_close_root jsonb;
  v_close jsonb;
begin
  select comercio_id,caja_id,id into v_comercio,v_caja,v_device
  from public.comercio_dispositivos where nombre='F5 stream offline fixture';
  select * into v_lease from public.autoridad_leases where device_id=v_device;

  v_payload:=jsonb_build_object(
    'caja_sesion_id',v_root,'session_segment_id',v_root,'caja_id',v_caja,
    'device_id',v_device,'lease_id',v_lease.lease_id,
    'lease_family_id',v_lease.lease_family_id,'created_at',v_lease.issued_at+interval '1 minute',
    'opened_at_device',v_lease.issued_at+interval '1 minute',
    'fondo_general',100,'fondo_cigarros',0
  );
  v_first:=public.abrir_sesion_caja_v4('f5-open-root-0001',v_comercio,v_payload);
  if v_first->>'estado'<>'requiere_conciliacion'
     or v_first->>'sesion_id'<>v_root::text
     or v_first->>'session_segment_id'<>v_root::text then
    raise exception 'F5_TEST_RAIZ_PROVISIONAL_INVALIDA:%',v_first;
  end if;
  v_repeat:=public.abrir_sesion_caja_v4('f5-open-root-0001',v_comercio,v_payload);
  if v_repeat<>v_first then raise exception 'F5_TEST_APERTURA_NO_IDEMPOTENTE'; end if;

  v_payload:=v_payload
    || jsonb_build_object(
      'caja_sesion_id',v_segment_2,'session_segment_id',v_segment_2,
      'created_at',v_lease.issued_at+interval '2 minutes',
      'opened_at_device',v_lease.issued_at+interval '2 minutes'
    );
  v_second:=public.abrir_sesion_caja_v4('f5-open-segment-002',v_comercio,v_payload);
  if v_second->>'sesion_id'<>v_root::text
     or v_second->>'session_segment_id'<>v_segment_2::text then
    raise exception 'F5_TEST_SEGMENTO_NO_REUTILIZO_RAIZ:%',v_second;
  end if;
  if (select count(*) from public.caja_sesiones
      where comercio_id=v_comercio and caja_id=v_caja and device_id=v_device)<>1 then
    raise exception 'F5_TEST_CREO_MAS_DE_UNA_RAIZ_POR_DEVICE';
  end if;
  if (select count(*) from public.caja_sesion_segmentos where root_session_id=v_root)<>2 then
    raise exception 'F5_TEST_SEGMENTOS_INCOMPLETOS';
  end if;
  if not exists (
    select 1 from public.f5_excepciones_offline
    where comercio_id=v_comercio and entidad='sesion' and entidad_id=v_root
      and estado='requiere_conciliacion'
  ) then raise exception 'F5_TEST_ALERTA_CONCILIACION_AUSENTE'; end if;

  v_stream:=v_second->>'stream_key';
  v_close_root:=public.cerrar_sesion_caja_v4(
    'f5-close-root-0001',v_comercio,
    jsonb_build_object(
      'id',v_cierre_root,'caja_sesion_id',v_root,'session_segment_id',v_root,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '2 minutes 30 seconds',
      'closed_at_device',v_lease.issued_at+interval '2 minutes 30 seconds',
      'cant_ventas',0,'total_ventas',0,'por_forma','{}'::jsonb,'cig_total',0,
      'esperado_general',100,'contado_general',100,'diferencia_general',0,
      'esperado_cigarros',0,'contado_cigarros',0,'diferencia_cigarros',0,
      'egresos_general',0,'egresos_cigarros',0,'costo_ventas',0,'nota','',
      'venta_ids','[]'::jsonb,'pago_ids','[]'::jsonb,'egreso_ids','[]'::jsonb
    )
  );
  if v_close_root->>'estado'<>'requiere_conciliacion' then
    raise exception 'F5_TEST_CIERRE_RAIZ_INVALIDO:%',v_close_root;
  end if;

  perform public.registrar_egreso_v4(
    'f5-egreso-stream-01',v_comercio,
    jsonb_build_object(
      'id',v_egreso,'caja_sesion_id',v_root,'session_segment_id',v_segment_2,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '3 minutes',
      'occurred_at_device',v_lease.issued_at+interval '3 minutes',
      'monto',25,'forma','efectivo','caja_fisica','general',
      'motivo','Prueba F5','nota',''
    )
  );
  if not exists (
    select 1 from public.egresos e
    where e.id=v_egreso and e.lease_id=v_lease.lease_id
      and e.lease_family_id=v_lease.lease_family_id
      and e.session_segment_id=v_segment_2 and e.stream_key=v_stream
  ) then raise exception 'F5_TEST_EGRESO_NO_CONSERVA_CORRIENTE'; end if;

  v_close:=public.cerrar_sesion_caja_v4(
    'f5-close-stream-01',v_comercio,
    jsonb_build_object(
      'id',v_cierre,'caja_sesion_id',v_root,'session_segment_id',v_segment_2,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '4 minutes',
      'closed_at_device',v_lease.issued_at+interval '4 minutes',
      'cant_ventas',0,'total_ventas',0,'por_forma','{}'::jsonb,'cig_total',0,
      'esperado_general',75,'contado_general',75,'diferencia_general',0,
      'esperado_cigarros',0,'contado_cigarros',0,'diferencia_cigarros',0,
      'egresos_general',25,'egresos_cigarros',0,'costo_ventas',0,'nota','',
      'venta_ids','[]'::jsonb,'pago_ids','[]'::jsonb,'egreso_ids',jsonb_build_array(v_egreso)
    )
  );
  if v_close->>'estado'<>'requiere_conciliacion'
     or not exists (
       select 1 from public.cierres_caja c
       where c.id=v_cierre and c.estado='requiere_conciliacion'
         and c.session_segment_id=v_segment_2 and c.lease_id=v_lease.lease_id
     ) then raise exception 'F5_TEST_CIERRE_CONCILIABLE_INVALIDO:%',v_close; end if;
  if not exists (
    select 1 from public.caja_sesion_segmentos
    where segment_id=v_segment_2 and closed_at_device is not null
  ) then raise exception 'F5_TEST_SEGMENTO_NO_CERRADO'; end if;
  if (select count(*) from public.cierres_caja where caja_sesion_id=v_root)<>2 then
    raise exception 'F5_TEST_DOS_TURNOS_OFFLINE_NO_GENERARON_DOS_CIERRES';
  end if;

  perform public.registrar_egreso_v4(
    'f5-egreso-late-segment-02',v_comercio,
    jsonb_build_object(
      'id',v_late_egreso,'caja_sesion_id',v_root,'session_segment_id',v_segment_2,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '3 minutes 30 seconds',
      'occurred_at_device',v_lease.issued_at+interval '3 minutes 30 seconds',
      'monto',5,'forma','efectivo','caja_fisica','general',
      'motivo','Llegada tardía del segundo segmento','nota',''
    )
  );
  if not exists (
    select 1 from public.cierre_ajustes
    where operacion_tipo='egreso' and operacion_id=v_late_egreso and cierre_id=v_cierre
  ) then raise exception 'F5_TEST_LLEGADA_TARDIA_NO_RESPETO_SEGMENTO'; end if;
end
$test$;

reset role;

do $fixture$
declare
  v_comercio uuid;
  v_owner uuid;
  v_caja uuid;
  v_now timestamptz:=clock_timestamp();
begin
  select comercio_id,user_id,caja_id into strict v_comercio,v_owner,v_caja
  from public.comercio_dispositivos where nombre='F5 stream offline fixture';
  for i in 2..3 loop
    insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
    values(
      ('f5000000-0000-4000-8000-00000000010'||i)::uuid,
      v_comercio,v_owner,v_caja,'F5 stream extra device '||i
    );
    insert into public.autoridad_leases(
      lease_id,lease_family_id,comercio_id,user_id,device_id,rol,permisos,
      operation_types,permission_version,contract_version,ttl_seconds,
      issued_at,valid_until,aceptacion_hasta
    ) select
      ('f5000000-0000-4000-8000-00000000020'||i)::uuid,
      ('f5000000-0000-4000-8000-00000000030'||i)::uuid,
      v_comercio,v_owner,('f5000000-0000-4000-8000-00000000010'||i)::uuid,
      'duenio',(select jsonb_object_agg(p,true) from unnest(private.f5_catalogo_permisos()) p),
      array['abrir_sesion_caja_v4'],cm.permission_version,1,604800,
      v_now,v_now+make_interval(secs=>604800),v_now+make_interval(secs=>3196800)
    from public.comercio_miembros cm
    where cm.comercio_id=v_comercio and cm.user_id=v_owner;
  end loop;
end
$fixture$;

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_caja uuid;
  v_device uuid;
  v_lease public.autoridad_leases%rowtype;
  v_root uuid;
  v_result jsonb;
begin
  for i in 2..3 loop
    select comercio_id,caja_id,id into strict v_comercio,v_caja,v_device
    from public.comercio_dispositivos where nombre='F5 stream extra device '||i;
    select * into strict v_lease from public.autoridad_leases where device_id=v_device;
    v_root:=('f5000000-0000-4000-8000-00000000040'||i)::uuid;
    v_result:=public.abrir_sesion_caja_v4(
      'f5-open-root-extra-00'||i,v_comercio,
      jsonb_build_object(
        'caja_sesion_id',v_root,'session_segment_id',v_root,'caja_id',v_caja,
        'device_id',v_device,'lease_id',v_lease.lease_id,
        'lease_family_id',v_lease.lease_family_id,'created_at',v_lease.issued_at+interval '1 minute',
        'opened_at_device',v_lease.issued_at+interval '1 minute','fondo_general',0,'fondo_cigarros',0
      )
    );
    if v_result->>'estado'<>'requiere_conciliacion' then
      raise exception 'F5_TEST_RAIZ_EXTRA_BLOQUEADA:%',v_result;
    end if;
  end loop;
  if (select count(*) from public.caja_sesiones
      where comercio_id=v_comercio and caja_id=v_caja and provisional)<>3 then
    raise exception 'F5_TEST_TRES_RAICES_NO_PERSISTIERON';
  end if;
  if (select count(*) from public.f5_excepciones_offline
      where comercio_id=v_comercio and entidad='sesion' and estado='requiere_conciliacion')<3 then
    raise exception 'F5_TEST_ALERTAS_TRES_RAICES_INCOMPLETAS';
  end if;
end
$test$;

reset role;

do $test$
declare
  v_comercio uuid;
  v_owner uuid;
  v_caja uuid := gen_random_uuid();
  v_device uuid := gen_random_uuid();
  v_provisional_root uuid := gen_random_uuid();
  v_segment_1 uuid := gen_random_uuid();
  v_segment_2 uuid := gen_random_uuid();
  v_normal_session uuid := gen_random_uuid();
begin
  select comercio_id,user_id into v_comercio,v_owner
  from public.comercio_miembros
  where activo and rol='duenio'
  order by created_at limit 1;

  insert into public.cajas(id,comercio_id,codigo,nombre)
  values(v_caja,v_comercio,'F5UQ'||substr(v_caja::text,1,7),'F5 close uniqueness fixture');
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
  values(v_device,v_comercio,v_owner,v_caja,'F5 close uniqueness fixture');
  insert into public.caja_sesiones(
    id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date,
    estado,provisional
  ) values
    (v_provisional_root,v_comercio,v_caja,v_device,v_owner,now()-interval '2 hours',
     private.business_date(v_comercio,now()),'requiere_conciliacion',true),
    (v_normal_session,v_comercio,v_caja,v_device,v_owner,now()-interval '4 hours',
     private.business_date(v_comercio,now()),'cerrada',false);
  insert into public.caja_sesion_segmentos(
    segment_id,comercio_id,root_session_id,opened_at_device,closed_at_device
  ) values
    (v_segment_1,v_comercio,v_provisional_root,now()-interval '2 hours',now()-interval '90 minutes'),
    (v_segment_2,v_comercio,v_provisional_root,now()-interval '1 hour',now()-interval '30 minutes');

  insert into public.cierres_caja(
    id,comercio_id,caja_sesion_id,session_segment_id,closed_at_device
  ) values
    (gen_random_uuid(),v_comercio,v_provisional_root,v_segment_1,now()-interval '90 minutes'),
    (gen_random_uuid(),v_comercio,v_provisional_root,v_segment_2,now()-interval '30 minutes');

  insert into public.cierres_caja(id,comercio_id,caja_sesion_id,closed_at_device)
  values(gen_random_uuid(),v_comercio,v_normal_session,now()-interval '10 minutes');
  begin
    insert into public.cierres_caja(id,comercio_id,caja_sesion_id,closed_at_device)
    values(gen_random_uuid(),v_comercio,v_normal_session,now()-interval '5 minutes');
    raise exception 'F5_TEST_DOBLE_CIERRE_SESION_NORMAL_PERMITIDO';
  exception when unique_violation then
    null;
  end;
end
$test$;

rollback;
