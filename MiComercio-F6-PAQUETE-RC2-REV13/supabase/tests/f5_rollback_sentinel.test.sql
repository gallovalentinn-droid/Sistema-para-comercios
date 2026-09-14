begin;

do $fixture$
declare
  v_user uuid := gen_random_uuid();
  v_comercio uuid := gen_random_uuid();
  v_blob jsonb;
begin
  insert into auth.users(
    id,aud,role,email,encrypted_password,email_confirmed_at,
    raw_app_meta_data,raw_user_meta_data,created_at,updated_at
  ) values (
    v_user,'authenticated','authenticated',
    'f5-rollback-'||v_user||'@auth.micomercio.invalid','',now(),'{}','{}',now(),now()
  );
  insert into public.comercios(id,nombre) values(v_comercio,'V4_NOMBRE_CANONICO');
  insert into public.comercio_miembros(comercio_id,user_id,rol,permisos,nombre_mostrado,activo)
  values(v_comercio,v_user,'duenio','{}','F5 rollback sentinel',true);
  insert into public.comercio_configuracion(
    comercio_id,fondo_caja,fondo_caja_cigarros,whatsapp_dueno,dias_aviso_vence,
    dias_plazo_fiado,recargo_fiado_pct,modulo_fiado,modulo_vencimientos,
    modulo_cigarros,motivos_egreso_extra,pin_hash,permisos_empleado
  ) values (
    v_comercio,101,202,'V4_WHATSAPP',9,45,13,true,false,true,
    array['V4_MOTIVO'],'V4_PIN_NO_DEBE_RECONSTRUIR','{"caja":false}'
  );
  v_blob:=jsonb_build_object(
    'productos','[]'::jsonb,'clientes','[]'::jsonb,'ventas','[]'::jsonb,
    'movs','[]'::jsonb,'pagos','[]'::jsonb,'cierres','[]'::jsonb,
    'combos','[]'::jsonb,'egresos','[]'::jsonb,'ajustesFiado','[]'::jsonb,
    'promociones','[]'::jsonb,'_tombstones','{}'::jsonb,
    'config',jsonb_build_object(
      'nombre','BLOB_NOMBRE_VIEJO','nroVenta',777,'ultBackup','BLOB_ULT_BACKUP',
      'pinDuenio','BLOB_PIN_DUENIO','pinHash','BLOB_PIN_HASH',
      'permisosEmpleado',jsonb_build_object('caja',false,'resumen',false),
      'fondoCaja',1,'fondoCajaCigarros',2,'whatsappDueno','BLOB_WHATSAPP',
      'diasAvisoVence',1,'diasPlazoFiado',1,'recargoFiadoPct',1,
      'moduloFiado',false,'moduloVencimientos',true,'moduloCigarros',false,
      'motivosEgresoExtra',jsonb_build_array('BLOB_MOTIVO')
    )
  );
  insert into public.datos_kiosco(id,db,revision) values(v_user,v_blob,9);
  insert into public.migraciones_f4(
    comercio_id,estado,f43_version,f43_cutover_at,f43_cutover_by,
    f43_legacy_user_id,f43_legacy_revision,f43_legacy_sha256,f43_rollback_until
  ) values (
    v_comercio,'v4_only','4.3.0-qa3',now(),v_user,v_user,9,
    repeat('a',64),now()+interval '7 days'
  );
  perform set_config('request.jwt.claim.sub',v_user::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
  perform set_config('app.f5_rollback_user_id',v_user::text,true);
end
$fixture$;

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_user uuid := (select auth.uid());
  v_result jsonb;
begin
  select comercio_id into strict v_comercio
  from public.comercio_miembros where user_id=v_user and nombre_mostrado='F5 rollback sentinel';
  v_result:=public.rollback_f43(v_comercio);
  if v_result->>'estado'<>'rollback' or coalesce((v_result->>'idempotent')::boolean,true) then
    raise exception 'F5_TEST_ROLLBACK_REAL_NO_EJECUTADO:%',v_result;
  end if;
end
$test$;

reset role;

do $test$
declare
  v_user uuid := current_setting('app.f5_rollback_user_id')::uuid;
  v_config jsonb;
  v_key_count integer;
begin
  select db->'config' into strict v_config from public.datos_kiosco where id=v_user;
  select count(*) into v_key_count from jsonb_object_keys(v_config);

  if v_config->>'nroVenta'<>'777'
     or v_config->>'ultBackup'<>'BLOB_ULT_BACKUP'
     or v_config->>'pinDuenio'<>'BLOB_PIN_DUENIO'
     or v_config->>'pinHash'<>'BLOB_PIN_HASH'
     or v_config->'permisosEmpleado'<>'{"caja":false,"resumen":false}'::jsonb then
    raise exception 'F5_TEST_ROLLBACK_SENTINELAS_MUTADOS:%',v_config;
  end if;
  if v_config->>'nombre'<>'V4_NOMBRE_CANONICO'
     or (v_config->>'fondoCaja')::numeric<>101
     or (v_config->>'fondoCajaCigarros')::numeric<>202
     or v_config->>'whatsappDueno'<>'V4_WHATSAPP'
     or (v_config->>'diasAvisoVence')::integer<>9
     or (v_config->>'diasPlazoFiado')::integer<>45
     or (v_config->>'recargoFiadoPct')::numeric<>13
     or (v_config->>'moduloFiado')::boolean is not true
     or (v_config->>'moduloVencimientos')::boolean is not false
     or (v_config->>'moduloCigarros')::boolean is not true
     or v_config->'motivosEgresoExtra'<>'["V4_MOTIVO"]'::jsonb then
    raise exception 'F5_TEST_ROLLBACK_CANONICAS_INVALIDAS:%',v_config;
  end if;
  if v_key_count<>16 or v_config->'permisosEmpleado'='{}'::jsonb then
    raise exception 'F5_TEST_ROLLBACK_CONTRATO_10_6_INVALIDO:%',v_config;
  end if;

  -- El conteo de 16 es ciego al reparto: 12+4 y 10+6 dan lo mismo. Lo que hay que
  -- asertar es la PROCEDENCIA de cada clave. El fixture puso valores distintos de
  -- cada lado justamente para poder distinguirlos.
  if v_config->>'nombre'='BLOB_NOMBRE_VIEJO'
     or (v_config->>'fondoCaja')::numeric=1
     or (v_config->>'fondoCajaCigarros')::numeric=2
     or v_config->>'whatsappDueno'='BLOB_WHATSAPP'
     or (v_config->>'diasAvisoVence')::integer=1
     or (v_config->>'diasPlazoFiado')::integer=1
     or (v_config->>'recargoFiadoPct')::numeric=1
     or (v_config->>'moduloFiado')::boolean is false
     or (v_config->>'moduloVencimientos')::boolean is true
     or (v_config->>'moduloCigarros')::boolean is false
     or v_config->'motivosEgresoExtra'='["BLOB_MOTIVO"]'::jsonb then
    raise exception 'F5_TEST_ROLLBACK_CANONICA_VINO_DEL_BLOB:%',v_config;
  end if;
  if v_config->>'nroVenta'='1'
     or v_config->>'pinHash'='V4_PIN_NO_DEBE_RECONSTRUIR'
     or v_config->'permisosEmpleado'='{"caja":false}'::jsonb then
    raise exception 'F5_TEST_ROLLBACK_PRESERVADA_VINO_DE_V4:%',v_config;
  end if;
end
$test$;

rollback;
