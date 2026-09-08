begin;

do $test$
declare
  v_comercio uuid;
  v_codigo text;
begin
  if to_regprocedure('private.f6_ensure_comercio_login_code()') is null then
    raise exception 'F6_COMMERCE_LOGIN_CODE_TRIGGER_FUNCTION_MISSING';
  end if;
  if not exists (
    select 1
      from pg_trigger
     where tgrelid='public.comercios'::regclass
       and tgname='f6_ensure_comercio_login_code_after_insert'
       and not tgisinternal
  ) then
    raise exception 'F6_COMMERCE_LOGIN_CODE_TRIGGER_MISSING';
  end if;

  insert into public.comercios(nombre)
  values('F6 login code trigger test')
  returning id into v_comercio;

  select codigo_normalizado
    into v_codigo
    from private.f5_login_comercios
   where comercio_id=v_comercio;
  if v_codigo is null or v_codigo !~ '^[a-z0-9]{10}$' then
    raise exception 'F6_COMMERCE_LOGIN_CODE_NOT_CREATED:%',v_codigo;
  end if;
  if exists (
    select 1
      from public.comercios comercio
      left join private.f5_login_comercios login_code on login_code.comercio_id=comercio.id
     where login_code.comercio_id is null
  ) then
    raise exception 'F6_COMMERCE_WITHOUT_LOGIN_CODE';
  end if;
end
$test$;

do $test$
declare
  v_commands text[];
begin
  if to_regprocedure('public.f6_listar_miembros_gestion(uuid)') is null then
    raise exception 'F6_EMPLOYEE_ROSTER_RPC_MISSING';
  end if;
  if to_regprocedure('private._f6_listar_miembros_gestion(uuid)') is null then
    raise exception 'F6_EMPLOYEE_ROSTER_GUARD_MISSING';
  end if;
  if to_regprocedure('private.f6_puede_acceder_imagenes(text,boolean)') is null then
    raise exception 'F6_PRODUCT_IMAGE_GUARD_MISSING';
  end if;
  if not has_function_privilege('authenticated','public.f6_listar_miembros_gestion(uuid)','EXECUTE')
     or has_function_privilege('anon','public.f6_listar_miembros_gestion(uuid)','EXECUTE') then
    raise exception 'F6_EMPLOYEE_ROSTER_RPC_PRIVILEGES_INVALID';
  end if;
  if not has_function_privilege('authenticated','private._f6_listar_miembros_gestion(uuid)','EXECUTE')
     or has_function_privilege('anon','private._f6_listar_miembros_gestion(uuid)','EXECUTE')
     or (select prosecdef from pg_proc where oid='public.f6_listar_miembros_gestion(uuid)'::regprocedure) then
    raise exception 'F6_EMPLOYEE_ROSTER_WRAPPER_INVALID';
  end if;
  if not has_function_privilege('authenticated','private.f6_puede_acceder_imagenes(text,boolean)','EXECUTE')
     or has_function_privilege('anon','private.f6_puede_acceder_imagenes(text,boolean)','EXECUTE') then
    raise exception 'F6_PRODUCT_IMAGE_GUARD_PRIVILEGES_INVALID';
  end if;

  select array_agg(cmd order by cmd)
    into v_commands
    from pg_policies
   where schemaname='storage'
     and tablename='objects'
     and policyname like 'f6_product_images_%';
  if v_commands <> array['DELETE','INSERT','SELECT','UPDATE']::text[] then
    raise exception 'F6_PRODUCT_IMAGE_POLICIES_INVALID:%',v_commands;
  end if;

  if not exists (
    select 1 from storage.buckets
     where id='product-images'
       and public
       and file_size_limit=8388608
       and allowed_mime_types @> array['image/jpeg','image/png','image/webp']::text[]
  ) then
    raise exception 'F6_PRODUCT_IMAGE_BUCKET_INVALID';
  end if;
end
$test$;

select set_config(
  'request.jwt.claim.sub',
  (
    select owner_member.user_id::text
      from public.comercio_miembros owner_member
     where owner_member.activo
       and owner_member.rol='duenio'
       and private.licencia_activa(owner_member.comercio_id)
       and exists (
         select 1 from public.comercio_miembros employee
          where employee.comercio_id=owner_member.comercio_id
            and employee.user_id<>owner_member.user_id
            and employee.activo
            and employee.rol='empleado'
       )
     order by owner_member.created_at
     limit 1
  ),
  true
);
select set_config(
  'request.jwt.claims',
  jsonb_build_object('sub',current_setting('request.jwt.claim.sub',true),'role','authenticated')::text,
  true
);

set local role authenticated;

do $test$
declare
  v_owner uuid:=(select auth.uid());
  v_comercio uuid;
  v_target uuid;
  v_roster jsonb;
begin
  select cm.comercio_id
    into v_comercio
    from public.comercio_miembros cm
   where cm.user_id=v_owner and cm.activo and cm.rol='duenio'
     and private.licencia_activa(cm.comercio_id)
   limit 1;
  if v_comercio is null then raise exception 'F6_PRODUCT_IMAGE_ACTIVE_PILOT_MISSING'; end if;

  select cm.user_id
    into v_target
    from public.comercio_miembros cm
   where cm.comercio_id=v_comercio and cm.user_id<>v_owner and cm.activo and cm.rol='empleado'
   order by cm.created_at
   limit 1;
  if v_target is null then raise exception 'F6_EMPLOYEE_FIXTURE_MISSING'; end if;

  perform public.f5_actualizar_miembro(
    v_comercio,v_target,'empleado','{"ventas_registrar":true,"productos_editar":false}'::jsonb,false
  );
  v_roster:=public.f6_listar_miembros_gestion(v_comercio);
  if not exists (
    select 1 from jsonb_array_elements(v_roster->'items') item
     where item->>'user_id'=v_target::text and (item->>'activo')::boolean=false
  ) then
    raise exception 'F6_SUSPENDED_EMPLOYEE_HIDDEN:%',v_roster;
  end if;

  perform public.f5_actualizar_miembro(
    v_comercio,v_target,'empleado','{"ventas_registrar":true,"productos_editar":false}'::jsonb,true
  );
  perform set_config('request.jwt.claim.sub',v_target::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_target::text,'role','authenticated')::text,true);
  if not private.f6_puede_acceder_imagenes(v_comercio::text,false)
     or private.f6_puede_acceder_imagenes(v_comercio::text,true) then
    raise exception 'F6_PRODUCT_IMAGE_READ_EDIT_SPLIT_INVALID';
  end if;

  perform set_config('request.jwt.claim.sub',v_owner::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_owner::text,'role','authenticated')::text,true);
  perform public.f5_actualizar_miembro(
    v_comercio,v_target,'empleado','{"ventas_registrar":true,"productos_editar":true}'::jsonb,true
  );
  perform set_config('request.jwt.claim.sub',v_target::text,true);
  perform set_config('request.jwt.claims',jsonb_build_object('sub',v_target::text,'role','authenticated')::text,true);
  if not private.f6_puede_acceder_imagenes(v_comercio::text,true) then
    raise exception 'F6_PRODUCT_IMAGE_EDITOR_REJECTED';
  end if;
end
$test$;

reset role;
rollback;
