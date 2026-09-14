-- F5 / Task 7 - fixture aislado para validar minimizacion en v4_only.
-- Proyecto autorizado: QA qrvdfqpxutymmlcplsal.
--
-- Este archivo NO crea usuarios dentro de auth.users. Antes de ejecutarlo, crear
-- un usuario tecnico nuevo mediante Supabase Auth Admin y cargar su UUID asi:
--
--   select set_config('app.f5_projection_user_id','<UUID NUEVO>',false);
--
-- Fase 1 crea solamente el comercio aislado y sus recursos vacios. La Fase 2
-- debe ejecutarse despues de que el cliente shadow haya generado y drenado al
-- menos 20 verificaciones comparables de configuracion.

begin;

do $fixture$
declare
  v_user_id uuid := nullif(current_setting('app.f5_projection_user_id',true),'')::uuid;
  v_comercio_id uuid := gen_random_uuid();
  v_caja_id uuid := gen_random_uuid();
  v_device_id uuid := gen_random_uuid();
  v_active_memberships bigint;
begin
  if v_user_id is null then
    raise exception 'F5_PROJECTION_QA_USER_ID_REQUIRED';
  end if;
  if not exists(select 1 from auth.users u where u.id=v_user_id) then
    raise exception 'F5_PROJECTION_QA_AUTH_USER_NOT_FOUND';
  end if;

  select count(*) into v_active_memberships
  from public.comercio_miembros cm
  where cm.user_id=v_user_id and cm.activo;
  if v_active_memberships<>0 then
    raise exception 'F5_PROJECTION_QA_USER_ALREADY_ACTIVE:%',v_active_memberships;
  end if;
  if exists(select 1 from public.comercios c where c.nombre='F5_PROJECTION_QA') then
    raise exception 'F5_PROJECTION_QA_ALREADY_EXISTS';
  end if;

  insert into public.comercios(
    id,nombre,timezone,business_day_cutoff,architecture_version,schema_version
  ) values (
    v_comercio_id,'F5_PROJECTION_QA','America/Argentina/Buenos_Aires','04:00',4,4
  );
  insert into public.comercio_licencias(
    comercio_id,activo,plan,limite_ia_diario,offline_grace_days
  ) values (v_comercio_id,true,'base',30,7);
  insert into public.comercio_configuracion(comercio_id) values (v_comercio_id);
  insert into public.comercio_miembros(
    comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version
  ) values (
    v_comercio_id,v_user_id,'duenio','{}'::jsonb,'F5 Projection QA',true,1
  );
  insert into public.cajas(id,comercio_id,codigo,nombre,activa)
  values(v_caja_id,v_comercio_id,'F5PROJ1','F5 Projection Caja',true);
  insert into public.comercio_dispositivos(
    id,comercio_id,user_id,caja_id,nombre,schema_version,payload_version,last_seen_at,last_sync_at
  ) values (
    v_device_id,v_comercio_id,v_user_id,v_caja_id,'F5 Projection Device',4,1,now(),now()
  );
  insert into public.datos_kiosco(id,db,revision)
  values(
    v_user_id,
    jsonb_build_object(
      'productos','[]'::jsonb,'clientes','[]'::jsonb,'ventas','[]'::jsonb,
      'movs','[]'::jsonb,'pagos','[]'::jsonb,'cierres','[]'::jsonb,
      'combos','[]'::jsonb,'egresos','[]'::jsonb,'ajustesFiado','[]'::jsonb,
      'promociones','[]'::jsonb,'_tombstones','{}'::jsonb,
      'config',jsonb_build_object(
        'nombre','F5_PROJECTION_QA','nroVenta',1,'fondoCaja',0,
        'fondoCajaCigarros',0,'ultBackup',null,'whatsappDueno','',
        'pinHash','','pinDuenio','','motivosEgresoExtra','[]'::jsonb,
        'diasAvisoVence',7,'diasPlazoFiado',30,'recargoFiadoPct',10,
        'moduloFiado',true,'moduloVencimientos',true,'moduloCigarros',true,
        'permisosEmpleado','{}'::jsonb
      )
    ),
    0
  );
end
$fixture$;

commit;

-- Identificadores no secretos que deben copiarse a la evidencia.
select c.id as comercio_id,c.nombre,cx.id as caja_id,d.id as device_id,cm.user_id
from public.comercios c
join public.comercio_miembros cm on cm.comercio_id=c.id and cm.activo and cm.rol='duenio'
join public.cajas cx on cx.comercio_id=c.id and cx.activa
join public.comercio_dispositivos d on d.comercio_id=c.id and d.revoked_at is null
where c.nombre='F5_PROJECTION_QA';

-- Fase 2. Ejecutar como una consulta separada, despues del drenaje shadow.
-- Requiere cargar en la misma sesion:
--   app.f5_projection_user_id
--   app.f5_projection_snapshot_hash (SHA-256 de 64 hex generado por el cliente)

begin;

