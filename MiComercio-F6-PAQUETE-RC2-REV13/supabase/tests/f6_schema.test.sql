begin;

do $test$
declare
  v_missing text[];
begin
  if current_setting('server_version_num')::integer < 150000 then
    raise exception 'F6_POSTGRES_15_REQUIRED';
  end if;

  select array_agg(name order by name)
    into v_missing
    from unnest(array[
      'private.f6_alta_autorizaciones',
      'private.f6_invitaciones',
      'private.f6_onboarding',
      'private.f6_licencia_eventos',
      'private.f6_soporte_operadores',
      'private.f6_soporte_eventos',
      'private.f6_rate_intentos'
    ]) as expected(name)
   where to_regclass(name) is null;

  if coalesce(cardinality(v_missing),0) > 0 then
    raise exception 'F6_SCHEMA_OBJECTS_MISSING:%', array_to_string(v_missing,',');
  end if;

  if exists (
    select 1
      from unnest(array[
        'estado_administrativo','valid_from','valid_until','pause_started_at',
        'extension_used_seconds','state_version'
      ]) as expected(column_name)
     where not exists (
       select 1
         from information_schema.columns c
        where c.table_schema='public'
          and c.table_name='comercio_licencias'
          and c.column_name=expected.column_name
     )
  ) then
    raise exception 'F6_LICENSE_COLUMNS_MISSING';
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid='public.comercio_licencias'::regclass
       and conname='comercio_licencias_f6_beta_dates_check'
  ) then
    raise exception 'F6_LICENSE_DATES_CHECK_MISSING';
  end if;

  if exists (
    select 1
      from unnest(array[
        'source','timezone','business_day_cutoff','provision_idempotency_key'
      ]) as expected(column_name)
     where not exists (
       select 1
         from information_schema.columns c
        where c.table_schema='private'
          and c.table_name='f6_alta_autorizaciones'
          and c.column_name=expected.column_name
     )
  ) then
    raise exception 'F6_AUTHORIZATION_COLUMNS_MISSING';
  end if;

  if exists (
    select 1
      from unnest(array[
        'private.f6_alta_autorizaciones',
        'private.f6_invitaciones',
        'private.f6_onboarding',
        'private.f6_licencia_eventos',
        'private.f6_soporte_operadores',
        'private.f6_soporte_eventos',
        'private.f6_rate_intentos'
      ]) as protected(name)
      join pg_class c on c.oid=protected.name::regclass
     where not c.relrowsecurity
  ) then
    raise exception 'F6_PRIVATE_RLS_DISABLED';
  end if;

  if exists (
    select 1
      from unnest(array['anon','authenticated','service_role']) as role_name(role_name)
      cross join unnest(array[
        'private.f6_alta_autorizaciones',
        'private.f6_invitaciones',
        'private.f6_onboarding',
        'private.f6_licencia_eventos',
        'private.f6_soporte_operadores',
        'private.f6_soporte_eventos',
        'private.f6_rate_intentos'
      ]) as protected(name)
     where has_table_privilege(
       role_name.role_name,
       protected.name,
       'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
     )
  ) then
    raise exception 'F6_PRIVATE_TABLE_PRIVILEGE_EXPOSED';
  end if;

  if has_table_privilege('anon','public.comercio_licencias','SELECT')
     or has_table_privilege('authenticated','public.comercio_licencias','SELECT') then
    raise exception 'F6_LICENSE_TABLE_EXPOSED';
  end if;
end
$test$;

insert into public.comercios(
  id,nombre,timezone,business_day_cutoff,architecture_version,schema_version
) values
  ('f6000000-0000-4000-8000-000000000001','F6_SCHEMA_QA_PENDING','America/Argentina/Buenos_Aires','04:00',4,4),
  ('f6000000-0000-4000-8000-000000000002','F6_SCHEMA_QA_CANCELLED','America/Argentina/Buenos_Aires','04:00',4,4);

-- La transición que rompía el plan: una beta recién provisionada todavía no tiene vigencia.
insert into public.comercio_licencias(
  comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
  estado_administrativo,valid_from,valid_until
) values (
  'f6000000-0000-4000-8000-000000000001',false,'beta',30,7,
  'pendiente',null,null
);

do $test$
declare
  v_row public.comercio_licencias%rowtype;
begin
  select * into strict v_row
    from public.comercio_licencias
   where comercio_id='f6000000-0000-4000-8000-000000000001';
  if v_row.estado_administrativo <> 'pendiente'
     or v_row.valid_from is not null
     or v_row.valid_until is not null then
    raise exception 'F6_PENDING_LICENSE_SHAPE_INVALID';
  end if;

  begin
    update public.comercio_licencias
       set estado_administrativo='activa'
     where comercio_id='f6000000-0000-4000-8000-000000000001';
    raise exception 'F6_ACTIVE_LICENSE_WITHOUT_DATES_ACCEPTED';
  exception
    when check_violation then null;
  end;

  begin
    update public.comercio_licencias
       set valid_from=statement_timestamp()
     where comercio_id='f6000000-0000-4000-8000-000000000001';
    raise exception 'F6_PARTIAL_LICENSE_DATES_ACCEPTED';
  exception
    when check_violation then null;
  end;

  update public.comercio_licencias
     set estado_administrativo='activa',
         activo=true,
         valid_from=statement_timestamp(),
         valid_until=statement_timestamp()+make_interval(secs=>604800)
   where comercio_id='f6000000-0000-4000-8000-000000000001';

  update public.comercio_licencias
     set estado_administrativo='pausada',
         activo=false,
         pause_started_at=statement_timestamp()
   where comercio_id='f6000000-0000-4000-8000-000000000001';

  update public.comercio_licencias
     set estado_administrativo='cancelada',
         activo=false,
         pause_started_at=null
   where comercio_id='f6000000-0000-4000-8000-000000000001';

  insert into public.comercio_licencias(
    comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
    estado_administrativo,valid_from,valid_until
  ) values (
    'f6000000-0000-4000-8000-000000000002',false,'beta',30,7,
    'cancelada',null,null
  );
end
$test$;

insert into private.f6_licencia_eventos(
  comercio_id,actor_user_id,accion,motivo,antes,despues,correlation_id
) values (
  'f6000000-0000-4000-8000-000000000001',
  'f6000000-0000-4000-8000-000000000010',
  'onboarding_activate','prueba estructural','{}','{}',
  'f6000000-0000-4000-8000-000000000011'
);

do $test$
begin
  begin
    update private.f6_licencia_eventos set motivo='alterado';
    raise exception 'F6_AUDIT_UPDATE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'F6_AUDIT_APPEND_ONLY' then raise; end if;
  end;

  begin
    delete from private.f6_licencia_eventos;
    raise exception 'F6_AUDIT_DELETE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'F6_AUDIT_APPEND_ONLY' then raise; end if;
  end;

  begin
    truncate table private.f6_licencia_eventos;
    raise exception 'F6_AUDIT_TRUNCATE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'F6_AUDIT_APPEND_ONLY' then raise; end if;
  end;

  begin
    truncate table private.f6_soporte_eventos;
    raise exception 'F6_SUPPORT_AUDIT_TRUNCATE_ACCEPTED';
  exception when others then
    if sqlerrm <> 'F6_AUDIT_APPEND_ONLY' then raise; end if;
  end;
end
$test$;

rollback;
