begin;

do $test$
declare
  v_catalogo text[];
  v_lock text := 'pg_advisory_xact_lock(hashtext(p_comercio_id::text))';
begin
  if to_regprocedure('public.f5_miembro_actual(uuid)') is null then
    raise exception 'F5_TEST_RPC_MIEMBRO_ACTUAL_AUSENTE';
  end if;
  if to_regprocedure('public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)') is null then
    raise exception 'F5_TEST_RPC_ACTUALIZAR_AUSENTE';
  end if;
  if to_regprocedure('private._f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)') is null then
    raise exception 'F5_TEST_MUTADOR_PRIVADO_AUSENTE';
  end if;
  if to_regclass('private.f5_membresia_eventos') is null then
    raise exception 'F5_TEST_AUDITORIA_AUSENTE';
  end if;

  if exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'comercio_miembros'
      and policyname = 'miembros_write'
  ) then
    raise exception 'F5_TEST_POLICY_WRITE_SIGUE_ACTIVA';
  end if;
  if has_table_privilege('authenticated', 'public.comercio_miembros', 'INSERT')
     or has_table_privilege('authenticated', 'public.comercio_miembros', 'UPDATE')
     or has_table_privilege('authenticated', 'public.comercio_miembros', 'DELETE') then
    raise exception 'F5_TEST_DML_DIRECTO_SIGUE_CONCEDIDO';
  end if;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'comercio_miembros'
      and indexname = 'comercio_miembros_usuario_activo_uq'
  ) then
    raise exception 'F5_TEST_UNICIDAD_ACTIVA_AUSENTE';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'comercio_miembros'
      and column_name = 'permission_version'
      and is_nullable = 'NO'
  ) then
    raise exception 'F5_TEST_VERSION_PERMISOS_AUSENTE';
  end if;

  v_catalogo := private.f5_catalogo_permisos();
  if v_catalogo <> array[
    'ventas_registrar','productos_editar','reposicion_ver','vencimientos_ver',
    'combos_editar','promociones_editar','fiado_operar','caja_operar',
    'movimientos_ver','resumen_ver'
  ]::text[] then
    raise exception 'F5_TEST_CATALOGO_INCORRECTO:%', v_catalogo;
  end if;
  if private.f5_permisos_validos(null)
     or private.f5_permisos_validos('{"permiso_futuro":true}'::jsonb)
     or private.f5_permisos_validos('{"ventas_registrar":"si"}'::jsonb)
     or not private.f5_permisos_validos('{"ventas_registrar":true,"resumen_ver":false}'::jsonb) then
    raise exception 'F5_TEST_VALIDACION_PERMISOS_INCORRECTA';
  end if;

  if position(v_lock in pg_get_functiondef('private._activar_v4_only_f43(uuid,integer)'::regprocedure)) = 0
     or position(v_lock in pg_get_functiondef('private._rollback_f43(uuid)'::regprocedure)) = 0
     or position(v_lock in pg_get_functiondef('private._f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)'::regprocedure)) = 0 then
    raise exception 'F5_TEST_LOCK_NO_SERIALIZA_CON_F43';
  end if;

  if not has_function_privilege(
      'authenticated',
      'public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)',
      'EXECUTE'
    )
    or has_function_privilege(
      'anon',
      'public.f5_actualizar_miembro(uuid,uuid,text,jsonb,boolean)',
      'EXECUTE'
    ) then
    raise exception 'F5_TEST_PRIVILEGIOS_RPC_INCORRECTOS';
  end if;
end
$test$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_miembros where activo and rol = 'duenio' order by created_at limit 1),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', (select user_id::text from public.comercio_miembros where activo and rol = 'duenio' order by created_at limit 1),
    'role', 'authenticated'
  )::text,
  true
);

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_actor uuid := (select auth.uid());
  v_target uuid;
  v_before_version bigint;
  v_after_version bigint;
  v_actual jsonb;