do $cutover$
declare
  v_user_id uuid := nullif(current_setting('app.f5_projection_user_id',true),'')::uuid;
  v_hash text := lower(nullif(current_setting('app.f5_projection_snapshot_hash',true),''));
  v_comercio_id uuid;
  v_device_id uuid;
  v_desde timestamptz;
  v_preflight jsonb;
  v_zero jsonb := jsonb_build_object(
    'productos',0,'clientes',0,'ventas',0,'movs',0,'pagos',0,
    'cierres',0,'combos',0,'egresos',0,'ajustesFiado',0,'promociones',0
  );
  v_other_state text;
begin
  if v_user_id is null then raise exception 'F5_PROJECTION_QA_USER_ID_REQUIRED'; end if;
  if v_hash is null or v_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'F5_PROJECTION_QA_SNAPSHOT_HASH_REQUIRED';
  end if;

  select c.id,c.created_at into strict v_comercio_id,v_desde
  from public.comercios c where c.nombre='F5_PROJECTION_QA';
  select d.id into strict v_device_id
  from public.comercio_dispositivos d
  where d.comercio_id=v_comercio_id and d.user_id=v_user_id and d.revoked_at is null;

  if (select count(*) from public.comercio_miembros cm where cm.user_id=v_user_id and cm.activo)<>1 then
    raise exception 'F5_PROJECTION_QA_USER_MEMBERSHIP_NOT_ISOLATED';
  end if;
  if exists(select 1 from public.caja_sesiones s where s.comercio_id=v_comercio_id and s.estado='abierta') then
    raise exception 'F5_PROJECTION_QA_OPEN_SESSION';
  end if;
  if exists(select 1 from public.operaciones_procesadas o where o.comercio_id=v_comercio_id and o.estado='procesando') then
    raise exception 'F5_PROJECTION_QA_OPERATION_IN_PROGRESS';
  end if;

  perform set_config('request.jwt.claim.sub',v_user_id::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user_id,'role','authenticated')::text,true);
  set local role authenticated;

  v_preflight:=public.preflight_cutover_f34(v_comercio_id,v_desde,20);
  if coalesce((v_preflight->>'listo')::boolean,false) is not true then
    raise exception 'F5_PROJECTION_QA_F34_NOT_READY:%',v_preflight;
  end if;

  perform public.registrar_snapshot_migracion_f4(
    v_comercio_id,
    jsonb_build_object(
      'snapshot_hash',v_hash,
      'snapshot_schema','micomercio-f4.1-snapshot-v1',
      'snapshot_revision_legacy',0,
      'snapshot_local_seq',20,
      'snapshot_device_id',v_device_id,
      'snapshot_created_at_device',now(),
      'snapshot_counts',v_zero,
      'snapshot_integrity',jsonb_build_object('ok',true,'issueCount',0,'fixture',false),
      'snapshot_bytes',0,
      'f34_desde',v_desde,
      'f34_min_coincidencias',20
    )
  );
  perform public.habilitar_bootstrap_candidato_f42(v_comercio_id);
  perform public.registrar_prueba_bootstrap_f42(
    v_comercio_id,
    jsonb_build_object(
      'test_id',gen_random_uuid(),'device_id',v_device_id,
      'f42_version','4.2.0-rc1.5','perfil_limpio',true,
      'legacy_reads',0,'legacy_writes',0,'legacy_forbidden_attempts',0,
      'virtual_reads',0,'virtual_writes',0,
      'pull_maestros_completo',true,'pull_operaciones_completo',true,
      'local_snapshot_hash',v_hash,'local_counts',v_zero,
      'stock_total',0,'saldo_total',0,'started_at',now(),'finished_at',now()
    )
  );
  perform public.registrar_preparacion_f43(
    v_comercio_id,
    jsonb_build_object(
      'device_id',v_device_id,'f43_client_version','4.3.0-qa3',
      'local_snapshot_hash',v_hash,'local_seq',20,
      'outbox_active',0,'session_open',false,'prepared_at',now()
    )
  );
  perform public.activar_v4_only_f43(v_comercio_id,168);

  -- La comprobacion del comercio de control es administrativa: el usuario
  -- aislado no debe obtener visibilidad RLS sobre ese comercio.
  reset role;
  select m.estado into strict v_other_state
  from public.comercios c join public.migraciones_f4 m on m.comercio_id=c.id
  where c.nombre='COV_QA_COMERCIO_01';
  if v_other_state<>'rollback' then
    raise exception 'F5_PROJECTION_QA_ISOLATION_BROKEN:%',v_other_state;
  end if;
  if (select m.estado from public.migraciones_f4 m where m.comercio_id=v_comercio_id)<>'v4_only' then
    raise exception 'F5_PROJECTION_QA_CUTOVER_FAILED';
  end if;
end
$cutover$;

commit;

select c.nombre,m.estado,m.f34_server_preflight,m.f42_last_test_ok,m.f43_version,m.f43_rollback_until
from public.comercios c
join public.migraciones_f4 m on m.comercio_id=c.id
where c.nombre in ('COV_QA_COMERCIO_01','F5_PROJECTION_QA')
order by c.nombre;
