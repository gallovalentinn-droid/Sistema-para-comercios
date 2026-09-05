-- F6.1: invitaciones internas y provisión idempotente independiente del canal.

create or replace function private._f6_assert_support(p_actor_user_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_actor_user_id is null or not exists (
    select 1
      from private.f6_soporte_operadores o
     where o.user_id=p_actor_user_id
       and o.activo
       and o.revoked_at is null
  ) then
    raise exception 'F6_SUPPORT_FORBIDDEN';
  end if;
end
$function$;

create or replace function private._f6_service_emitir_invitacion(
  p_actor_user_id uuid,
  p_token_hash text,
  p_contacto_hash text,
  p_ip_hash text,
  p_comercio_nombre text,
  p_timezone text,
  p_business_day_cutoff time,
  p_motivo text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization private.f6_alta_autorizaciones%rowtype;
  v_invitation private.f6_invitaciones%rowtype;
  v_now timestamptz := statement_timestamp();
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_contacto_hash is null or p_contacto_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_idempotency_key is null
     or p_comercio_nombre is null or length(trim(p_comercio_nombre)) not between 1 and 160
     or p_timezone is null or not exists (select 1 from pg_timezone_names where name=p_timezone)
     or p_business_day_cutoff is null
     or p_motivo is null or length(trim(p_motivo)) not between 1 and 500 then
    raise exception 'F6_INVITATION_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-support-operator:'||p_actor_user_id::text));
  perform pg_advisory_xact_lock(hashtext('f6-invite-contact:'||p_contacto_hash));

  select a.* into v_authorization
    from private.f6_alta_autorizaciones a
   where a.issued_by=p_actor_user_id
     and a.idempotency_key=p_idempotency_key;
  if found then
    select i.* into strict v_invitation
      from private.f6_invitaciones i
     where i.authorization_id=v_authorization.id
     order by i.created_at,i.id
     limit 1;
    return jsonb_build_object(
      'ok',true,'code','INVITATION_CREATED',
      'invitation_id',v_invitation.id,
      'authorization_id',v_authorization.id,
      'valid_until',v_invitation.valid_until
    );
  end if;

  if exists (
    select 1
      from private.f6_invitaciones i
     where i.contacto_hash=p_contacto_hash
       and i.estado='pendiente'
       and i.valid_until>v_now
  ) then
    raise exception 'F6_INVITATION_ACTIVE_EXISTS';
  end if;

  insert into private.f6_alta_autorizaciones(
    source,estado,comercio_nombre,timezone,business_day_cutoff,
    contacto_hash,issued_by,motivo,idempotency_key
  ) values (
    'invitacion_interna','pendiente',trim(p_comercio_nombre),p_timezone,
    p_business_day_cutoff,p_contacto_hash,p_actor_user_id,trim(p_motivo),
    p_idempotency_key
  ) returning * into v_authorization;

  insert into private.f6_invitaciones(
    authorization_id,token_hash,contacto_hash,ip_hash,estado,issued_by,
    motivo,idempotency_key,issued_at,valid_until
  ) values (
    v_authorization.id,p_token_hash,p_contacto_hash,p_ip_hash,'pendiente',
    p_actor_user_id,trim(p_motivo),p_idempotency_key,v_now,
    v_now+make_interval(secs=>604800)
  ) returning * into v_invitation;

  return jsonb_build_object(
    'ok',true,'code','INVITATION_CREATED',
    'invitation_id',v_invitation.id,
    'authorization_id',v_authorization.id,
    'valid_until',v_invitation.valid_until
  );
end
$function$;

