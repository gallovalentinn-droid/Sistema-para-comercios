begin;

do $test$
begin
  if to_regprocedure('public.f5_obtener_proyeccion(uuid,uuid,text,bigint)') is null then
    raise exception 'F5_TEST_PROJECTION_RPC_AUSENTE';
  end if;
  if to_regprocedure('public.f5_validar_cobertura_proyeccion(uuid,uuid,text,bigint,jsonb,jsonb)') is null then
    raise exception 'F5_TEST_PROJECTION_COVERAGE_RPC_AUSENTE';
  end if;
end
$test$;

do $fixture$
declare
  v_comercio uuid;
  v_user uuid := gen_random_uuid();
  v_device uuid := gen_random_uuid();
begin
  select comercio_id into v_comercio
  from public.comercio_miembros
  where activo and rol='duenio'
  order by created_at limit 1;
  if v_comercio is null then raise exception 'F5_TEST_PROJECTION_COMERCIO_AUSENTE'; end if;

  insert into auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values (
    v_user,'authenticated','authenticated',
    'f5-projection-'||v_user||'@auth.micomercio.invalid','',now(),
    '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,now(),now()
  );
  insert into public.comercio_miembros(
    comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version
  ) values (
    v_comercio,v_user,'empleado','{"ventas_registrar":true}'::jsonb,
    'F5 projection fixture',true,7
  );
  insert into public.comercio_dispositivos(id,comercio_id,user_id,nombre)
  values(v_device,v_comercio,v_user,'F5 projection fixture');
end
$fixture$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_miembros where nombre_mostrado='F5 projection fixture'),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select user_id::text from public.comercio_miembros where nombre_mostrado='F5 projection fixture'),
    'role','authenticated'
  )::text,
  true
);

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_device uuid;
  v_response jsonb;
  v_manifest jsonb;
  v_collections jsonb;
  v_reduced jsonb;
  v_coverage jsonb;
begin
  select cm.comercio_id,cd.id into v_comercio,v_device
  from public.comercio_miembros cm
  join public.comercio_dispositivos cd
    on cd.comercio_id=cm.comercio_id and cd.user_id=cm.user_id
  where cm.user_id=(select auth.uid()) and cm.activo
  limit 1;

  v_response:=public.f5_obtener_proyeccion(v_comercio,v_device,'f5-projection-v1',7);
  v_manifest:=v_response->'manifest';
  v_collections:=v_manifest->'collections';

  if coalesce(v_manifest->>'id','')='' or coalesce(v_manifest->>'hash','')=''
     or (v_manifest->>'permission_version')::bigint<>7 then
    raise exception 'F5_TEST_PROJECTION_MANIFEST_INVALIDO:%',v_manifest;
  end if;
  if not (v_collections ?& array[
    'productos','combos','combo_items','promociones','movimientos_stock',
    'ventas','venta_items','venta_item_componentes','venta_pagos','comercio_configuracion'
  ]) then
    raise exception 'F5_TEST_PROJECTION_POS_INCOMPLETA:%',v_collections;
  end if;
  if (select count(*) from jsonb_object_keys(v_collections))<>10 then
    raise exception 'F5_TEST_PROJECTION_POS_CONTEO_INCORRECTO:%',v_collections;
  end if;
  if v_collections ? 'clientes' or v_collections ? 'pagos_fiado'
     or v_collections ? 'cierres_caja' then
    raise exception 'F5_TEST_PROJECTION_DATOS_NO_AUTORIZADOS:%',v_collections;
  end if;
  if not ((v_collections->'productos'->'fields') ? 'stock_base') then
    raise exception 'F5_TEST_PROJECTION_STOCK_BASE_AUSENTE';
  end if;
  if not ((v_collections->'movimientos_stock'->'fields') ?&
      array['id','producto_id','cantidad','tipo','occurred_at_device'])
     or (v_collections->'movimientos_stock'->'fields') ? 'motivo' then
    raise exception 'F5_TEST_PROJECTION_MOVIMIENTO_NO_MINIMO:%',v_collections->'movimientos_stock';
  end if;

  v_coverage:=public.f5_validar_cobertura_proyeccion(
    v_comercio,v_device,'f5-projection-v1',7,v_manifest,v_collections
  );
  if v_coverage->>'status'<>'PASS'
     or (v_coverage->>'expected')::integer<>(v_coverage->>'declared')::integer
     or (v_coverage->>'expected')::integer<>(v_coverage->>'compared')::integer
     or (v_coverage->>'authorized_omissions')::integer<>12
     or (v_coverage->>'expected')::integer+(v_coverage->>'authorized_omissions')::integer<>22 then
    raise exception 'F5_TEST_PROJECTION_COVERAGE_INVALIDA:%',v_coverage;
  end if;

  v_reduced:=jsonb_set(v_manifest,'{collections}',v_collections-'movimientos_stock');
  begin
    perform public.f5_validar_cobertura_proyeccion(
      v_comercio,v_device,'f5-projection-v1',7,v_reduced,v_reduced->'collections'
    );
    raise exception 'F5_TEST_PROJECTION_REDUCCION_ACEPTADA';
  exception when others then
    if sqlerrm not like 'F34_COVERAGE_FAILURE%' then raise; end if;
  end;

  begin
    perform public.f5_obtener_proyeccion(v_comercio,v_device,'f5-projection-v1',6);
    raise exception 'F5_TEST_PROJECTION_VERSION_ANTIGUA_ACEPTADA';
  exception when others then
    if sqlerrm not like 'F5_PERMISSION_VERSION_STALE%' then raise; end if;
  end;
end
$test$;

reset role;

do $test$
begin
  if not has_function_privilege(
      'authenticated','public.f5_obtener_proyeccion(uuid,uuid,text,bigint)','EXECUTE'
    ) or has_function_privilege(
      'anon','public.f5_obtener_proyeccion(uuid,uuid,text,bigint)','EXECUTE'
    ) then
    raise exception 'F5_TEST_PROJECTION_GRANTS_INVALIDOS';
  end if;
end
$test$;

rollback;
