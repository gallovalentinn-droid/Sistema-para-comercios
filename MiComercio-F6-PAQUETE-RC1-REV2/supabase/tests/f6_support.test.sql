begin;

do $test$
declare v_missing text[];
begin
  select array_agg(signature order by signature) into v_missing
    from unnest(array[
      'private._f6_bootstrap_support_operator(uuid,text)',
      'private._f6_service_panel(uuid,uuid,text,text)',
      'private._f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)',
      'private._f6_rate_limit_preflight(text,jsonb,uuid,uuid)',
      'public.f6_service_bootstrap_support_operator(uuid,text)',
      'public.f6_service_panel(uuid,uuid,text,text)',
      'public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)',
      'public.f6_service_rate_limit_preflight(text,jsonb,uuid,uuid)'
    ]) as expected(signature)
   where to_regprocedure(signature) is null;
  if coalesce(cardinality(v_missing),0)>0 then
    raise exception 'F6_SUPPORT_FUNCTIONS_MISSING:%',array_to_string(v_missing,',');
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
  ('f6000000-0000-4000-8000-000000000500','authenticated','authenticated','f6-support-a@example.invalid','',statement_timestamp(),'{}','{"name":"Soporte A"}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000501','authenticated','authenticated','f6-support-b@example.invalid','',statement_timestamp(),'{}','{"name":"Soporte B"}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000502','authenticated','authenticated','f6-support-c@example.invalid','',statement_timestamp(),'{}','{"name":"Soporte C"}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000504','authenticated','authenticated','f6-support-without-name@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()),
  ('f6000000-0000-4000-8000-000000000503','authenticated','authenticated','f6-commercial-owner@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp());

select private._f6_bootstrap_support_operator(
  'f6000000-0000-4000-8000-000000000500','Alta inicial controlada de soporte QA'
);
select private._f6_bootstrap_support_operator(
  'f6000000-0000-4000-8000-000000000501','Segundo operador para límites QA'
);
select private._f6_bootstrap_support_operator(
  'f6000000-0000-4000-8000-000000000502','Tercer operador para límites QA'
);
select private._f6_bootstrap_support_operator(
  'f6000000-0000-4000-8000-000000000504','Operador sin nombre para probar el fallback QA'
);

insert into public.comercios(id,nombre,timezone,business_day_cutoff,architecture_version,schema_version)
values ('f6000000-0000-4000-8000-000000000510','Comercio soporte QA','America/Argentina/Buenos_Aires','04:00',4,4);
insert into public.comercio_miembros(comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version)
values ('f6000000-0000-4000-8000-000000000510','f6000000-0000-4000-8000-000000000503','duenio','{}','Dueño QA',true,1);
insert into public.comercio_licencias(
  comercio_id,activo,plan,limite_ia_diario,offline_grace_days,
  estado_administrativo,valid_from,valid_until,pause_started_at,
  extension_used_seconds,state_version
) values (
  'f6000000-0000-4000-8000-000000000510',true,'beta',30,7,
  'activa',statement_timestamp()-interval '1 day',statement_timestamp()+interval '6 days',
  null,0,1
);
insert into private.f6_onboarding(comercio_id,estado,ultimo_paso,pasos_confirmados)
values ('f6000000-0000-4000-8000-000000000510','en_curso','datos_comercio',array['datos_comercio']);

insert into private.f6_alta_autorizaciones(
  id,source,estado,comercio_nombre,timezone,business_day_cutoff,contacto_hash,
  issued_by,motivo,idempotency_key
) values (
  'f6000000-0000-4000-8000-000000000511','invitacion_interna','pendiente','Secreto no proyectable',
  'America/Argentina/Buenos_Aires','04:00',repeat('b',64),
  'f6000000-0000-4000-8000-000000000500','fixture',gen_random_uuid()
);
insert into private.f6_invitaciones(
  id,authorization_id,token_hash,contacto_hash,ip_hash,estado,issued_by,motivo,
  idempotency_key,issued_at,valid_until
) values (
  'f6000000-0000-4000-8000-000000000512','f6000000-0000-4000-8000-000000000511',
  repeat('a',64),repeat('b',64),repeat('c',64),'pendiente',
  'f6000000-0000-4000-8000-000000000500','fixture',gen_random_uuid(),
  statement_timestamp(),statement_timestamp()+make_interval(secs=>604800)
);

do $test$
declare
  v_panel jsonb;
  v_text text;
  v_result jsonb;
  v_before timestamptz;
  v_event private.f6_soporte_eventos%rowtype;
  v_failed boolean;
begin
  if (select count(*) from private.f6_soporte_operadores where activo)<>4 then
    raise exception 'F6_SUPPORT_BOOTSTRAP_FAILED';
  end if;
  if (select nombre from private.f6_soporte_operadores where user_id='f6000000-0000-4000-8000-000000000504')
       <> 'Operador f6000000' then
    raise exception 'F6_SUPPORT_BOOTSTRAP_NULL_NAME_FALLBACK_FAILED';
  end if;
  if (select count(*) from private.f6_soporte_eventos where accion='operator_bootstrap' and ok)<>4 then
    raise exception 'F6_SUPPORT_BOOTSTRAP_NOT_AUDITED';
  end if;

  v_panel:=private._f6_service_panel(
    'f6000000-0000-4000-8000-000000000500',
    'f6000000-0000-4000-8000-000000000510','5.0.0-f5-rc2',repeat('d',64)
  );
  v_text:=v_panel::text;
  if v_panel->>'ok'<>'true'
     or v_panel#>>'{licencia,estado_efectivo}'<>'activa'
     or v_panel#>>'{onboarding,estado}'<>'en_curso'
     or v_text like '%'||repeat('a',64)||'%'
     or v_text like '%'||repeat('b',64)||'%'
     or v_text like '%'||repeat('c',64)||'%'
     or v_text like '%f6-commercial-owner@example.invalid%'
     or lower(v_text) like '%pin_hash%'
     or lower(v_text) like '%encrypted_password%'
     or lower(v_text) like '%"db"%' then
    raise exception 'F6_SUPPORT_PANEL_NOT_REDACTED:%',v_panel;
  end if;

  begin
    perform private._f6_service_panel(
      'f6000000-0000-4000-8000-000000000503',
      'f6000000-0000-4000-8000-000000000510','5.0.0-f5-rc2',repeat('d',64)
    );
    raise exception 'F6_EXPECTED_COMMERCIAL_USER_DENIAL';
  exception when others then
    if sqlerrm='F6_EXPECTED_COMMERCIAL_USER_DENIAL' then raise; end if;
    if sqlerrm not like '%F6_SUPPORT_FORBIDDEN%' then raise; end if;
  end;

  update private.f6_soporte_operadores
     set activo=false,revoked_at=statement_timestamp(),updated_at=statement_timestamp()
   where user_id='f6000000-0000-4000-8000-000000000501';
  begin
    perform private._f6_service_panel(
      'f6000000-0000-4000-8000-000000000501',
      'f6000000-0000-4000-8000-000000000510','5.0.0-f5-rc2',repeat('d',64)
    );
    raise exception 'F6_EXPECTED_INACTIVE_OPERATOR_DENIAL';
  exception when others then
    if sqlerrm='F6_EXPECTED_INACTIVE_OPERATOR_DENIAL' then raise; end if;
    if sqlerrm not like '%F6_SUPPORT_FORBIDDEN%' then raise; end if;
  end;
  update private.f6_soporte_operadores
     set activo=true,revoked_at=null,updated_at=statement_timestamp()
   where user_id='f6000000-0000-4000-8000-000000000501';

  select valid_until into v_before from public.comercio_licencias
   where comercio_id='f6000000-0000-4000-8000-000000000510';
  v_result:=private._f6_service_comando(
    'f6000000-0000-4000-8000-000000000500',
    'f6000000-0000-4000-8000-000000000510','license_extend','{"dias":1}',
    'f6000000-0000-4000-8000-000000000520','Extensión QA autorizada','5.0.0-f5-rc2'
  );
  if v_result->>'ok'<>'true'
     or (select valid_until from public.comercio_licencias where comercio_id='f6000000-0000-4000-8000-000000000510')<>v_before+interval '1 day' then
    raise exception 'F6_SUPPORT_ALLOWED_COMMAND_FAILED:%',v_result;
  end if;
  select * into strict v_event from private.f6_soporte_eventos
   where correlation_id='f6000000-0000-4000-8000-000000000520';
  if not v_event.ok or v_event.accion<>'license_extend'
     or v_event.motivo<>'Extensión QA autorizada'
     or v_event.antes='{}'::jsonb or v_event.despues='{}'::jsonb then
    raise exception 'F6_SUPPORT_ALLOWED_COMMAND_NOT_AUDITED';
  end if;

  v_result:=private._f6_service_comando(
    'f6000000-0000-4000-8000-000000000500',
    'f6000000-0000-4000-8000-000000000510','sale_edit','{"total":0}',
    'f6000000-0000-4000-8000-000000000521','Intento denegado QA','5.0.0-f5-rc2'
  );
  if v_result->>'ok'<>'false' or v_result->>'code'<>'F6_SUPPORT_ACTION_UNKNOWN'
     or not exists(select 1 from private.f6_soporte_eventos
                    where correlation_id='f6000000-0000-4000-8000-000000000521'
                      and accion='command_rejected' and not ok) then
    raise exception 'F6_SUPPORT_DENIED_COMMAND_NOT_AUDITED:%',v_result;
  end if;

  if lower(pg_get_functiondef('private._f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)'::regprocedure))
       ~ '(execute[[:space:]]|p_table|p_sql)' then
    raise exception 'F6_SUPPORT_DYNAMIC_COMMERCIAL_EDIT_SURFACE';
  end if;

  begin
    update private.f6_soporte_eventos set motivo='alterado' where correlation_id='f6000000-0000-4000-8000-000000000520';
    raise exception 'F6_EXPECTED_APPEND_UPDATE_DENIAL';
  exception when others then
    if sqlerrm='F6_EXPECTED_APPEND_UPDATE_DENIAL' then raise; end if;
    if sqlerrm not like '%F6_AUDIT_APPEND_ONLY%' then raise; end if;
  end;
  begin
    delete from private.f6_soporte_eventos where correlation_id='f6000000-0000-4000-8000-000000000520';
    raise exception 'F6_EXPECTED_APPEND_DELETE_DENIAL';
  exception when others then
    if sqlerrm='F6_EXPECTED_APPEND_DELETE_DENIAL' then raise; end if;
    if sqlerrm not like '%F6_AUDIT_APPEND_ONLY%' then raise; end if;
  end;
  begin
    truncate table private.f6_soporte_eventos;
    raise exception 'F6_EXPECTED_APPEND_TRUNCATE_DENIAL';
  exception when others then
    if sqlerrm='F6_EXPECTED_APPEND_TRUNCATE_DENIAL' then raise; end if;
    if sqlerrm not like '%F6_AUDIT_APPEND_ONLY%' then raise; end if;
  end;
end
$test$;

do $test$
declare
  v_result jsonb;
  v_i integer;
  v_token text:=encode(extensions.digest('rate-token','sha256'),'hex');
  v_ip text:=encode(extensions.digest('rate-ip','sha256'),'hex');
  v_commerce text:=encode(extensions.digest('rate-commerce','sha256'),'hex');
begin
  -- Validar/consumir: 5 por par en 15 min, 20 por token/h y 50 por IP/h.
  for v_i in 1..6 loop
    v_result:=private._f6_rate_limit_preflight('invite_validate',jsonb_build_object('token_hash',v_token,'ip_hash',v_ip),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=5 and (v_result->>'limited')::boolean) or (v_i=6 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_TOKEN_IP_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
  for v_i in 1..21 loop
    v_result:=private._f6_rate_limit_preflight('invite_consume',jsonb_build_object('token_hash',encode(extensions.digest('token-20','sha256'),'hex'),'ip_hash',encode(extensions.digest('ip-rot-'||v_i,'sha256'),'hex')),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=20 and (v_result->>'limited')::boolean) or (v_i=21 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_TOKEN_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
  for v_i in 1..51 loop
    v_result:=private._f6_rate_limit_preflight('invite_validate',jsonb_build_object('token_hash',encode(extensions.digest('token-rot-'||v_i,'sha256'),'hex'),'ip_hash',encode(extensions.digest('ip-50','sha256'),'hex')),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=50 and (v_result->>'limited')::boolean) or (v_i=51 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_IP_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;

  -- Emitir/regenerar: 20 por operador/h y 5 por contacto/h.
  for v_i in 1..21 loop
    v_result:=private._f6_rate_limit_preflight('invite_issue',jsonb_build_object('contacto_hash',encode(extensions.digest('contact-rot-'||v_i,'sha256'),'hex')),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=20 and (v_result->>'limited')::boolean) or (v_i=21 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_OPERATOR_ISSUE_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
  for v_i in 1..6 loop
    v_result:=private._f6_rate_limit_preflight('invite_regenerate',jsonb_build_object('invitation_id','f6000000-0000-4000-8000-000000000512'),'f6000000-0000-4000-8000-000000000501',gen_random_uuid());
    if (v_i<=5 and (v_result->>'limited')::boolean) or (v_i=6 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_CONTACT_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;

  -- Licencias: 10 por operador/h y 5 por comercio/h.
  for v_i in 1..11 loop
    v_result:=private._f6_rate_limit_preflight('license_mutation',jsonb_build_object('comercio_hash',encode(extensions.digest('commerce-rot-'||v_i,'sha256'),'hex')),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=10 and (v_result->>'limited')::boolean) or (v_i=11 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_OPERATOR_LICENSE_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
  for v_i in 1..6 loop
    v_result:=private._f6_rate_limit_preflight('license_mutation',jsonb_build_object('comercio_hash',v_commerce),'f6000000-0000-4000-8000-000000000501',gen_random_uuid());
    if (v_i<=5 and (v_result->>'limited')::boolean) or (v_i=6 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_COMMERCE_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;

  -- Panel: 120 por operador/5 min y 300 por IP/5 min.
  for v_i in 1..121 loop
    v_result:=private._f6_rate_limit_preflight('support_panel',jsonb_build_object('ip_hash',encode(extensions.digest('panel-ip-rot-'||v_i,'sha256'),'hex')),'f6000000-0000-4000-8000-000000000500',gen_random_uuid());
    if (v_i<=120 and (v_result->>'limited')::boolean) or (v_i=121 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_OPERATOR_PANEL_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
  -- Aislamos la segunda frontera: ahora medimos IP sin arrastrar el tope del operador.
  delete from private.f6_rate_intentos where superficie='support_panel';
  for v_i in 1..301 loop
    v_result:=private._f6_rate_limit_preflight('support_panel',jsonb_build_object('ip_hash',encode(extensions.digest('panel-ip-300','sha256'),'hex')),
      case v_i%3 when 0 then 'f6000000-0000-4000-8000-000000000500'::uuid when 1 then 'f6000000-0000-4000-8000-000000000501'::uuid else 'f6000000-0000-4000-8000-000000000502'::uuid end,
      gen_random_uuid());
    if (v_i<=300 and (v_result->>'limited')::boolean) or (v_i=301 and not (v_result->>'limited')::boolean) then
      raise exception 'F6_RATE_IP_PANEL_BOUNDARY:%:%',v_i,v_result;
    end if;
  end loop;
end
$test$;

do $test$
begin
  if has_function_privilege('anon','private._f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','private._f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('service_role','private._f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.f6_service_panel(uuid,uuid,text,text)','EXECUTE')
     or has_function_privilege('anon','public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)','EXECUTE')
     or has_function_privilege('authenticated','public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)','EXECUTE')
     or not has_function_privilege('service_role','public.f6_service_comando(uuid,uuid,text,jsonb,uuid,text,text)','EXECUTE') then
    raise exception 'F6_SUPPORT_EXECUTE_PRIVILEGES_INVALID';
  end if;
end
$test$;

rollback;
