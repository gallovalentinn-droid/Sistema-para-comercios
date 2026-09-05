begin;

do $test$
begin
  if to_regprocedure('public.f6_pilot_gate(uuid,text,boolean,boolean)') is null then
    raise exception 'F6_PILOT_GATE_MISSING';
  end if;
end
$test$;

insert into auth.users(
  id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  'f6000000-0000-4000-8000-000000000600','authenticated','authenticated',
  'f6-pilot-owner@example.invalid','',statement_timestamp(),'{}','{}',statement_timestamp(),statement_timestamp()
);
insert into public.comercios(id,nombre,timezone,business_day_cutoff,architecture_version,schema_version)
values ('f6000000-0000-4000-8000-000000000601','F6 pilot gate QA','America/Argentina/Buenos_Aires','04:00',4,4);
insert into public.comercio_miembros(comercio_id,user_id,rol,permisos,nombre_mostrado,activo,permission_version)
values ('f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000600','duenio','{}','Dueño piloto',true,1);
insert into public.cajas(id,comercio_id,codigo,nombre)
values ('f6000000-0000-4000-8000-000000000602','f6000000-0000-4000-8000-000000000601','PILOT-1','Caja piloto');
insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre)
values ('f6000000-0000-4000-8000-000000000603','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000600','f6000000-0000-4000-8000-000000000602','Dispositivo piloto');
insert into public.migraciones_f4(
  comercio_id,estado,f43_version,f43_cutover_at,f43_cutover_by,
  f43_legacy_user_id,f43_legacy_revision,f43_legacy_sha256,f43_rollback_until
) values (
  'f6000000-0000-4000-8000-000000000601','v4_only','4.3.0-qa3',statement_timestamp(),
  'f6000000-0000-4000-8000-000000000600','f6000000-0000-4000-8000-000000000600',1,repeat('a',64),statement_timestamp()+interval '7 days'
);
insert into public.caja_sesiones(
  id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date,estado,provisional
) values
  ('f6000000-0000-4000-8000-000000000610','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000602','f6000000-0000-4000-8000-000000000603','f6000000-0000-4000-8000-000000000600',statement_timestamp()-interval '8 hours',private.business_date('f6000000-0000-4000-8000-000000000601',statement_timestamp()),'cerrada',false),
  ('f6000000-0000-4000-8000-000000000611','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000602','f6000000-0000-4000-8000-000000000603','f6000000-0000-4000-8000-000000000600',statement_timestamp()-interval '4 hours',private.business_date('f6000000-0000-4000-8000-000000000601',statement_timestamp()),'cerrada',false),
  ('f6000000-0000-4000-8000-000000000612','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000602','f6000000-0000-4000-8000-000000000603','f6000000-0000-4000-8000-000000000600',statement_timestamp()-interval '2 hours',private.business_date('f6000000-0000-4000-8000-000000000601',statement_timestamp()),'requiere_conciliacion',true);
insert into public.caja_sesion_segmentos(segment_id,comercio_id,root_session_id,opened_at_device,closed_at_device)
values ('f6000000-0000-4000-8000-000000000613','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000612',statement_timestamp()-interval '2 hours',statement_timestamp()-interval '1 hour');
insert into public.cierres_caja(
  id,comercio_id,caja_sesion_id,session_segment_id,closed_at_device,cant_ventas,total_ventas,por_forma,estado
) values
  ('f6000000-0000-4000-8000-000000000620','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000610',null,statement_timestamp()-interval '5 hours',3,1200,'{"efectivo":1200}','registrado'),
  ('f6000000-0000-4000-8000-000000000621','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000611',null,statement_timestamp()-interval '1 hour',2,800,'{"transferencia":800}','registrado'),
  ('f6000000-0000-4000-8000-000000000622','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000612','f6000000-0000-4000-8000-000000000613',statement_timestamp()-interval '30 minutes',1,100,'{"efectivo":100}','requiere_conciliacion');

do $test$
declare v_gate jsonb;
begin
  begin
    insert into public.cierres_caja(id,comercio_id,caja_sesion_id,closed_at_device)
    values ('f6000000-0000-4000-8000-000000000623','f6000000-0000-4000-8000-000000000601','f6000000-0000-4000-8000-000000000610',statement_timestamp());
    raise exception 'F6_EXPECTED_DUPLICATE_CLOSE_DENIAL';
  exception when unique_violation then null;
  end;

  if (select count(*) from public.cierres_caja where comercio_id='f6000000-0000-4000-8000-000000000601')<>3
     or (select estado from public.cierres_caja where id='f6000000-0000-4000-8000-000000000622')<>'requiere_conciliacion' then
    raise exception 'F6_INDEPENDENT_CLOSE_FIXTURE_INVALID';
  end if;

  v_gate:=public.f6_pilot_gate('f6000000-0000-4000-8000-000000000601','build-equivocado',false,false);
  if v_gate->>'ready'<>'false'
     or v_gate#>>'{checks,build_identity,ok}'<>'false'
     or v_gate#>>'{checks,v4_only,ok}'<>'true'
     or v_gate#>>'{checks,baseline_reproducible,ok}'<>'false'
     or v_gate#>>'{checks,pin_precondition,ok}'<>'false'
     or v_gate#>>'{checks,cierres_independientes,ok}'<>'true'
     or v_gate#>>'{checks,provisional_conciliation,ok}'<>'true' then
    raise exception 'F6_PILOT_GATE_FLAGS_MISSING_OR_WRONG:%',v_gate;
  end if;

  v_gate:=public.f6_pilot_gate('f6000000-0000-4000-8000-000000000601','6.0.0-f6-rc1',true,true);
  if v_gate->>'ready'<>'true' or (select count(*) from jsonb_object_keys(v_gate->'checks'))<>6 then
    raise exception 'F6_PILOT_GATE_SHOULD_PASS:%',v_gate;
  end if;

  if has_function_privilege('anon','public.f6_pilot_gate(uuid,text,boolean,boolean)','EXECUTE')
     or has_function_privilege('authenticated','public.f6_pilot_gate(uuid,text,boolean,boolean)','EXECUTE')
     or not has_function_privilege('service_role','public.f6_pilot_gate(uuid,text,boolean,boolean)','EXECUTE') then
    raise exception 'F6_PILOT_GATE_PRIVILEGES_INVALID';
  end if;
end
$test$;

rollback;
