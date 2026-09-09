begin;

do $test$
begin
  if to_regprocedure('public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)') is null then
    raise exception 'F6_IA_RESERVATION_RPC_MISSING';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='comercio_licencias'
      and column_name='limite_ia_mensual'
  ) then
    raise exception 'F6_IA_MONTHLY_LIMIT_COLUMN_MISSING';
  end if;
  if not exists (
    select 1 from pg_class tabla
    join pg_namespace esquema on esquema.oid=tabla.relnamespace
    where esquema.nspname='public' and tabla.relname='factura_ai_uso_v4'
      and tabla.relrowsecurity
  ) then
    raise exception 'F6_IA_V4_USAGE_TABLE_MISSING_OR_RLS_DISABLED';
  end if;
  if to_regclass('private.f6_ia_lecturas') is not null then
    raise exception 'F6_IA_PARALLEL_USAGE_TABLE_PRESENT';
  end if;
  if has_table_privilege('authenticated','public.factura_ai_uso_v4','SELECT')
     or has_table_privilege('anon','public.factura_ai_uso_v4','SELECT')
     or has_table_privilege('service_role','public.factura_ai_uso_v4','SELECT') then
    raise exception 'F6_IA_V4_USAGE_TABLE_DIRECT_READ_ENABLED';
  end if;
  if not has_function_privilege('service_role','public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('authenticated','public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)','EXECUTE')
     or has_function_privilege('anon','public.f6_service_reservar_lectura_factura(uuid,uuid,uuid)','EXECUTE') then
    raise exception 'F6_IA_RESERVATION_RPC_PRIVILEGES_INVALID';
  end if;
  if to_regprocedure('public.consumir_cupo_factura_ai()') is not null
     and (
       has_function_privilege('authenticated','public.consumir_cupo_factura_ai()','EXECUTE')
       or has_function_privilege('anon','public.consumir_cupo_factura_ai()','EXECUTE')
     ) then
    raise exception 'F6_IA_LEGACY_QUOTA_RPC_STILL_PUBLIC';
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('f6000000-0000-4000-8000-000000000801','authenticated','authenticated','f6-ia-owner@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000802','authenticated','authenticated','f6-ia-employee@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000803','authenticated','authenticated','f6-ia-denied@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

insert into public.comercios(id,nombre,timezone,business_day_cutoff,architecture_version,schema_version)
values ('f6000000-0000-4000-8000-000000000810','Comercio lector IA QA','America/Argentina/Buenos_Aires','04:00',4,4);

insert into public.comercio_miembros(comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version)
values
  ('f6000000-0000-4000-8000-000000000810','f6000000-0000-4000-8000-000000000801','duenio','{}','Dueño IA',true,1),
  ('f6000000-0000-4000-8000-000000000810','f6000000-0000-4000-8000-000000000802','empleado','{"productos_editar":true}','Empleado IA',true,1),
  ('f6000000-0000-4000-8000-000000000810','f6000000-0000-4000-8000-000000000803','empleado','{"productos_editar":false}','Empleado sin productos',true,1);

insert into public.comercio_licencias(
  comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
  estado_administrativo,valid_from,valid_until,pause_started_at,
  extension_used_seconds,state_version
) values (
  'f6000000-0000-4000-8000-000000000810',true,'beta',1000,7,
  'activa',statement_timestamp()-interval '1 day',statement_timestamp()+interval '6 days',
  null,0,1
);

do $test$
declare
  v_comercio constant uuid:='f6000000-0000-4000-8000-000000000810';
  v_owner constant uuid:='f6000000-0000-4000-8000-000000000801';
  v_employee constant uuid:='f6000000-0000-4000-8000-000000000802';
  v_denied constant uuid:='f6000000-0000-4000-8000-000000000803';
  v_request1 constant uuid:='f6000000-0000-4000-8000-000000000821';
  v_result jsonb;
  v_business_date date;
  v_month_start date;
begin
  select private.business_date(v_comercio,statement_timestamp()) into v_business_date;
  v_month_start:=date_trunc('month',v_business_date)::date;

  v_result:=public.f6_service_reservar_lectura_factura(v_owner,v_comercio,v_request1);
  if v_result->>'ok'<>'true' or v_result->>'replayed'<>'false'
     or (v_result->>'usados')::integer<>1 or (v_result->>'restantes')::integer<>99
     or (v_result->>'limite')::integer<>100 then
    raise exception 'F6_IA_FIRST_RESERVATION_INVALID:%',v_result;
  end if;

  v_result:=public.f6_service_reservar_lectura_factura(v_owner,v_comercio,v_request1);
  if v_result->>'ok'<>'true' or v_result->>'replayed'<>'true'
     or (v_result->>'usados')::integer<>1 then
    raise exception 'F6_IA_REPLAY_NOT_IDEMPOTENT:%',v_result;
  end if;

  v_result:=public.f6_service_reservar_lectura_factura(
    v_employee,v_comercio,'f6000000-0000-4000-8000-000000000822'
  );
  if v_result->>'ok'<>'true' or (v_result->>'usados')::integer<>2
     or (v_result->>'restantes')::integer<>98 then
    raise exception 'F6_IA_EMPLOYEE_PERMISSION_INVALID:%',v_result;
  end if;

  insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date)
  select v_comercio,v_owner,gen_random_uuid()::text,
         case when serie<=49 then v_month_start else v_business_date end
    from generate_series(1,98) serie;

  insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date)
  select v_comercio,v_owner,gen_random_uuid()::text,(v_month_start-interval '1 month')::date
    from generate_series(1,5);

  v_result:=public.f6_service_reservar_lectura_factura(
    v_owner,v_comercio,'f6000000-0000-4000-8000-000000000823'
  );
  if v_result->>'ok'<>'false' or v_result->>'code'<>'LIMITE_IA_MENSUAL'
     or (v_result->>'usados')::integer<>100 or (v_result->>'restantes')::integer<>0 then
    raise exception 'F6_IA_MONTHLY_LIMIT_INVALID:%',v_result;
  end if;

  begin
    perform public.f6_service_reservar_lectura_factura(
      v_denied,v_comercio,'f6000000-0000-4000-8000-000000000824'
    );
    raise exception 'F6_IA_DENIED_EMPLOYEE_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_IA_FORBIDDEN%' then raise; end if;
  end;

  update public.comercio_licencias
     set valid_from=statement_timestamp()-interval '8 days',
         valid_until=statement_timestamp()-interval '1 day'
   where comercio_id=v_comercio;
  begin
    perform public.f6_service_reservar_lectura_factura(
      v_owner,v_comercio,'f6000000-0000-4000-8000-000000000825'
    );
    raise exception 'F6_IA_EXPIRED_LICENSE_ACCEPTED';
  exception when others then
    if sqlerrm not like '%F6_IA_LICENSE_INACTIVE%' then raise; end if;
  end;
end
$test$;

rollback;
