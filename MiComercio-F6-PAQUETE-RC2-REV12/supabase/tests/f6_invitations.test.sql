begin;

do $test$
declare
  v_missing text[];
begin
  select array_agg(signature order by signature)
    into v_missing
    from unnest(array[
      'private._f6_provisionar_comercio(uuid,uuid,uuid)',
      'private._f6_service_emitir_invitacion(uuid,text,text,text,text,text,time without time zone,text,uuid)',
      'private._f6_service_validar_invitacion(text)',
      'private._f6_service_consumir_invitacion(text,uuid,uuid)',
      'private._f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)',
      'private._f6_service_revocar_invitacion(uuid,uuid,text)',
      'public.f6_service_emitir_invitacion(uuid,text,text,text,text,text,time without time zone,text,uuid)',
      'public.f6_service_validar_invitacion(text)',
      'public.f6_service_consumir_invitacion(text,uuid,uuid)',
      'public.f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)',
      'public.f6_service_revocar_invitacion(uuid,uuid,text)'
    ]) as expected(signature)
   where to_regprocedure(signature) is null;

  if coalesce(cardinality(v_missing),0) > 0 then
    raise exception 'F6_INVITATION_FUNCTIONS_MISSING:%', array_to_string(v_missing,',');
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  (
    'f6000000-0000-4000-8000-000000000100','authenticated','authenticated',
    'f6-support@example.invalid','',statement_timestamp(),'{}','{}',
    statement_timestamp(),statement_timestamp()
  ),
  (
    'f6000000-0000-4000-8000-000000000101','authenticated','authenticated',
    'f6-owner@example.invalid','',statement_timestamp(),'{}','{}',
    statement_timestamp(),statement_timestamp()
  ),
  (
    'f6000000-0000-4000-8000-000000000102','authenticated','authenticated',
    'f6-other@example.invalid','',statement_timestamp(),'{}','{}',
    statement_timestamp(),statement_timestamp()
  );

insert into private.f6_soporte_operadores(user_id,nombre,rol)
values ('f6000000-0000-4000-8000-000000000100','Soporte QA','supervisor');

do $test$
declare
  v_issue jsonb;
  v_preview jsonb;
  v_consumed jsonb;
  v_retry jsonb;
  v_other jsonb;
  v_expired_issue jsonb;
  v_revoked_issue jsonb;
  v_regenerated_issue jsonb;
  v_regenerated jsonb;
  v_comercio_id uuid;
  v_invitation_id uuid;
  v_old_invitation_id uuid;
  v_new_invitation_id uuid;
  v_authorization_id uuid;
  v_definition text;
  v_row record;
