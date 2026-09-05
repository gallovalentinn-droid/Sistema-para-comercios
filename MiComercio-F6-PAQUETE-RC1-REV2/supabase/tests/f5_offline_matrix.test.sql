begin;

do $test$
begin
  if to_regprocedure('private._f5_registrar_venta_offline(text,uuid,jsonb)') is null
     or to_regprocedure('private._f5_registrar_pago_fiado_offline(text,uuid,jsonb)') is null then
    raise exception 'F5_TEST_MATRIZ_RPC_OFFLINE_AUSENTE';
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
  v_product uuid := gen_random_uuid();
  v_client uuid := gen_random_uuid();
  v_lease uuid := gen_random_uuid();
  v_family uuid := gen_random_uuid();
  v_issued timestamptz := clock_timestamp()-interval '4 days';
begin
  select comercio_id,user_id into v_comercio,v_owner
  from public.comercio_miembros
  where activo and rol='duenio'
  order by created_at limit 1;
  if v_comercio is null then raise exception 'F5_TEST_MATRIZ_OWNER_AUSENTE'; end if;

  insert into public.cajas(id,comercio_id,codigo,nombre)
  values(v_caja,v_comercio,'F5MAT'||substr(v_caja::text,1,6),'F5 offline matrix fixture');
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
  values
    (v_remote_device,v_comercio,v_owner,v_caja,'F5 matrix remote fixture'),
    (v_offline_device,v_comercio,v_owner,v_caja,'F5 matrix offline fixture');
  insert into public.caja_sesiones(
    id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date
  ) values (
    v_remote_session,v_comercio,v_caja,v_remote_device,v_owner,v_issued,
    private.business_date(v_comercio,v_issued)
  );
  insert into public.productos(id,comercio_id,nombre,rubro,costo,precio,stock_base)
  values(v_product,v_comercio,'Producto F5 matrix','Pruebas',10,20,100);
  insert into public.clientes(id,comercio_id,nombre,saldo_base,alta_at_device)
  values(v_client,v_comercio,'Cliente F5 matrix',0,v_issued);
  insert into public.fiado_cargos(
    comercio_id,cliente_id,origen_tipo,origen_id,monto,fecha_origen_device,
    business_date,vence_fecha,recargable
  ) values (
    v_comercio,v_client,'ajuste',gen_random_uuid(),50,v_issued,
    private.business_date(v_comercio,v_issued),private.business_date(v_comercio,v_issued)+30,true
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
    v_issued,v_issued+make_interval(secs=>604800),v_issued+make_interval(secs=>3196800)
  from public.comercio_miembros cm
  where cm.comercio_id=v_comercio and cm.user_id=v_owner;

  update public.comercio_miembros
     set activo=false,revoked_at=clock_timestamp()
   where comercio_id=v_comercio and user_id=v_owner;
end
$fixture$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_dispositivos where nombre='F5 matrix offline fixture'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select user_id::text from public.comercio_dispositivos where nombre='F5 matrix offline fixture'),
    'role','authenticated'
  )::text,
  true
);

do $test$
declare
  v_comercio uuid;
  v_caja uuid;
  v_device uuid;
  v_product uuid;
  v_client uuid;
  v_lease public.autoridad_leases%rowtype;
  v_root uuid := gen_random_uuid();
  v_sale uuid := gen_random_uuid();
  v_sale_item uuid := gen_random_uuid();
  v_payment uuid := gen_random_uuid();
  v_expense uuid := gen_random_uuid();
  v_close uuid := gen_random_uuid();
  v_open jsonb;
  v_result jsonb;
  v_stream text;
