-- F6.2: onboarding reanudable, dueño-only y comprobación sin efectos de negocio.

create or replace function private._f6_assert_owner(
  p_actor_user_id uuid,
  p_comercio_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_actor_user_id is null or p_comercio_id is null or not exists (
    select 1
      from public.comercio_miembros m
     where m.comercio_id=p_comercio_id
       and m.user_id=p_actor_user_id
       and m.rol='duenio'
       and m.activo
       and m.revoked_at is null
  ) then
    raise exception 'F6_ONBOARDING_OWNER_REQUIRED';
  end if;
end
$function$;

create or replace function private._f6_onboarding_result(p_comercio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_row private.f6_onboarding%rowtype;
  v_steps constant text[]:=array[
    'datos_comercio','caja_inicial','modulos','productos',
    'empleados','clientes','comprobacion_final'
  ]::text[];
  v_next text;
begin
  select o.* into strict v_row
    from private.f6_onboarding o
   where o.comercio_id=p_comercio_id;
  if v_row.estado<>'completo' then
    v_next:=v_steps[cardinality(v_row.pasos_confirmados)+1];
  end if;
  return jsonb_build_object(
    'ok',true,
    'comercio_id',v_row.comercio_id,
    'estado',v_row.estado,
    'ultimo_paso',v_row.ultimo_paso,
    'siguiente_paso',v_next,
    'pasos_confirmados',to_jsonb(v_row.pasos_confirmados),
    'state_version',v_row.state_version,
    'updated_at',v_row.updated_at,
    'completed_at',v_row.completed_at
  );
end
$function$;

create or replace function private._f6_confirmar_paso(
  p_actor_user_id uuid,
  p_comercio_id uuid,
  p_paso text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_row private.f6_onboarding%rowtype;
  v_steps constant text[]:=array[
    'datos_comercio','caja_inicial','modulos','productos',
    'empleados','clientes','comprobacion_final'
  ]::text[];
  v_expected text;
  v_existing_key text;
  v_caja_id uuid;
  v_item jsonb;
begin
  perform private._f6_assert_owner(p_actor_user_id,p_comercio_id);
  if p_idempotency_key is null or p_payload is null or jsonb_typeof(p_payload)<>'object' then
    raise exception 'F6_ONBOARDING_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-onboarding:'||p_comercio_id::text));
  select o.* into strict v_row
    from private.f6_onboarding o
   where o.comercio_id=p_comercio_id
   for update;

  if v_row.estado='completo' then return private._f6_onboarding_result(p_comercio_id); end if;
  if p_paso=any(v_row.pasos_confirmados) then
    v_existing_key:=v_row.pasos_idempotencia->>p_paso;
    if v_existing_key=p_idempotency_key::text then
      return private._f6_onboarding_result(p_comercio_id);
    end if;
    raise exception 'F6_ONBOARDING_STEP_ALREADY_CONFIRMED';
  end if;

  v_expected:=v_steps[cardinality(v_row.pasos_confirmados)+1];
  if p_paso is distinct from v_expected or p_paso='comprobacion_final' then
    raise exception 'F6_ONBOARDING_STEP_ORDER';
  end if;

  if p_paso='datos_comercio' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
       where k not in ('nombre','timezone','business_day_cutoff')
    ) or jsonb_typeof(p_payload->'nombre')<>'string'
      or length(trim(p_payload->>'nombre')) not between 1 and 160
      or jsonb_typeof(p_payload->'timezone')<>'string'
      or not exists (select 1 from pg_timezone_names where name=p_payload->>'timezone')
      or jsonb_typeof(p_payload->'business_day_cutoff')<>'string'
      or (p_payload->>'business_day_cutoff') !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9])?$' then
      raise exception 'F6_ONBOARDING_DATOS_INVALID';
    end if;
    update public.comercios
       set nombre=trim(p_payload->>'nombre'),
           timezone=p_payload->>'timezone',
           business_day_cutoff=(p_payload->>'business_day_cutoff')::time,
           updated_at=statement_timestamp()
     where id=p_comercio_id;

  elsif p_paso='caja_inicial' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
       where k not in ('codigo','nombre','fondo_caja')
    ) or jsonb_typeof(p_payload->'codigo')<>'string'
      or length(trim(p_payload->>'codigo')) not between 1 and 40
      or (p_payload->>'codigo') !~ '^[A-Za-z0-9._-]+$'
      or jsonb_typeof(p_payload->'nombre')<>'string'
      or length(trim(p_payload->>'nombre')) not between 1 and 120
      or jsonb_typeof(p_payload->'fondo_caja')<>'number'
      or (p_payload->>'fondo_caja')::numeric<0 then
      raise exception 'F6_ONBOARDING_CAJA_INVALID';
    end if;
    select c.id into v_caja_id
      from public.cajas c
     where c.comercio_id=p_comercio_id and c.deleted_at is null
     order by c.created_at,c.id
     limit 1
     for update;
    if v_caja_id is null then
      insert into public.cajas(comercio_id,codigo,nombre,activa)
      values(p_comercio_id,lower(trim(p_payload->>'codigo')),trim(p_payload->>'nombre'),true)
      returning id into v_caja_id;
    else
      update public.cajas
         set codigo=lower(trim(p_payload->>'codigo')),
             nombre=trim(p_payload->>'nombre'),activa=true,
             updated_at=statement_timestamp()
       where id=v_caja_id;
    end if;
    update public.comercio_configuracion
       set fondo_caja=(p_payload->>'fondo_caja')::numeric,
           updated_at=statement_timestamp()
     where comercio_id=p_comercio_id;

  elsif p_paso='modulos' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) k
       where k not in ('modulo_fiado','modulo_vencimientos','modulo_cigarros','whatsapp_dueno')
    ) or jsonb_typeof(p_payload->'modulo_fiado')<>'boolean'
      or jsonb_typeof(p_payload->'modulo_vencimientos')<>'boolean'
      or jsonb_typeof(p_payload->'modulo_cigarros')<>'boolean'
      or jsonb_typeof(p_payload->'whatsapp_dueno')<>'string'
      or length(p_payload->>'whatsapp_dueno')>40 then
      raise exception 'F6_ONBOARDING_MODULOS_INVALID';
    end if;
    update public.comercio_configuracion
       set modulo_fiado=(p_payload->>'modulo_fiado')::boolean,
           modulo_vencimientos=(p_payload->>'modulo_vencimientos')::boolean,
           modulo_cigarros=(p_payload->>'modulo_cigarros')::boolean,
           whatsapp_dueno=p_payload->>'whatsapp_dueno',
           updated_at=statement_timestamp()
     where comercio_id=p_comercio_id;

  elsif p_paso='productos' then
    if exists (
      select 1 from jsonb_object_keys(p_payload) k where k<>'productos'
    ) or jsonb_typeof(p_payload->'productos')<>'array'
      or jsonb_array_length(p_payload->'productos') not between 1 and 50 then
      raise exception 'F6_ONBOARDING_PRODUCTOS_INVALID';
    end if;
    for v_item in select value from jsonb_array_elements(p_payload->'productos') loop
      if jsonb_typeof(v_item)<>'object' or exists (
        select 1 from jsonb_object_keys(v_item) k
         where k not in ('nombre','rubro','ean','costo','precio','stock_base')
      ) or jsonb_typeof(v_item->'nombre')<>'string'
        or length(trim(v_item->>'nombre')) not between 1 and 160
        or jsonb_typeof(v_item->'precio')<>'number'
        or (v_item->>'precio')::numeric<0
        or coalesce(jsonb_typeof(v_item->'costo'),'number')<>'number'
        or coalesce((v_item->>'costo')::numeric,0)<0
        or coalesce(jsonb_typeof(v_item->'stock_base'),'number')<>'number'
        or coalesce((v_item->>'stock_base')::numeric,0)<0
        or length(coalesce(v_item->>'rubro',''))>120
        or length(coalesce(v_item->>'ean',''))>80 then
        raise exception 'F6_ONBOARDING_PRODUCTO_INVALID';
      end if;
      insert into public.productos(
        id,comercio_id,ean,nombre,rubro,costo,precio,stock_base,
        created_at_device,updated_at_device
      ) values (
        gen_random_uuid(),p_comercio_id,coalesce(v_item->>'ean',''),
        trim(v_item->>'nombre'),coalesce(v_item->>'rubro',''),
        coalesce((v_item->>'costo')::numeric,0),(v_item->>'precio')::numeric,
        coalesce((v_item->>'stock_base')::numeric,0),statement_timestamp(),statement_timestamp()
      );
    end loop;

  elsif p_paso in ('empleados','clientes') then
    if p_payload<>jsonb_build_object('omitido',true) then
      raise exception 'F6_ONBOARDING_OPTIONAL_REQUIERE_OMITIR';
    end if;
  end if;

  update private.f6_onboarding
     set estado='en_curso',
         ultimo_paso=p_paso,
         pasos_confirmados=array_append(pasos_confirmados,p_paso),
         pasos_idempotencia=pasos_idempotencia||jsonb_build_object(p_paso,p_idempotency_key::text),
         state_version=state_version+1,
         updated_at=statement_timestamp()
   where comercio_id=p_comercio_id;
  return private._f6_onboarding_result(p_comercio_id);