create or replace function private._f6_service_validar_invitacion(p_token_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_available boolean;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE');
  end if;

  select exists (
    select 1
      from private.f6_invitaciones i
     where i.token_hash=p_token_hash
       and i.estado='pendiente'
       and i.valid_until>statement_timestamp()
  ) into v_available;

  if v_available then
    return jsonb_build_object('ok',true,'code','INVITATION_AVAILABLE');
  end if;
  return jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE');
end
$function$;

create or replace function private._f6_provisionar_comercio(
  p_authorization_id uuid,
  p_owner_user_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_authorization private.f6_alta_autorizaciones%rowtype;
  v_comercio_id uuid;
begin
  if p_authorization_id is null or p_owner_user_id is null or p_idempotency_key is null then
    raise exception 'F6_PROVISION_INPUT_INVALID';
  end if;
  if not exists (select 1 from auth.users u where u.id=p_owner_user_id and u.deleted_at is null) then
    raise exception 'F6_OWNER_AUTH_REQUIRED';
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-owner:'||p_owner_user_id::text));
  select a.* into v_authorization
    from private.f6_alta_autorizaciones a
   where a.id=p_authorization_id
   for update;
  if not found then raise exception 'F6_AUTHORIZATION_NOT_AVAILABLE'; end if;

  if v_authorization.estado='consumida'
     and v_authorization.owner_user_id=p_owner_user_id
     and v_authorization.provision_idempotency_key=p_idempotency_key then
    return jsonb_build_object(
      'ok',true,'code','PROVISIONED',
      'comercio_id',v_authorization.comercio_id,
      'onboarding_estado','no_iniciado'
    );
  end if;
  if v_authorization.estado<>'pendiente' then
    raise exception 'F6_AUTHORIZATION_NOT_AVAILABLE';
  end if;
  if exists (
    select 1
      from public.comercio_miembros m
     where m.user_id=p_owner_user_id and m.activo
  ) then
    raise exception 'F6_OWNER_ALREADY_MEMBER';
  end if;

  insert into public.comercios(nombre,timezone,business_day_cutoff,architecture_version,schema_version)
  values (
    v_authorization.comercio_nombre,v_authorization.timezone,
    v_authorization.business_day_cutoff,4,4
  ) returning id into v_comercio_id;

  insert into public.comercio_configuracion(comercio_id)
  values (v_comercio_id);

  insert into public.comercio_miembros(
    comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version
  ) values (
    v_comercio_id,p_owner_user_id,'duenio','{}'::jsonb,
    coalesce(nullif(trim(v_authorization.comercio_nombre),''),'Dueño'),true,1
  );

  insert into public.cajas(comercio_id,codigo,nombre,activa)
  values (v_comercio_id,'principal','Caja principal',true);

  insert into public.comercio_licencias(
    comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
    estado_administrativo,valid_from,valid_until,pause_started_at,
    extension_used_seconds,state_version
  ) values (
    v_comercio_id,false,'beta',30,7,
    'pendiente',null,null,null,0,1
  );

  insert into private.f6_onboarding(
    comercio_id,estado,ultimo_paso,pasos_confirmados,pasos_idempotencia,state_version
  ) values (
    v_comercio_id,'no_iniciado',null,array[]::text[],'{}'::jsonb,1
  );

  update private.f6_alta_autorizaciones
     set estado='consumida',
         owner_user_id=p_owner_user_id,
         provision_idempotency_key=p_idempotency_key,
         comercio_id=v_comercio_id,
         consumed_at=statement_timestamp()
   where id=p_authorization_id;

  return jsonb_build_object(
    'ok',true,'code','PROVISIONED',
    'comercio_id',v_comercio_id,
    'onboarding_estado','no_iniciado'
  );
end
$function$;

create or replace function private._f6_service_consumir_invitacion(
  p_token_hash text,
  p_owner_user_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation private.f6_invitaciones%rowtype;
  v_authorization private.f6_alta_autorizaciones%rowtype;
  v_result jsonb;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
     or p_owner_user_id is null or p_idempotency_key is null then
    return jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE');
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-invite-token:'||p_token_hash));
  select i.* into v_invitation
    from private.f6_invitaciones i
   where i.token_hash=p_token_hash
   for update;
  if not found then
    return jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE');
  end if;

  if v_invitation.estado='consumida' and v_invitation.consumed_by=p_owner_user_id then
    select a.* into v_authorization
      from private.f6_alta_autorizaciones a
     where a.id=v_invitation.authorization_id;
    if v_authorization.provision_idempotency_key=p_idempotency_key then
      return jsonb_build_object(
        'ok',true,'code','INVITATION_CONSUMED',
        'invitation_id',v_invitation.id,
        'comercio_id',v_authorization.comercio_id,
        'onboarding_estado','no_iniciado'
      );
    end if;
  end if;

  if v_invitation.estado<>'pendiente'
     or v_invitation.valid_until<=statement_timestamp()
     or (v_invitation.bound_user_id is not null and v_invitation.bound_user_id<>p_owner_user_id) then
    return jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE');
  end if;

  update private.f6_invitaciones
     set bound_user_id=p_owner_user_id
   where id=v_invitation.id;

  v_result := private._f6_provisionar_comercio(
    v_invitation.authorization_id,p_owner_user_id,p_idempotency_key
  );

  update private.f6_invitaciones
     set estado='consumida',
         consumed_by=p_owner_user_id,
         consumed_at=statement_timestamp()
   where id=v_invitation.id;

  return jsonb_build_object(
    'ok',true,'code','INVITATION_CONSUMED',
    'invitation_id',v_invitation.id,
    'comercio_id',v_result->'comercio_id',
    'onboarding_estado',v_result->'onboarding_estado'
  );
end
$function$;

create or replace function private._f6_service_regenerar_invitacion(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_new_token_hash text,
  p_ip_hash text,
  p_motivo text,
  p_idempotency_key uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_old private.f6_invitaciones%rowtype;
  v_new private.f6_invitaciones%rowtype;
  v_now timestamptz := statement_timestamp();
  v_contacto_hash text;
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_invitation_id is null
     or p_new_token_hash is null or p_new_token_hash !~ '^[0-9a-f]{64}$'
     or p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$'
     or p_motivo is null or length(trim(p_motivo)) not between 1 and 500
     or p_idempotency_key is null then
    raise exception 'F6_INVITATION_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-support-operator:'||p_actor_user_id::text));
  select i.contacto_hash into v_contacto_hash
    from private.f6_invitaciones i
   where i.id=p_invitation_id;
  if v_contacto_hash is null then raise exception 'F6_INVITATION_NOT_AVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtext('f6-invite-contact:'||v_contacto_hash));
  perform pg_advisory_xact_lock(hashtext('f6-invitation:'||p_invitation_id::text));

  select i.* into v_new
    from private.f6_invitaciones i
   where i.issued_by=p_actor_user_id
     and i.idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object(
      'ok',true,'code','INVITATION_REGENERATED',
      'invitation_id',v_new.id,'valid_until',v_new.valid_until
    );
  end if;

  select i.* into v_old
    from private.f6_invitaciones i
   where i.id=p_invitation_id
   for update;
  if not found or v_old.estado<>'pendiente' then
    raise exception 'F6_INVITATION_NOT_AVAILABLE';
  end if;

  insert into private.f6_invitaciones(
    authorization_id,token_hash,contacto_hash,ip_hash,estado,issued_by,
    motivo,idempotency_key,issued_at,valid_until
  ) values (
    v_old.authorization_id,p_new_token_hash,v_old.contacto_hash,p_ip_hash,
    'pendiente',p_actor_user_id,trim(p_motivo),p_idempotency_key,
    v_now,v_now+make_interval(secs=>604800)
  ) returning * into v_new;

  update private.f6_invitaciones
     set estado='revocada',revoked_at=v_now,replaced_by=v_new.id
   where id=v_old.id;

  return jsonb_build_object(
    'ok',true,'code','INVITATION_REGENERATED',
    'invitation_id',v_new.id,'valid_until',v_new.valid_until
  );
end
$function$;

create or replace function private._f6_service_revocar_invitacion(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_motivo text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_invitation private.f6_invitaciones%rowtype;
  v_contacto_hash text;
begin
  perform private._f6_assert_support(p_actor_user_id);
  if p_invitation_id is null or p_motivo is null
     or length(trim(p_motivo)) not between 1 and 500 then
    raise exception 'F6_INVITATION_INPUT_INVALID';
  end if;

  perform pg_advisory_xact_lock(hashtext('f6-support-operator:'||p_actor_user_id::text));
  select i.contacto_hash into v_contacto_hash
    from private.f6_invitaciones i
   where i.id=p_invitation_id;
  if v_contacto_hash is null then raise exception 'F6_INVITATION_NOT_AVAILABLE'; end if;
  perform pg_advisory_xact_lock(hashtext('f6-invite-contact:'||v_contacto_hash));
  perform pg_advisory_xact_lock(hashtext('f6-invitation:'||p_invitation_id::text));

  select i.* into v_invitation
    from private.f6_invitaciones i
   where i.id=p_invitation_id
   for update;
  if not found or v_invitation.estado<>'pendiente' then
    raise exception 'F6_INVITATION_NOT_AVAILABLE';
  end if;

  update private.f6_invitaciones
     set estado='revocada',revoked_at=statement_timestamp()
   where id=p_invitation_id;

  return jsonb_build_object(
    'ok',true,'code','INVITATION_REVOKED','invitation_id',p_invitation_id
  );
end
$function$;

-- PostgREST sólo publica esquemas expuestos. Estos wrappers son la frontera
-- exclusiva de la Edge Function: no exponen tablas y conservan el núcleo en
-- private. Solamente service_role recibe EXECUTE.
create or replace function public.f6_service_emitir_invitacion(
  p_actor_user_id uuid,
  p_token_hash text,
  p_contacto_hash text,
  p_ip_hash text,
  p_comercio_nombre text,
  p_timezone text,
  p_business_day_cutoff time,
  p_motivo text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_service_emitir_invitacion(
    p_actor_user_id,p_token_hash,p_contacto_hash,p_ip_hash,
    p_comercio_nombre,p_timezone,p_business_day_cutoff,p_motivo,p_idempotency_key
  )
$function$;

create or replace function public.f6_service_validar_invitacion(p_token_hash text)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_service_validar_invitacion(p_token_hash)
$function$;

create or replace function public.f6_service_consumir_invitacion(
  p_token_hash text,
  p_owner_user_id uuid,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_service_consumir_invitacion(
    p_token_hash,p_owner_user_id,p_idempotency_key
  )
$function$;

create or replace function public.f6_service_regenerar_invitacion(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_new_token_hash text,
  p_ip_hash text,
  p_motivo text,
  p_idempotency_key uuid
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_service_regenerar_invitacion(
    p_actor_user_id,p_invitation_id,p_new_token_hash,p_ip_hash,p_motivo,p_idempotency_key
  )
$function$;

create or replace function public.f6_service_revocar_invitacion(
  p_actor_user_id uuid,
  p_invitation_id uuid,
  p_motivo text
)
returns jsonb
language sql
security definer
set search_path = ''
as $function$
  select private._f6_service_revocar_invitacion(
    p_actor_user_id,p_invitation_id,p_motivo
  )
$function$;

revoke all on function private._f6_assert_support(uuid)
from public,anon,authenticated,service_role;
revoke all on function private._f6_provisionar_comercio(uuid,uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function private._f6_service_emitir_invitacion(uuid,text,text,text,text,text,time,text,uuid)
from public,anon,authenticated,service_role;
revoke all on function private._f6_service_validar_invitacion(text)
from public,anon,authenticated,service_role;
revoke all on function private._f6_service_consumir_invitacion(text,uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function private._f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)
from public,anon,authenticated,service_role;
revoke all on function private._f6_service_revocar_invitacion(uuid,uuid,text)
from public,anon,authenticated,service_role;

revoke all on function public.f6_service_emitir_invitacion(uuid,text,text,text,text,text,time,text,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.f6_service_validar_invitacion(text)
from public,anon,authenticated,service_role;
revoke all on function public.f6_service_consumir_invitacion(text,uuid,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)
from public,anon,authenticated,service_role;
revoke all on function public.f6_service_revocar_invitacion(uuid,uuid,text)
from public,anon,authenticated,service_role;

grant execute on function public.f6_service_emitir_invitacion(uuid,text,text,text,text,text,time,text,uuid)
to service_role;
grant execute on function public.f6_service_validar_invitacion(text)
to service_role;
grant execute on function public.f6_service_consumir_invitacion(text,uuid,uuid)
to service_role;
grant execute on function public.f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)
to service_role;
grant execute on function public.f6_service_revocar_invitacion(uuid,uuid,text)
to service_role;