begin
  select comercio_id,caja_id,id into v_comercio,v_caja,v_device
  from public.comercio_dispositivos where nombre='F5 matrix offline fixture';
  select id into v_product from public.productos where nombre='Producto F5 matrix';
  select id into v_client from public.clientes where nombre='Cliente F5 matrix';
  select * into v_lease from public.autoridad_leases where device_id=v_device;

  v_open:=public.abrir_sesion_caja_v4(
    'f5-matrix-open-01',v_comercio,
    jsonb_build_object(
      'caja_sesion_id',v_root,'session_segment_id',v_root,'caja_id',v_caja,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,
      'created_at',v_lease.issued_at+interval '1 minute',
      'opened_at_device',v_lease.issued_at+interval '1 minute',
      'fondo_general',100,'fondo_cigarros',0
    )
  );
  v_stream:=v_open->>'stream_key';
  if v_open->>'estado'<>'requiere_conciliacion' then
    raise exception 'F5_TEST_MATRIZ_APERTURA_NO_DRENO:%',v_open;
  end if;

  v_result:=public.cerrar_sesion_caja_v4(
    'f5-matrix-close-01',v_comercio,
    jsonb_build_object(
      'id',v_close,'caja_sesion_id',v_root,'session_segment_id',v_root,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '5 minutes',
      'closed_at_device',v_lease.issued_at+interval '5 minutes',
      'cant_ventas',0,'total_ventas',0,'por_forma','{}'::jsonb,'cig_total',0,
      'esperado_general',100,'contado_general',100,'diferencia_general',0,
      'esperado_cigarros',0,'contado_cigarros',0,'diferencia_cigarros',0,
      'egresos_general',0,'egresos_cigarros',0,'costo_ventas',0,'nota','',
      'venta_ids','[]'::jsonb,'pago_ids','[]'::jsonb,'egreso_ids','[]'::jsonb
    )
  );
  if v_result->>'estado'<>'requiere_conciliacion' then
    raise exception 'F5_TEST_MATRIZ_CIERRE_NO_DRENO:%',v_result;
  end if;

  v_result:=public.registrar_venta_v4(
    'f5-matrix-sale-01',v_comercio,
    jsonb_build_object(
      'lease_id',v_lease.lease_id,'lease_family_id',v_lease.lease_family_id,
      'device_id',v_device,'caja_sesion_id',v_root,'session_segment_id',v_root,
      'stream_key',v_stream,'created_at',v_lease.issued_at+interval '2 minutes',
      'venta',jsonb_build_object(
        'id',v_sale,'caja_sesion_id',v_root,'device_id',v_device,'ticket_seq',1,
        'cliente_id',v_client,'occurred_at_device',v_lease.issued_at+interval '2 minutes',
        'subtotal',20,'total',20,'forma','fiado','recibido',20,'vuelto',0,
        'monto_fiado',20,'plazo_fiado_dias',30
      ),
      'items',jsonb_build_array(jsonb_build_object(
        'id',v_sale_item,'tipo','producto','producto_id',v_product,
        'nombre_snapshot','Producto F5 matrix','rubro_snapshot','Pruebas',
        'cantidad',1,'precio_unitario',20,'costo_unitario',10,'bruto',20,'neto',20,
        'componentes','[]'::jsonb
      )),
      'pagos',jsonb_build_array(jsonb_build_object('forma','fiado','monto',20))
    )
  );
  if v_result->>'venta_id'<>v_sale::text then
    raise exception 'F5_TEST_MATRIZ_VENTA_NO_DRENO:%',v_result;
  end if;

  v_result:=public.registrar_pago_fiado_v4(
    'f5-matrix-payment-01',v_comercio,
    jsonb_build_object(
      'id',v_payment,'cliente_id',v_client,'caja_sesion_id',v_root,
      'session_segment_id',v_root,'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '3 minutes',
      'occurred_at_device',v_lease.issued_at+interval '3 minutes',
      'monto',5,'forma','efectivo','nota','Pago drenado tarde'
    )
  );
  if v_result->>'pago_id'<>v_payment::text then
    raise exception 'F5_TEST_MATRIZ_PAGO_NO_DRENO:%',v_result;
  end if;

  v_result:=public.registrar_egreso_v4(
    'f5-matrix-expense-01',v_comercio,
    jsonb_build_object(
      'id',v_expense,'caja_sesion_id',v_root,'session_segment_id',v_root,
      'device_id',v_device,'lease_id',v_lease.lease_id,
      'lease_family_id',v_lease.lease_family_id,'stream_key',v_stream,
      'created_at',v_lease.issued_at+interval '4 minutes',
      'occurred_at_device',v_lease.issued_at+interval '4 minutes',
      'monto',7,'forma','efectivo','caja_fisica','general','motivo','Matriz F5','nota',''
    )
  );
  if v_result->>'egreso_id'<>v_expense::text then
    raise exception 'F5_TEST_MATRIZ_EGRESO_NO_DRENO:%',v_result;
  end if;

  if not exists (
    select 1 from public.ventas
    where id=v_sale and caja_sesion_id=v_root and session_segment_id=v_root
      and lease_id=v_lease.lease_id and stream_key=v_stream
  ) then raise exception 'F5_TEST_MATRIZ_VENTA_SIN_CORRIENTE'; end if;
  if not exists (
    select 1 from public.pagos_fiado
    where id=v_payment and caja_sesion_id=v_root and session_segment_id=v_root
      and lease_id=v_lease.lease_id and stream_key=v_stream
  ) then raise exception 'F5_TEST_MATRIZ_PAGO_SIN_CORRIENTE'; end if;
  if not exists (
    select 1 from public.egresos
    where id=v_expense and caja_sesion_id=v_root and session_segment_id=v_root
      and lease_id=v_lease.lease_id and stream_key=v_stream
  ) then raise exception 'F5_TEST_MATRIZ_EGRESO_SIN_CORRIENTE'; end if;
  if (select count(*) from public.cierre_ajustes
      where cierre_id=v_close and operacion_id in (v_sale,v_payment,v_expense))<>3 then
    raise exception 'F5_TEST_MATRIZ_LLEGADAS_TARDIAS_SIN_AJUSTE';
  end if;
  if (select count(*) from public.f5_excepciones_offline
      where comercio_id=v_comercio and entidad='operacion'
        and entidad_id in (v_sale,v_payment,v_expense)
        and estado='aplicada_sin_reconocer')<>3 then
    raise exception 'F5_TEST_MATRIZ_REVOCACION_NO_QUEDO_EN_COLA';
  end if;
end
$test$;

rollback;