begin
  v_issue := private._f6_service_emitir_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    repeat('a',64),repeat('b',64),repeat('c',64),
    'Comercio piloto','America/Argentina/Buenos_Aires','04:00'::time,
    'alta beta','f6000000-0000-4000-8000-000000000110'
  );

  if v_issue->>'ok' <> 'true' or v_issue->>'code' <> 'INVITATION_CREATED' then
    raise exception 'F6_INVITATION_CREATE_FAILED:%',v_issue;
  end if;
  if v_issue ? 'token_hash' or v_issue ? 'contacto_hash' or v_issue ? 'ip_hash' then
    raise exception 'F6_INVITATION_HASH_LEAK:%',v_issue;
  end if;

  v_invitation_id := (v_issue->>'invitation_id')::uuid;
  v_authorization_id := (v_issue->>'authorization_id')::uuid;
  select i.* into strict v_row
    from private.f6_invitaciones i
   where i.id=v_invitation_id;
  if v_row.valid_until-v_row.issued_at <> make_interval(secs=>604800) then
    raise exception 'F6_INVITATION_DURATION_INVALID';
  end if;

  v_preview := private._f6_service_validar_invitacion(repeat('a',64));
  if v_preview <> jsonb_build_object('ok',true,'code','INVITATION_AVAILABLE') then
    raise exception 'F6_INVITATION_PREVIEW_INVALID:%',v_preview;
  end if;

  v_consumed := private._f6_service_consumir_invitacion(
    repeat('a',64),
    'f6000000-0000-4000-8000-000000000101',
    'f6000000-0000-4000-8000-000000000111'
  );
  if v_consumed->>'ok' <> 'true' or v_consumed->>'code' <> 'INVITATION_CONSUMED' then
    raise exception 'F6_INVITATION_CONSUME_FAILED:%',v_consumed;
  end if;
  v_comercio_id := (v_consumed->>'comercio_id')::uuid;

  if (select count(*) from public.comercios where id=v_comercio_id) <> 1
     or (select count(*) from public.comercio_configuracion where comercio_id=v_comercio_id) <> 1
     or (select count(*) from public.comercio_miembros where comercio_id=v_comercio_id and user_id='f6000000-0000-4000-8000-000000000101' and rol='duenio' and activo) <> 1
     or (select count(*) from public.cajas where comercio_id=v_comercio_id and activa) <> 1
     or (select count(*) from public.comercio_licencias where comercio_id=v_comercio_id and plan='beta' and estado_administrativo='pendiente' and valid_from is null and valid_until is null) <> 1
     or (select count(*) from private.f6_onboarding where comercio_id=v_comercio_id and estado='no_iniciado') <> 1 then
    raise exception 'F6_PROVISIONING_SHAPE_INVALID';
  end if;

  v_retry := private._f6_service_consumir_invitacion(
    repeat('a',64),
    'f6000000-0000-4000-8000-000000000101',
    'f6000000-0000-4000-8000-000000000111'
  );
  if v_retry->>'comercio_id' <> v_comercio_id::text
     or v_retry->>'invitation_id' <> v_invitation_id::text then
    raise exception 'F6_CONSUME_NOT_IDEMPOTENT:%',v_retry;
  end if;

  v_other := private._f6_service_consumir_invitacion(
    repeat('a',64),
    'f6000000-0000-4000-8000-000000000102',
    'f6000000-0000-4000-8000-000000000112'
  );
  if v_other <> jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE') then
    raise exception 'F6_CONSUMED_INVITATION_ENUMERABLE:%',v_other;
  end if;

  v_expired_issue := private._f6_service_emitir_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    repeat('d',64),repeat('e',64),repeat('f',64),
    'Comercio vencido','America/Argentina/Buenos_Aires','04:00'::time,
    'alta vencida','f6000000-0000-4000-8000-000000000113'
  );
  update private.f6_invitaciones
     set issued_at=statement_timestamp()-make_interval(secs=>604801),
         valid_until=statement_timestamp()-make_interval(secs=>1)
   where id=(v_expired_issue->>'invitation_id')::uuid;
  if private._f6_service_validar_invitacion(repeat('d',64))
       <> jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE') then
    raise exception 'F6_EXPIRED_INVITATION_ENUMERABLE';
  end if;

  v_revoked_issue := private._f6_service_emitir_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    repeat('1',64),repeat('2',64),repeat('3',64),
    'Comercio revocado','America/Argentina/Buenos_Aires','04:00'::time,
    'alta revocable','f6000000-0000-4000-8000-000000000114'
  );
  perform private._f6_service_revocar_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    (v_revoked_issue->>'invitation_id')::uuid,
    'revocación QA'
  );
  if private._f6_service_validar_invitacion(repeat('1',64))
       <> jsonb_build_object('ok',false,'code','INVITATION_NOT_AVAILABLE') then
    raise exception 'F6_REVOKED_INVITATION_ENUMERABLE';
  end if;

  v_regenerated_issue := private._f6_service_emitir_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    repeat('4',64),repeat('5',64),repeat('6',64),
    'Comercio regenerado','America/Argentina/Buenos_Aires','04:00'::time,
    'alta regenerable','f6000000-0000-4000-8000-000000000115'
  );
  v_old_invitation_id := (v_regenerated_issue->>'invitation_id')::uuid;
  v_regenerated := private._f6_service_regenerar_invitacion(
    'f6000000-0000-4000-8000-000000000100',
    v_old_invitation_id,repeat('7',64),repeat('8',64),
    'regeneración QA','f6000000-0000-4000-8000-000000000116'
  );
  v_new_invitation_id := (v_regenerated->>'invitation_id')::uuid;
  if v_new_invitation_id is null
     or not exists (
       select 1 from private.f6_invitaciones
        where id=v_old_invitation_id and estado='revocada'
          and replaced_by=v_new_invitation_id
     )
     or not exists (
       select 1 from private.f6_invitaciones
        where id=v_new_invitation_id and estado='pendiente'
          and token_hash=repeat('7',64)
     ) then
    raise exception 'F6_INVITATION_REGENERATION_INVALID:%',v_regenerated;
  end if;

  select pg_get_functiondef('private._f6_provisionar_comercio(uuid,uuid,uuid)'::regprocedure)
    into v_definition;
  if position('private.f6_alta_autorizaciones' in v_definition)=0
     or position('private.f6_invitaciones' in v_definition)>0 then
    raise exception 'F6_PROVISIONING_COUPLED_TO_INVITATION_CHANNEL';
  end if;

  if (select comercio_id from private.f6_alta_autorizaciones where id=v_authorization_id) <> v_comercio_id then
    raise exception 'F6_AUTHORIZATION_NOT_BOUND_TO_COMMERCE';
  end if;
end
$test$;

do $test$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'private._f6_provisionar_comercio(uuid,uuid,uuid)',
    'private._f6_service_emitir_invitacion(uuid,text,text,text,text,text,time without time zone,text,uuid)',
    'private._f6_service_validar_invitacion(text)',
    'private._f6_service_consumir_invitacion(text,uuid,uuid)',
    'private._f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)',
    'private._f6_service_revocar_invitacion(uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon',v_signature,'EXECUTE')
       or has_function_privilege('authenticated',v_signature,'EXECUTE')
       or has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'F6_INVITATION_FUNCTION_PRIVILEGE_INVALID:%',v_signature;
    end if;
  end loop;

  foreach v_signature in array array[
    'public.f6_service_emitir_invitacion(uuid,text,text,text,text,text,time without time zone,text,uuid)',
    'public.f6_service_validar_invitacion(text)',
    'public.f6_service_consumir_invitacion(text,uuid,uuid)',
    'public.f6_service_regenerar_invitacion(uuid,uuid,text,text,text,uuid)',
    'public.f6_service_revocar_invitacion(uuid,uuid,text)'
  ] loop
    if has_function_privilege('anon',v_signature,'EXECUTE')
       or has_function_privilege('authenticated',v_signature,'EXECUTE')
       or not has_function_privilege('service_role',v_signature,'EXECUTE') then
      raise exception 'F6_INVITATION_EDGE_RPC_PRIVILEGE_INVALID:%',v_signature;
    end if;
  end loop;
end
$test$;

rollback;