begin
  select comercio_id
    into v_comercio
    from public.comercio_miembros
   where user_id = v_actor and activo
   limit 1;
  if v_comercio is null then
    raise exception 'F5_TEST_DUENIO_QA_AUSENTE';
  end if;

  begin
    update public.comercio_miembros
       set updated_at = updated_at
     where comercio_id = v_comercio and user_id = v_actor;
    raise exception 'F5_TEST_DML_DIRECTO_FUE_PERMITIDO';
  exception
    when insufficient_privilege then null;
  end;

  v_actual := public.f5_miembro_actual(v_comercio);
  if v_actual is null
     or v_actual->>'rol' <> 'duenio'
     or jsonb_array_length(v_actual->'permisos_efectivos') <> 10 then
    raise exception 'F5_TEST_MIEMBRO_ACTUAL_INCORRECTO:%', v_actual;
  end if;

  select user_id, permission_version
    into v_target, v_before_version
    from public.comercio_miembros
   where comercio_id = v_comercio and user_id <> v_actor and activo
   order by created_at
   limit 1;
  if v_target is null then
    raise exception 'F5_TEST_DESTINATARIO_QA_AUSENTE';
  end if;

  begin
    perform public.f5_actualizar_miembro(
      v_comercio,
      v_target,
      'empleado',
      '{"permiso_futuro":true}'::jsonb,
      true
    );
    raise exception 'F5_TEST_PERMISO_DESCONOCIDO_FUE_ACEPTADO';
  exception
    when others then
      if sqlerrm not like 'F5_PERMISOS_INVALIDOS%' then raise; end if;
  end;

  begin
    perform public.f5_actualizar_miembro(v_comercio, v_actor, 'empleado', '{}'::jsonb, false);
    raise exception 'F5_TEST_ULTIMO_DUENIO_FUE_DESACTIVADO';
  exception
    when others then
      if sqlerrm not like 'F5_ULTIMO_DUENIO%' then raise; end if;
  end;

  perform public.f5_actualizar_miembro(
    v_comercio,
    v_target,
    'empleado',
    '{"ventas_registrar":true,"resumen_ver":true}'::jsonb,
    true
  );
  select permission_version
    into v_after_version
    from public.comercio_miembros
   where comercio_id = v_comercio and user_id = v_target;
  if v_after_version <> v_before_version + 1 then
    raise exception 'F5_TEST_VERSION_NO_INCREMENTO:%/%', v_before_version, v_after_version;
  end if;

  perform public.f5_actualizar_miembro(v_comercio, v_target, 'admin', '{}'::jsonb, true);
  perform set_config('request.jwt.claim.sub', v_target::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub',v_target::text,'role','authenticated')::text, true);
  begin
    perform public.f5_actualizar_miembro(v_comercio, v_target, 'empleado', '{}'::jsonb, true);
    raise exception 'F5_TEST_ADMIN_PUDO_AUTOEDITARSE';
  exception
    when others then
      if sqlerrm not like 'F5_ADMIN_SELF_EDIT%' then raise; end if;
  end;
end
$test$;

reset role;

do $test$
begin
  if not exists (
    select 1
    from private.f5_membresia_eventos
    where created_at >= transaction_timestamp()
  ) then
    raise exception 'F5_TEST_AUDITORIA_NO_ESCRITA';
  end if;
  begin
    update private.f5_membresia_eventos
       set created_at=created_at
     where id=(select min(id) from private.f5_membresia_eventos);
    raise exception 'F5_TEST_UPDATE_AUDITORIA_MEMBRESIA_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
  begin
    truncate table private.f5_membresia_eventos;
    raise exception 'F5_TEST_TRUNCATE_AUDITORIA_MEMBRESIA_PERMITIDO';
  exception when others then
    if sqlerrm not like 'F5_APPEND_ONLY%' then raise; end if;
  end;
end
$test$;

do $test$
begin
  if to_regprocedure('public.f5_actualizar_config_operativa(uuid,jsonb)') is null
     or to_regprocedure('public.f5_actualizar_config_privilegiada(uuid,jsonb)') is null then
    raise exception 'F5_TEST_RPC_CONFIG_AUSENTE';
  end if;
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='comercio_configuracion'
      and policyname='config_write'
  ) then
    raise exception 'F5_TEST_CONFIG_WRITE_DIRECTO_SIGUE_ACTIVO';
  end if;
  if has_table_privilege('authenticated','public.comercio_configuracion','INSERT')
     or has_table_privilege('authenticated','public.comercio_configuracion','UPDATE')
     or has_table_privilege('authenticated','public.comercio_configuracion','DELETE') then
    raise exception 'F5_TEST_CONFIG_DML_SIGUE_CONCEDIDO';
  end if;
end
$test$;

select set_config(
  'request.jwt.claim.sub',
  (select user_id::text from public.comercio_miembros where activo and rol='duenio' order by created_at limit 1),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub',(select user_id::text from public.comercio_miembros where activo and rol='duenio' order by created_at limit 1),
    'role','authenticated'
  )::text,
  true
);

