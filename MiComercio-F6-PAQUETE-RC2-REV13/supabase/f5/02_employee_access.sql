-- F5.2 — acceso de empleados sin correo visible.
-- Todas las RPC public.f5_service_* son exclusivamente para Edge Functions con secret key.

create table if not exists private.f5_login_comercios (
  comercio_id uuid primary key references public.comercios(id) on delete cascade,
  codigo_normalizado text not null unique,
  created_at timestamptz not null default now(),
  constraint f5_login_comercios_codigo_check
    check (codigo_normalizado ~ '^[a-z0-9]{10}$')
);

insert into private.f5_login_comercios(comercio_id,codigo_normalizado)
select c.id, lower(substr(replace(gen_random_uuid()::text,'-',''),1,10))
from public.comercios c
on conflict (comercio_id) do nothing;

create table if not exists private.f5_login_identidades (
  user_id uuid primary key references auth.users(id) on delete cascade,
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  usuario_normalizado text not null,
  internal_email text not null unique,
  created_at timestamptz not null default now(),
  constraint f5_login_identidades_usuario_check
    check (usuario_normalizado ~ '^[a-z0-9._-]{1,80}$'),
  unique (comercio_id, usuario_normalizado)
);

create index if not exists f5_login_identidades_comercio_idx
  on private.f5_login_identidades(comercio_id,user_id);

