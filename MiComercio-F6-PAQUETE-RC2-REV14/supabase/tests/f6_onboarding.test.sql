begin;

do $test$
declare
  v_missing text[];
begin
  select array_agg(signature order by signature)
    into v_missing
    from unnest(array[
      'public.f6_onboarding_actual(uuid)',
      'public.f6_confirmar_paso(uuid,text,jsonb,uuid)',
      'public.f6_comprobar_onboarding(uuid)'
    ]) as expected(signature)
   where to_regprocedure(signature) is null;
  if coalesce(cardinality(v_missing),0)>0 then
    raise exception 'F6_ONBOARDING_RPC_MISSING:%',array_to_string(v_missing,',');
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('f6000000-0000-4000-8000-000000000200','authenticated','authenticated','f6-onboarding-support@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000201','authenticated','authenticated','f6-onboarding-owner@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000202','authenticated','authenticated','f6-onboarding-other@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into private.f6_soporte_operadores(user_id,nombre,rol)
values ('f6000000-0000-4000-8000-000000000200','Soporte onboarding QA','supervisor');

do $test$
declare
  v_issue jsonb;
  v_consumed jsonb;
  v_comercio uuid;
  v_result jsonb;
  v_version bigint;
  v_ventas_before bigint;
  v_movimientos_before bigint;
  v_cierres_before bigint;
  v_productos_before bigint;
  v_ticket_before bigint;
  v_valid_from timestamptz;
  v_valid_until timestamptz;
begin
  v_issue:=private._f6_service_emitir_invitacion(
    'f6000000-0000-4000-8000-000000000200',
    repeat('a',64),repeat('b',64),repeat('c',64),
    'Comercio onboarding','America/Argentina/Buenos_Aires','04:00'::time,
    'fixture onboarding','f6000000-0000-4000-8000-000000000210'
  );
  v_consumed:=private._f6_service_consumir_invitacion(
    repeat('a',64),'f6000000-0000-4000-8000-000000000201',
    'f6000000-0000-4000-8000-000000000211'
  );
  v_comercio:=(v_consumed->>'comercio_id')::uuid;
  if v_comercio is null then raise exception 'F6_ONBOARDING_FIXTURE_FAILED'; end if;

  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000202',true);
  begin
    perform public.f6_onboarding_actual(v_comercio);
    raise exception 'F6_ONBOARDING_NON_OWNER_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_ONBOARDING_OWNER_REQUIRED%' then raise; end if;
  end;

  perform set_config('request.jwt.claim.sub','f6000000-0000-4000-8000-000000000201',true);
  v_result:=public.f6_onboarding_actual(v_comercio);
  if v_result->>'estado'<>'no_iniciado' or v_result->>'siguiente_paso'<>'datos_comercio' then
    raise exception 'F6_ONBOARDING_INITIAL_STATE_INVALID:%',v_result;
  end if;

  begin
    perform public.f6_confirmar_paso(
      v_comercio,'productos',jsonb_build_object('productos',jsonb_build_array(
        jsonb_build_object('nombre','Fuera de orden','precio',1,'costo',1,'stock_base',1)
      )),'f6000000-0000-4000-8000-000000000212'
    );
    raise exception 'F6_ONBOARDING_OUT_OF_ORDER_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_ONBOARDING_STEP_ORDER%' then raise; end if;
  end;

  v_result:=public.f6_confirmar_paso(
    v_comercio,'datos_comercio',
    '{"nombre":"Kiosco reanudable","timezone":"America/Argentina/Buenos_Aires","business_day_cutoff":"05:00"}'::jsonb,
    'f6000000-0000-4000-8000-000000000213'
  );
  select state_version into v_version from private.f6_onboarding where comercio_id=v_comercio;
  perform public.f6_confirmar_paso(
    v_comercio,'datos_comercio',
    '{"nombre":"Kiosco reanudable","timezone":"America/Argentina/Buenos_Aires","business_day_cutoff":"05:00"}'::jsonb,
    'f6000000-0000-4000-8000-000000000213'
  );
  if (select state_version from private.f6_onboarding where comercio_id=v_comercio)<>v_version then
    raise exception 'F6_ONBOARDING_RETRY_MUTATED_STATE';
  end if;

  perform public.f6_confirmar_paso(
    v_comercio,'caja_inicial',
    '{"codigo":"principal","nombre":"Caja mostrador","fondo_caja":15000}'::jsonb,
    'f6000000-0000-4000-8000-000000000214'
  );
  perform public.f6_confirmar_paso(
    v_comercio,'modulos',
    '{"modulo_fiado":true,"modulo_vencimientos":true,"modulo_cigarros":false,"whatsapp_dueno":"5491100000000"}'::jsonb,
    'f6000000-0000-4000-8000-000000000215'
  );
  perform public.f6_confirmar_paso(
    v_comercio,'productos',
    '{"productos":[{"nombre":"Coca Cola 500 ml","rubro":"Bebidas","precio":1500,"costo":900,"stock_base":10}]}'::jsonb,
    'f6000000-0000-4000-8000-000000000216'
  );
  perform public.f6_confirmar_paso(
    v_comercio,'empleados','{"omitido":true}'::jsonb,
    'f6000000-0000-4000-8000-000000000217'
  );
  perform public.f6_confirmar_paso(
    v_comercio,'clientes','{"omitido":true}'::jsonb,
    'f6000000-0000-4000-8000-000000000218'
  );

  v_result:=public.f6_onboarding_actual(v_comercio);
  if v_result->>'siguiente_paso'<>'comprobacion_final'
     or jsonb_array_length(v_result->'pasos_confirmados')<>6 then
    raise exception 'F6_ONBOARDING_RESUME_STATE_INVALID:%',v_result;
  end if;
  if not exists (select 1 from public.cajas where comercio_id=v_comercio and activa and nombre='Caja mostrador')
     or not exists (select 1 from public.productos where comercio_id=v_comercio and deleted_at is null and nombre='Coca Cola 500 ml') then
    raise exception 'F6_ONBOARDING_REQUIRED_DATA_MISSING';
  end if;

  select count(*),coalesce(max(ticket_seq),0) into v_ventas_before,v_ticket_before
    from public.ventas where comercio_id=v_comercio;
  select count(*) into v_movimientos_before from public.movimientos_stock where comercio_id=v_comercio;
  select count(*) into v_cierres_before from public.cierres_caja where comercio_id=v_comercio;
  select count(*) into v_productos_before from public.productos where comercio_id=v_comercio;

  v_result:=public.f6_comprobar_onboarding(v_comercio);
  if v_result->>'ok'<>'true' or v_result->>'estado'<>'completo' then
    raise exception 'F6_ONBOARDING_CHECK_FAILED:%',v_result;
  end if;
  if (select count(*) from public.ventas where comercio_id=v_comercio)<>v_ventas_before
     or (select coalesce(max(ticket_seq),0) from public.ventas where comercio_id=v_comercio)<>v_ticket_before
     or (select count(*) from public.movimientos_stock where comercio_id=v_comercio)<>v_movimientos_before
     or (select count(*) from public.cierres_caja where comercio_id=v_comercio)<>v_cierres_before
     or (select count(*) from public.productos where comercio_id=v_comercio)<>v_productos_before then
    raise exception 'F6_ONBOARDING_CHECK_HAS_BUSINESS_SIDE_EFFECTS';
  end if;

  select valid_from,valid_until into strict v_valid_from,v_valid_until
    from public.comercio_licencias where comercio_id=v_comercio;
  if v_valid_until-v_valid_from<>make_interval(secs=>604800)
     or not exists (
       select 1 from public.comercio_licencias
        where comercio_id=v_comercio and activo
          and estado_administrativo='activa' and pause_started_at is null
     )
     or (select count(*) from private.f6_licencia_eventos where comercio_id=v_comercio and accion='onboarding_activate')<>1 then
    raise exception 'F6_ONBOARDING_LICENSE_ACTIVATION_INVALID';
  end if;

  perform public.f6_comprobar_onboarding(v_comercio);
  if (select count(*) from private.f6_licencia_eventos where comercio_id=v_comercio and accion='onboarding_activate')<>1
     or (select valid_from from public.comercio_licencias where comercio_id=v_comercio)<>v_valid_from then
    raise exception 'F6_ONBOARDING_CHECK_NOT_IDEMPOTENT';
  end if;
end
$test$;

do $test$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'public.f6_onboarding_actual(uuid)',
    'public.f6_confirmar_paso(uuid,text,jsonb,uuid)',
    'public.f6_comprobar_onboarding(uuid)'
  ] loop
    if has_function_privilege('anon',v_signature,'EXECUTE')
       or not has_function_privilege('authenticated',v_signature,'EXECUTE') then
      raise exception 'F6_ONBOARDING_PRIVILEGE_INVALID:%',v_signature;
    end if;
  end loop;
end
$test$;

rollback;