set local role authenticated;

do $test$
declare
  v_comercio uuid;
  v_owner uuid := (select auth.uid());
  v_employee uuid;
begin
  select comercio_id into v_comercio
  from public.comercio_miembros
  where user_id=v_owner and activo
  limit 1;
  select user_id into v_employee
  from public.comercio_miembros
  where comercio_id=v_comercio and user_id<>v_owner
  order by created_at
  limit 1;

  begin
    perform public.f5_actualizar_config_operativa(v_comercio,'{"campo_futuro":true}'::jsonb);
    raise exception 'F5_TEST_CONFIG_KEY_DESCONOCIDA_ACEPTADA';
  exception when others then
    if sqlerrm not like 'F5_CONFIG_KEYS_INVALIDAS%' then raise; end if;
  end;

  perform public.f5_actualizar_config_operativa(
    v_comercio,
    '{"fondo_caja":0,"dias_aviso_vence":7,"motivos_egreso_extra":[]}'::jsonb
  );
  perform public.f5_actualizar_config_privilegiada(
    v_comercio,
    '{"modulo_fiado":true,"whatsapp_dueno":""}'::jsonb
  );

  perform public.f5_actualizar_miembro(
    v_comercio,
    v_employee,
    'empleado',
    '{"caja_operar":true}'::jsonb,
    true
  );
  perform set_config('request.jwt.claim.sub',v_employee::text,true);
  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub',v_employee::text,'role','authenticated')::text,
    true
  );

  perform public.f5_actualizar_config_operativa(v_comercio,'{"fondo_caja":0}'::jsonb);
  begin
    perform public.f5_actualizar_config_operativa(v_comercio,'{"dias_plazo_fiado":30}'::jsonb);
    raise exception 'F5_TEST_EMPLEADO_SUPERO_PERMISO_OPERATIVO';
  exception when others then
    if sqlerrm not like 'F5_CONFIG_PERMISSION_REQUIRED%' then raise; end if;
  end;
  begin
    perform public.f5_actualizar_config_privilegiada(v_comercio,'{"modulo_fiado":false}'::jsonb);
    raise exception 'F5_TEST_EMPLEADO_MODIFICO_CONFIG_PRIVILEGIADA';
  exception when others then
    if sqlerrm not like 'ROLE_REQUIRED%' then raise; end if;
  end;
end
$test$;

reset role;

do $test$
declare
  v_comercio uuid;
  v_owner uuid;
  v_projection jsonb;
  v_expected jsonb := jsonb_build_object(
    'nroVenta','BLOB_NRO','ultBackup','BLOB_BACKUP','pinDuenio','BLOB_PIN_LEGACY',
    'pinHash','BLOB_PIN_HASH','permisosEmpleado',jsonb_build_object('caja',false,'resumen',true)
  );
begin
  select cm.comercio_id,cm.user_id into v_comercio,v_owner
  from public.comercio_miembros cm
  join public.migraciones_f4 m on m.comercio_id=cm.comercio_id
  join public.datos_kiosco d on d.id=cm.user_id
  where cm.activo and cm.rol='duenio'
  order by cm.created_at
  limit 1;
  if v_comercio is null then raise exception 'F5_TEST_FRONTIER_LEGACY_AUSENTE'; end if;

  update public.migraciones_f4
     set f43_legacy_user_id=v_owner
   where comercio_id=v_comercio;
  update public.datos_kiosco
     set db=jsonb_set(
       db,'{config}',
       coalesce(db->'config','{}'::jsonb)
         || v_expected
         || jsonb_build_object('nombre','BLOB_NOMBRE'),
       true
     )
   where id=v_owner;
  update public.comercio_configuracion
     set pin_hash=repeat('a',64),
         permisos_empleado='{"caja":true}'::jsonb
   where comercio_id=v_comercio;

  v_projection := qa.v4_to_legacy(v_comercio);
  if not ((v_projection->'config') @> v_expected) then
    raise exception 'F5_TEST_CENTINELAS_ROLLBACK_CAMBIARON:%',v_projection->'config';
  end if;
  if v_projection->'config'->>'nombre' <> (
    select nombre from public.comercios where id=v_comercio
  ) then
    raise exception 'F5_TEST_NOMBRE_NO_DERIVADO_DESDE_COMERCIOS';
  end if;
end
$test$;

rollback;
