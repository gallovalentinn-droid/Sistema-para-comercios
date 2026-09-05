begin;

do $test$
begin
  if to_regclass('private.f5_login_identidades') is null
     or to_regclass('private.f5_login_intentos') is null
     or to_regclass('private.f5_login_comercios') is null then
    raise exception 'F5_TEST_LOGIN_STORAGE_AUSENTE';
  end if;
  if to_regprocedure('public.f5_service_login_preflight(text,text,text,text)') is null
     or to_regprocedure('public.f5_service_login_result(bigint,boolean)') is null
     or to_regprocedure('public.f5_service_login_membresia(uuid,uuid)') is null
     or to_regprocedure('public.f5_service_crear_empleado(uuid,uuid,uuid,text,text,text,jsonb)') is null
     or to_regprocedure('public.f5_service_resolver_empleado(uuid,uuid,text)') is null then
    raise exception 'F5_TEST_LOGIN_RPC_AUSENTE';
  end if;

  if has_table_privilege('anon','private.f5_login_identidades','SELECT')
     or has_table_privilege('authenticated','private.f5_login_identidades','SELECT')
     or has_table_privilege('service_role','private.f5_login_identidades','SELECT') then
    raise exception 'F5_TEST_IDENTIDADES_TIENE_ACCESO_DIRECTO';
  end if;
  if not has_function_privilege(
      'service_role','public.f5_service_login_preflight(text,text,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'anon','public.f5_service_login_preflight(text,text,text,text)','EXECUTE'
    )
    or has_function_privilege(
      'authenticated','public.f5_service_login_preflight(text,text,text,text)','EXECUTE'
    ) then
    raise exception 'F5_TEST_LOGIN_RPC_GRANTS_INCORRECTOS';
  end if;
end
$test$;

set local role service_role;

do $test$
declare
  v_result jsonb;
  v_comercio text := 'ffffffffff';
  v_usuario text := 'usuario-inexistente';
  v_ip_hash text := repeat('a',64);
  v_usuario_hash text := repeat('b',64);
begin
  for i in 1..5 loop
    v_result := public.f5_service_login_preflight(v_comercio,v_usuario,v_ip_hash,v_usuario_hash);
    if coalesce((v_result->>'limited')::boolean,true) then
      raise exception 'F5_TEST_RATE_LIMIT_ANTICIPADO:%', i;
    end if;
    if coalesce((v_result->>'found')::boolean,true) then
      raise exception 'F5_TEST_LOGIN_INEXISTENTE_FUE_ENCONTRADO';
    end if;
  end loop;

  v_result := public.f5_service_login_preflight(v_comercio,v_usuario,v_ip_hash,v_usuario_hash);
  if coalesce((v_result->>'limited')::boolean,false) is not true
     or (v_result->>'retry_after')::integer <> 900 then
    raise exception 'F5_TEST_RATE_LIMIT_NO_BLOQUEO:%', v_result;
  end if;
end
$test$;

do $test$
declare
  v_result jsonb;
  v_comercio text := 'eeeeeeeeee';
  v_usuario text := 'usuario-rotacion-ip';
  v_usuario_hash text := repeat('c',64);
begin
  for i in 1..20 loop
    v_result := public.f5_service_login_preflight(
      v_comercio,v_usuario,lpad(to_hex(i),64,'0'),v_usuario_hash
    );
    if coalesce((v_result->>'limited')::boolean,true) then
      raise exception 'F5_TEST_RATE_LIMIT_USUARIO_ANTICIPADO:%/%',i,v_result;
    end if;
  end loop;
  v_result := public.f5_service_login_preflight(
    v_comercio,v_usuario,repeat('d',64),v_usuario_hash
  );
  if coalesce((v_result->>'limited')::boolean,false) is not true
     or (v_result->>'retry_after')::integer<>3600 then
    raise exception 'F5_TEST_RATE_LIMIT_USUARIO_ROTANDO_IP_NO_BLOQUEO:%',v_result;
  end if;
end
$test$;

do $test$
declare
  v_result jsonb;
  v_comercio text := 'dddddddddd';
  v_usuario text := 'usuario-rotacion-cuenta';
  v_ip_hash text := repeat('e',64);
begin
  for i in 1..50 loop
    v_result := public.f5_service_login_preflight(
      v_comercio,v_usuario,v_ip_hash,lpad(to_hex(1000+i),64,'0')
    );
    if coalesce((v_result->>'limited')::boolean,true) then
      raise exception 'F5_TEST_RATE_LIMIT_IP_ANTICIPADO:%/%',i,v_result;
    end if;
  end loop;
  v_result := public.f5_service_login_preflight(
    v_comercio,v_usuario,v_ip_hash,repeat('f',64)
  );
  if coalesce((v_result->>'limited')::boolean,false) is not true
     or (v_result->>'retry_after')::integer<>3600 then
    raise exception 'F5_TEST_RATE_LIMIT_IP_ROTANDO_USUARIO_NO_BLOQUEO:%',v_result;
  end if;
end
$test$;

reset role;
rollback;