create table if not exists private.f5_login_intentos (
  id bigint generated always as identity primary key,
  ip_hash text not null,
  usuario_hash text not null,
  resolved_user_id uuid,
  exitoso boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint f5_login_intentos_ip_hash_check check (ip_hash ~ '^[0-9a-f]{64}$'),
  constraint f5_login_intentos_usuario_hash_check check (usuario_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists f5_login_intentos_ventana_idx
  on private.f5_login_intentos(ip_hash,usuario_hash,created_at desc)
  where exitoso = false;
create index if not exists f5_login_intentos_usuario_window_idx
  on private.f5_login_intentos(usuario_hash,created_at desc)
  where exitoso = false;
create index if not exists f5_login_intentos_ip_window_idx
  on private.f5_login_intentos(ip_hash,created_at desc)
  where exitoso = false;

create or replace function private._f5_service_login_preflight(
  p_comercio text,
  p_usuario_normalizado text,
  p_ip_hash text,
  p_usuario_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_identidad private.f5_login_identidades%rowtype;
  v_comercio_id uuid;
  v_attempt_id bigint;
  v_fallidos_par integer;
  v_fallidos_usuario integer;
  v_fallidos_ip integer;
begin
  if p_comercio is null or p_comercio !~ '^[a-z0-9]{10}$'
     or p_usuario_normalizado is null or p_usuario_normalizado !~ '^[a-z0-9._-]{1,80}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_usuario_hash is null or p_usuario_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'F5_LOGIN_INPUT_INVALIDO';
  end if;

  -- Serializa también los intentos que rotan IP o usuario para evadir el par.
  perform pg_advisory_xact_lock(hashtext('f5-login-user:'||p_usuario_hash));
  perform pg_advisory_xact_lock(hashtext('f5-login-ip:'||p_ip_hash));
  perform pg_advisory_xact_lock(hashtext('f5-login-pair:'||p_ip_hash||':'||p_usuario_hash));
  select count(*)
    into v_fallidos_par
    from private.f5_login_intentos a
   where a.ip_hash = p_ip_hash
     and a.usuario_hash = p_usuario_hash
     and not a.exitoso
     and a.created_at >= now() - interval '15 minutes';
  if v_fallidos_par >= 5 then
    return jsonb_build_object('limited',true,'retry_after',900,'found',false);
  end if;

  select count(*)
    into v_fallidos_usuario
    from private.f5_login_intentos a
   where a.usuario_hash = p_usuario_hash
     and not a.exitoso
     and a.created_at >= now() - interval '1 hour';
  if v_fallidos_usuario >= 20 then
    return jsonb_build_object('limited',true,'retry_after',3600,'found',false);
  end if;

  select count(*)
    into v_fallidos_ip
    from private.f5_login_intentos a
   where a.ip_hash = p_ip_hash
     and not a.exitoso
     and a.created_at >= now() - interval '1 hour';
  if v_fallidos_ip >= 50 then
    return jsonb_build_object('limited',true,'retry_after',3600,'found',false);
  end if;

  select lc.comercio_id
    into v_comercio_id
    from private.f5_login_comercios lc
   where lc.codigo_normalizado = p_comercio;

  if v_comercio_id is not null then
    select i.*
      into v_identidad
      from private.f5_login_identidades i
      join public.comercio_miembros cm
        on cm.comercio_id = i.comercio_id
       and cm.user_id = i.user_id
       and cm.activo
     where i.comercio_id = v_comercio_id
       and i.usuario_normalizado = p_usuario_normalizado;
  end if;

  insert into private.f5_login_intentos(ip_hash,usuario_hash,resolved_user_id)
  values(p_ip_hash,p_usuario_hash,v_identidad.user_id)
  returning id into v_attempt_id;

  return jsonb_build_object(
    'limited',false,
    'retry_after',0,
    'attempt_id',v_attempt_id,
    'found',v_identidad.user_id is not null,
    'user_id',v_identidad.user_id,
    'comercio_id',v_comercio_id,
    'internal_email',v_identidad.internal_email
  );
end;
$function$;

create or replace function private._f5_service_login_result(
  p_attempt_id bigint,
  p_exitoso boolean
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_updated bigint;
begin
  if p_attempt_id is null or p_exitoso is null then
    raise exception 'F5_LOGIN_RESULT_INVALIDO';
  end if;
  update private.f5_login_intentos
     set exitoso = p_exitoso,
         completed_at = now()
   where id = p_attempt_id
     and completed_at is null;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$function$;

create or replace function private._f5_service_login_membresia(
  p_comercio_id uuid,
  p_user_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select jsonb_build_object(
    'comercio_id',cm.comercio_id,
    'user_id',cm.user_id,
    'rol',cm.rol,
    'nombre_mostrado',cm.nombre_mostrado,
    'activo',cm.activo,
    'permission_version',cm.permission_version,
    'permisos_efectivos',to_jsonb(
      case
        when cm.rol in ('duenio','admin') then private.f5_catalogo_permisos()
        else coalesce(
          array(
            select permiso.clave
            from jsonb_each(cm.permisos) as permiso(clave,valor)
            where permiso.valor = 'true'::jsonb
            order by permiso.clave
          ),
          array[]::text[]
        )
      end
    )
  )
  from public.comercio_miembros cm
  where cm.comercio_id = p_comercio_id
    and cm.user_id = p_user_id
    and cm.activo;
$function$;

create or replace function private._f5_service_crear_empleado(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_new_user_id uuid,
  p_usuario_normalizado text,
  p_internal_email text,
  p_nombre_mostrado text,
  p_permisos jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor public.comercio_miembros%rowtype;
  v_after public.comercio_miembros%rowtype;
  v_login_code text;
  v_auth_email text;
begin
  if p_actor_user_id is null or p_comercio_id is null or p_new_user_id is null then
    raise exception 'F5_MEMBRESIA_REQUERIDA';
  end if;
  if p_usuario_normalizado is null or p_usuario_normalizado !~ '^[a-z0-9._-]{1,80}$' then
    raise exception 'F5_USUARIO_INVALIDO';
  end if;
  if p_internal_email is null
     or p_internal_email !~ '^[0-9a-f-]{36}@auth[.]micomercio[.]invalid$' then
    raise exception 'F5_INTERNAL_EMAIL_INVALIDO';
  end if;
  if p_nombre_mostrado is null
     or length(trim(p_nombre_mostrado)) < 1
     or length(trim(p_nombre_mostrado)) > 120 then
    raise exception 'F5_NOMBRE_INVALIDO';
  end if;
  if not private.f5_permisos_validos(p_permisos) then
    raise exception 'F5_PERMISOS_INVALIDOS';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_comercio_id::text));

  select *
    into v_actor
    from public.comercio_miembros cm
   where cm.comercio_id = p_comercio_id
     and cm.user_id = p_actor_user_id
     and cm.activo
   for update;
  if not found then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if v_actor.rol not in ('duenio','admin') then raise exception 'ROLE_REQUIRED'; end if;

  select lower(u.email)
    into v_auth_email
    from auth.users u
   where u.id = p_new_user_id;
  if v_auth_email is null or v_auth_email <> lower(p_internal_email) then
    raise exception 'F5_AUTH_IDENTITY_MISMATCH';
  end if;

  insert into private.f5_login_comercios(comercio_id,codigo_normalizado)
  values(p_comercio_id,lower(substr(replace(gen_random_uuid()::text,'-',''),1,10)))
  on conflict (comercio_id) do nothing;
  select codigo_normalizado
    into v_login_code
    from private.f5_login_comercios
   where comercio_id = p_comercio_id;

  insert into public.comercio_miembros(
    comercio_id,user_id,rol,permisos,nombre_mostrado,activo
  ) values (
    p_comercio_id,p_new_user_id,'empleado',p_permisos,trim(p_nombre_mostrado),true
  )
  returning * into v_after;

  insert into private.f5_login_identidades(
    user_id,comercio_id,usuario_normalizado,internal_email
  ) values (
    p_new_user_id,p_comercio_id,p_usuario_normalizado,lower(p_internal_email)
  );

  insert into private.f5_membresia_eventos(
    comercio_id,actor_user_id,target_user_id,antes,despues
  ) values (
    p_comercio_id,p_actor_user_id,p_new_user_id,'{}'::jsonb,to_jsonb(v_after)
  );

  return jsonb_build_object(
    'ok',true,
    'user_id',v_after.user_id,
    'rol',v_after.rol,
    'nombre_mostrado',v_after.nombre_mostrado,
    'permission_version',v_after.permission_version,
    'comercio',v_login_code
  );
end;
$function$;

create or replace function private._f5_service_resolver_empleado(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_usuario_normalizado text
)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_actor_rol text;
  v_target_user_id uuid;
begin
  if p_actor_user_id is null or p_comercio_id is null then
    raise exception 'F5_MEMBRESIA_REQUERIDA';
  end if;
  if p_usuario_normalizado is null or p_usuario_normalizado !~ '^[a-z0-9._-]{1,80}$' then
    raise exception 'F5_USUARIO_INVALIDO';
  end if;

  select cm.rol
    into v_actor_rol
    from public.comercio_miembros cm
   where cm.comercio_id = p_comercio_id
     and cm.user_id = p_actor_user_id
     and cm.activo;
  if v_actor_rol is null then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if v_actor_rol not in ('duenio','admin') then raise exception 'ROLE_REQUIRED'; end if;

  select i.user_id
    into v_target_user_id
    from private.f5_login_identidades i
    join public.comercio_miembros cm
      on cm.comercio_id = i.comercio_id
     and cm.user_id = i.user_id
     and cm.activo
     and cm.rol = 'empleado'
   where i.comercio_id = p_comercio_id
     and i.usuario_normalizado = p_usuario_normalizado;
  if v_target_user_id is null then raise exception 'F5_EMPLEADO_NO_EXISTE'; end if;
  return v_target_user_id;
end;
$function$;

create or replace function private._f5_service_codigo_comercio(
  p_actor_user_id uuid,
  p_comercio_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_code text;
begin
  if not exists (
    select 1
    from public.comercio_miembros cm
    where cm.comercio_id = p_comercio_id
      and cm.user_id = p_actor_user_id
      and cm.activo
      and cm.rol in ('duenio','admin')
  ) then
    raise exception 'ROLE_REQUIRED';
  end if;
  select codigo_normalizado into v_code
  from private.f5_login_comercios
  where comercio_id = p_comercio_id;
  return v_code;
end;
$function$;

create or replace function public.f5_service_login_preflight(
  p_comercio text,p_usuario_normalizado text,p_ip_hash text,p_usuario_hash text
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private._f5_service_login_preflight(
    p_comercio,p_usuario_normalizado,p_ip_hash,p_usuario_hash
  );
$function$;

create or replace function public.f5_service_login_result(p_attempt_id bigint,p_exitoso boolean)
returns boolean language sql security invoker set search_path = ''
as $function$
  select private._f5_service_login_result(p_attempt_id,p_exitoso);
$function$;

create or replace function public.f5_service_login_membresia(p_comercio_id uuid,p_user_id uuid)
returns jsonb language sql stable security invoker set search_path = ''
as $function$
  select private._f5_service_login_membresia(p_comercio_id,p_user_id);
$function$;

create or replace function public.f5_service_crear_empleado(
  p_actor_user_id uuid,p_comercio_id uuid,p_new_user_id uuid,
  p_usuario_normalizado text,p_internal_email text,p_nombre_mostrado text,p_permisos jsonb
)
returns jsonb language sql security invoker set search_path = ''
as $function$
  select private._f5_service_crear_empleado(
    p_actor_user_id,p_comercio_id,p_new_user_id,p_usuario_normalizado,
    p_internal_email,p_nombre_mostrado,p_permisos
  );
$function$;

create or replace function public.f5_service_resolver_empleado(
  p_actor_user_id uuid,p_comercio_id uuid,p_usuario_normalizado text
)
returns uuid language sql stable security invoker set search_path = ''
as $function$
  select private._f5_service_resolver_empleado(
    p_actor_user_id,p_comercio_id,p_usuario_normalizado
  );
$function$;

create or replace function public.f5_service_codigo_comercio(p_actor_user_id uuid,p_comercio_id uuid)
returns text language sql stable security invoker set search_path = ''
as $function$
  select private._f5_service_codigo_comercio(p_actor_user_id,p_comercio_id);
$function$;

revoke all on table private.f5_login_comercios from public,anon,authenticated,service_role;
revoke all on table private.f5_login_identidades from public,anon,authenticated,service_role;
revoke all on table private.f5_login_intentos from public,anon,authenticated,service_role;
revoke all on sequence private.f5_login_intentos_id_seq from public,anon,authenticated,service_role;

revoke all on function private._f5_service_login_preflight(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_login_result(bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_login_membresia(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_crear_empleado(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_resolver_empleado(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function private._f5_service_codigo_comercio(uuid,uuid) from public,anon,authenticated,service_role;

revoke all on function public.f5_service_login_preflight(text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_login_result(bigint,boolean) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_login_membresia(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_crear_empleado(uuid,uuid,uuid,text,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_resolver_empleado(uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.f5_service_codigo_comercio(uuid,uuid) from public,anon,authenticated,service_role;

grant usage on schema private to service_role;
grant execute on function private._f5_service_login_preflight(text,text,text,text) to service_role;
grant execute on function private._f5_service_login_result(bigint,boolean) to service_role;
grant execute on function private._f5_service_login_membresia(uuid,uuid) to service_role;
grant execute on function private._f5_service_crear_empleado(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function private._f5_service_resolver_empleado(uuid,uuid,text) to service_role;
grant execute on function private._f5_service_codigo_comercio(uuid,uuid) to service_role;

grant execute on function public.f5_service_login_preflight(text,text,text,text) to service_role;
grant execute on function public.f5_service_login_result(bigint,boolean) to service_role;
grant execute on function public.f5_service_login_membresia(uuid,uuid) to service_role;
grant execute on function public.f5_service_crear_empleado(uuid,uuid,uuid,text,text,text,jsonb) to service_role;
grant execute on function public.f5_service_resolver_empleado(uuid,uuid,text) to service_role;
grant execute on function public.f5_service_codigo_comercio(uuid,uuid) to service_role;
