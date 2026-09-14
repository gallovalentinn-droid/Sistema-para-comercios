begin;

do $test$
begin
  if to_regprocedure('public.f5_service_listar_miembros(uuid,uuid,timestamp with time zone,uuid,integer)') is null then
    raise exception 'F5_TEST_ROSTER_RPC_AUSENTE';
  end if;
  if to_regprocedure('private.f5_ticket_ref(text,bigint,uuid)') is null then
    raise exception 'F5_TEST_TICKET_REF_AUSENTE';
  end if;
  if to_regprocedure('public.f5_schema_meta()') is null then
    raise exception 'F5_TEST_SCHEMA_META_RPC_AUSENTE';
  end if;
end
$test$;

do $test$
declare
  v_comercio uuid;
  v_actor uuid;
  v_uid uuid;
  v_created timestamptz := '2026-01-01T00:00:00Z';
  v_page jsonb;
  v_cursor_ts timestamptz;
  v_cursor_uid uuid;
  v_processed integer := 0;
  v_expected integer;
begin
  select comercio_id,user_id into v_comercio,v_actor
  from public.comercio_miembros
  where activo and rol='duenio'
  order by created_at
  limit 1;
  if v_actor is null then raise exception 'F5_TEST_DUENIO_QA_AUSENTE'; end if;

  for i in 1..33 loop
    v_uid:=gen_random_uuid();
    insert into auth.users(
      id,aud,role,email,encrypted_password,email_confirmed_at,
      raw_app_meta_data,raw_user_meta_data,created_at,updated_at
    ) values (
      v_uid,'authenticated','authenticated',
      'f5-roster-'||v_uid||'@auth.micomercio.invalid','',now(),
      '{"provider":"email","providers":["email"]}'::jsonb,'{}'::jsonb,
      v_created + make_interval(secs=>i),v_created + make_interval(secs=>i)
    );
    insert into public.comercio_miembros(
      comercio_id,user_id,rol,permisos,nombre_mostrado,activo,created_at,updated_at
    ) values (
      v_comercio,v_uid,'empleado','{"ventas_registrar":true}'::jsonb,
      'Roster '||lpad(i::text,2,'0'),true,
      v_created + make_interval(secs=>i),v_created + make_interval(secs=>i)
    );
    insert into private.f5_login_identidades(
      user_id,comercio_id,usuario_normalizado,internal_email,created_at
    ) values (
      v_uid,v_comercio,'roster_'||lpad(i::text,2,'0'),
      'f5-roster-'||v_uid||'@auth.micomercio.invalid',v_created + make_interval(secs=>i)
    );
  end loop;

  select count(*) into v_expected
  from public.comercio_miembros where comercio_id=v_comercio and activo;

  loop
    v_page:=public.f5_service_listar_miembros(v_actor,v_comercio,v_cursor_ts,v_cursor_uid,16);
    if jsonb_array_length(v_page->'items')>16 then
      raise exception 'F5_TEST_ROSTER_LIMITE_IGNORADO';
    end if;
    v_processed:=v_processed+jsonb_array_length(v_page->'items');
    exit when v_page->'next_cursor' is null or v_page->'next_cursor'='null'::jsonb;
    v_cursor_ts=(v_page->'next_cursor'->>'created_at')::timestamptz;
    v_cursor_uid=(v_page->'next_cursor'->>'user_id')::uuid;
  end loop;
  if v_processed<>v_expected or v_processed<33 then
    raise exception 'F5_TEST_ROSTER_TRUNCADO:procesados=%,esperados=%',v_processed,v_expected;
  end if;
end
$test$;

do $test$
declare
  v_id1 uuid := '11111111-1111-4111-8111-111111111111';
  v_id2 uuid := '22222222-2222-4222-8222-222222222222';
  v_ref1 text;
  v_ref2 text;
begin
  v_ref1:=private.f5_ticket_ref('CAJA-01',42,v_id1);
  v_ref2:=private.f5_ticket_ref('CAJA-01',42,v_id2);
  if v_ref1=v_ref2 or v_ref1<>'CAJA-01-000042-11111111' or v_ref2<>'CAJA-01-000042-22222222' then
    raise exception 'F5_TEST_TICKET_REF_NO_UNICO:%,%',v_ref1,v_ref2;
  end if;
  if position('private.f5_ticket_ref' in pg_get_functiondef('private._f5_registrar_venta_offline(text,uuid,jsonb)'::regprocedure))=0 then
    raise exception 'F5_TEST_VENTA_NO_USA_TICKET_REF_CANONICO';
  end if;
end
$test$;

do $test$
declare
  v_meta jsonb;
begin
  if not (select relrowsecurity from pg_class where oid='public.app_schema_meta'::regclass) then
    raise exception 'F5_TEST_SCHEMA_META_SIN_RLS';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='app_schema_meta'
      and policyname='app_schema_meta_authenticated_read'
  ) then
    raise exception 'F5_TEST_SCHEMA_META_SIN_POLICY_MINIMA';
  end if;
  if has_table_privilege('authenticated','public.app_schema_meta','SELECT')
     or has_table_privilege('anon','public.app_schema_meta','SELECT') then
    raise exception 'F5_TEST_SCHEMA_META_TABLA_EXPUESTA';
  end if;
  if not has_column_privilege('authenticated','public.app_schema_meta','schema_version','SELECT')
     or not has_column_privilege('authenticated','public.app_schema_meta','payload_version','SELECT')
     or not has_column_privilege('authenticated','public.app_schema_meta','updated_at','SELECT')
     or has_column_privilege('authenticated','public.app_schema_meta','singleton','SELECT')
     or has_column_privilege('anon','public.app_schema_meta','schema_version','SELECT') then
    raise exception 'F5_TEST_SCHEMA_META_COLUMNAS_INVALIDAS';
  end if;
  if (select prosecdef from pg_proc where oid='public.f5_schema_meta()'::regprocedure) then
    raise exception 'F5_TEST_SCHEMA_META_NO_DEBE_SER_SECURITY_DEFINER';
  end if;
  if not has_function_privilege('authenticated','public.f5_schema_meta()','EXECUTE')
     or has_function_privilege('anon','public.f5_schema_meta()','EXECUTE') then
    raise exception 'F5_TEST_SCHEMA_META_GRANTS_INVALIDOS';
  end if;
  set local role authenticated;
  v_meta:=public.f5_schema_meta();
  reset role;
  if v_meta is null or not (v_meta ? 'schema_version') or not (v_meta ? 'payload_version') then
    raise exception 'F5_TEST_SCHEMA_META_LECTURA_INVALIDA:%',v_meta;
  end if;
end
$test$;

do $test$
begin
  if not exists (
    select 1 from pg_indexes
    where schemaname='public' and tablename='caja_sesion_segmentos'
      and indexname='caja_sesion_segmentos_root_session_idx'
      and indexdef ilike '%(root_session_id)%'
  ) then
    raise exception 'F5_TEST_SEGMENTOS_ROOT_SIN_INDICE';
  end if;
end
$test$;

rollback;