end
$function$;

create or replace function private._f6_comprobar_onboarding(
  p_actor_user_id uuid,
  p_comercio_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_onboarding private.f6_onboarding%rowtype;
  v_license public.comercio_licencias%rowtype;
  v_before jsonb;
  v_after jsonb;
  v_now timestamptz:=statement_timestamp();
begin
  perform private._f6_assert_owner(p_actor_user_id,p_comercio_id);
  perform pg_advisory_xact_lock(hashtext('f6-onboarding:'||p_comercio_id::text));
  select o.* into strict v_onboarding
    from private.f6_onboarding o
   where o.comercio_id=p_comercio_id
   for update;
  if v_onboarding.estado='completo' then return private._f6_onboarding_result(p_comercio_id); end if;
  if not array['datos_comercio','caja_inicial','modulos','productos','empleados','clientes']::text[]
       <@ v_onboarding.pasos_confirmados then
    raise exception 'F6_ONBOARDING_INCOMPLETO';
  end if;
  if not exists (
    select 1 from public.cajas c
     where c.comercio_id=p_comercio_id and c.activa and c.deleted_at is null
  ) then raise exception 'F6_ONBOARDING_CAJA_REQUERIDA'; end if;
  if not exists (
    select 1 from public.productos p
     where p.comercio_id=p_comercio_id and p.deleted_at is null
  ) then raise exception 'F6_ONBOARDING_PRODUCTO_REQUERIDO'; end if;
  if not exists (
    select 1 from public.comercio_configuracion c where c.comercio_id=p_comercio_id
  ) then raise exception 'F6_ONBOARDING_CONFIG_REQUERIDA'; end if;

  select l.* into strict v_license
    from public.comercio_licencias l
   where l.comercio_id=p_comercio_id and l.plan='beta'
   for update;
  if v_license.estado_administrativo<>'pendiente'
     or v_license.valid_from is not null or v_license.valid_until is not null then
    raise exception 'F6_ONBOARDING_LICENSE_NOT_PENDING';
  end if;
  v_before:=to_jsonb(v_license);
  update public.comercio_licencias
     set activo=true,estado_administrativo='activa',
         valid_from=v_now,valid_until=v_now+make_interval(secs=>604800),
         pause_started_at=null,state_version=state_version+1
   where comercio_id=p_comercio_id and plan='beta'
   returning to_jsonb(comercio_licencias.*) into v_after;

  update private.f6_onboarding
     set estado='completo',ultimo_paso='comprobacion_final',
         pasos_confirmados=array_append(pasos_confirmados,'comprobacion_final'),
         state_version=state_version+1,updated_at=v_now,completed_at=v_now
   where comercio_id=p_comercio_id;

  insert into private.f6_licencia_eventos(
    comercio_id,actor_user_id,accion,motivo,antes,despues,correlation_id
  ) values (
    p_comercio_id,p_actor_user_id,'onboarding_activate',
    'Activación automática al completar onboarding',v_before,v_after,gen_random_uuid()
  );
  return private._f6_onboarding_result(p_comercio_id);
end
$function$;

create or replace function public.f6_onboarding_actual(p_comercio_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_assert_owner((select auth.uid()),p_comercio_id);
  select private._f6_onboarding_result(p_comercio_id)
$function$;

create or replace function public.f6_confirmar_paso(
  p_comercio_id uuid,
  p_paso text,
  p_payload jsonb,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_confirmar_paso(
    (select auth.uid()),p_comercio_id,p_paso,p_payload,p_idempotency_key
  )
$function$;

create or replace function public.f6_comprobar_onboarding(p_comercio_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_comprobar_onboarding((select auth.uid()),p_comercio_id)
$function$;

revoke all on function private._f6_assert_owner(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f6_onboarding_result(uuid) from public,anon,authenticated,service_role;
revoke all on function private._f6_confirmar_paso(uuid,uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function private._f6_comprobar_onboarding(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_onboarding_actual(uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_confirmar_paso(uuid,text,jsonb,uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_comprobar_onboarding(uuid) from public,anon,authenticated,service_role;

grant execute on function public.f6_onboarding_actual(uuid) to authenticated;
grant execute on function public.f6_confirmar_paso(uuid,text,jsonb,uuid) to authenticated;
grant execute on function public.f6_comprobar_onboarding(uuid) to authenticated;
