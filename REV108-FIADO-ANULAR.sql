-- Anulación online auditada de cobros de fiado. Sin cambios a registros originales.
begin;

create table if not exists private.fiado_correcciones_v1 (
  id uuid primary key,
  comercio_id uuid not null references public.comercios(id),
  pago_original_id uuid not null references public.pagos_fiado(id),
  operation_id text not null,
  fingerprint text not null,
  actor_user_id uuid not null,
  motivo text not null check(length(btrim(motivo)) between 3 and 500),
  accion text not null check(accion in ('corregir','anular')),
  antes jsonb not null,
  despues jsonb not null,
  egreso_id uuid not null references public.egresos(id),
  pago_reemplazo_id uuid references public.pagos_fiado(id),
  ajuste_ids uuid[] not null,
  created_at timestamptz not null default now(),
  unique(comercio_id,pago_original_id),
  unique(comercio_id,operation_id)
);
alter table private.fiado_correcciones_v1 add column if not exists estado_cuenta jsonb;
alter table private.fiado_correcciones_v1 enable row level security;
revoke all on private.fiado_correcciones_v1 from public,anon,authenticated,service_role;
drop trigger if exists fiado_correcciones_v1_append_only on private.fiado_correcciones_v1;
create trigger fiado_correcciones_v1_append_only before update or delete on private.fiado_correcciones_v1
for each row execute function private._f5_append_only();

-- A QR payment needs an exactly matching QR compensating movement.
alter table public.egresos drop constraint if exists egresos_forma_check;
alter table public.egresos add constraint egresos_forma_check
check (forma in ('efectivo','transferencia','qr','tarjeta'));

create or replace function private._fiado_proteger_compensacion_v1()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from private.fiado_correcciones_v1 c
            where c.comercio_id=new.comercio_id and c.egreso_id=new.egreso_id) then
    raise exception 'FIADO_COMPENSACION_NO_REVERTIBLE';
  end if;
  return new;
end $$;
drop trigger if exists fiado_proteger_compensacion_v1 on public.egreso_reversiones;
create trigger fiado_proteger_compensacion_v1 before insert on public.egreso_reversiones
for each row execute function private._fiado_proteger_compensacion_v1();

create or replace function private._fiado_capacidades_v1(p_comercio_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v_owner boolean; v_anular boolean; v_v4 boolean;
begin
  if auth.uid() is null or not private.es_miembro(p_comercio_id) then raise exception 'COMERCIO_FORBIDDEN'; end if;
  select exists(select 1 from public.comercio_miembros m where m.comercio_id=p_comercio_id
    and m.user_id=auth.uid() and m.rol='duenio' and m.activo and m.revoked_at is null) into v_owner;
  v_anular:=private.tiene_permiso(p_comercio_id,'fiado_operar') and exists(select 1 from public.comercio_miembros where comercio_id=p_comercio_id and user_id=auth.uid() and activo and revoked_at is null);
  select coalesce((select estado='v4_only' from public.migraciones_f4 where comercio_id=p_comercio_id),false) into v_v4;
  return jsonb_build_object('version','fiado-correccion-v1','corregir',v_owner,'anular',v_anular,
    'online_only',true,'owner_only',false,'requiere_sesion_abierta',true,
    'requiere_pago_canonico_aplicado',true,'modo',case when v_v4 then 'v4_only' else 'shadow' end,
    'legacy_cas_required',not v_v4,'legacy_revision',case when not v_v4 then
      (select revision from public.datos_kiosco where id=auth.uid()) end,
    'correcciones',case when v_anular then coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'pago_original_id',pago_original_id,'pago_reemplazo_id',pago_reemplazo_id,
      'motivo',motivo,'accion',accion,'antes',antes,'despues',despues,'created_at',created_at,'estado_cuenta',estado_cuenta))
      from private.fiado_correcciones_v1 where comercio_id=p_comercio_id),'[]'::jsonb) else '[]'::jsonb end);
end $$;

create or replace function private._corregir_pago_fiado_v1(p_operation_id text,p_comercio_id uuid,p_payload jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_uid uuid:=auth.uid(); v_now timestamptz:=statement_timestamp();
  v_original public.pagos_fiado%rowtype; v_customer public.clientes%rowtype;
  v_db public.datos_kiosco%rowtype; v_segment public.caja_sesion_segmentos%rowtype;
  v_session public.caja_sesiones%rowtype; v_audit private.fiado_correcciones_v1%rowtype;
  v_id uuid:=gen_random_uuid(); v_egreso uuid:=gen_random_uuid(); v_new uuid;
  v_adjust uuid; v_adjust_ids uuid[]:='{}'; v_closed uuid;
  v_device uuid:=(p_payload->>'device_id')::uuid;
  v_root uuid:=(p_payload->>'caja_sesion_id')::uuid;
  v_seg uuid:=(p_payload->>'session_segment_id')::uuid;
  v_action text:=p_payload->>'accion'; v_reason text:=btrim(p_payload->>'motivo');
  v_amount numeric; v_form text; v_remaining numeric; v_applied numeric;
  v_business date; v_v4 boolean; v_legacy_user uuid; v_fingerprint text:=md5(p_payload::text);
  v_legacy_balance numeric; v_canonical_balance numeric; v_legacy_close jsonb; v_snapshot jsonb;
  v_result jsonb; v_rows jsonb; v_puts jsonb:='[]'; v_existing jsonb;
  v_legacy jsonb; v_client jsonb; v_correction jsonb; v_metadata jsonb;
  v_payments jsonb; v_adjustments jsonb:='[]'; v_expenses jsonb; v_closes jsonb;
  v_legacy_id text; v_client_id text; r record;
begin
  perform private.assert_operable(p_comercio_id);
  if not exists(select 1 from public.comercio_miembros where comercio_id=p_comercio_id and user_id=v_uid and activo and revoked_at is null) then raise exception 'COMERCIO_FORBIDDEN'; end if;
  if v_action='anular' then
    if not private.tiene_permiso(p_comercio_id,'fiado_operar') then raise exception 'FIADO_PERMISSION_REQUIRED'; end if;
  else
    perform private._f6_assert_owner(v_uid,p_comercio_id);
  end if;
  if exists(select 1 from public.migraciones_f4 where comercio_id=p_comercio_id and estado='rollback') then raise exception 'FIADO_ROLLBACK'; end if;
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_payload ? 'lease_id' then raise exception 'FIADO_ONLINE_ONLY'; end if;
  if v_action is null or v_action not in ('corregir','anular') or v_reason is null or length(v_reason) not between 3 and 500 then
    raise exception 'FIADO_CORRECCION_INVALIDA'; end if;
  v_amount:=case when v_action='anular' then 0 else (p_payload->>'monto')::numeric end;
  v_form:=case when v_action='anular' then null else p_payload->>'forma' end;
  if v_amount is null or v_amount<0 or v_amount<>round(v_amount,2) or v_amount>99999999999999.99
    or (v_action='corregir' and (v_amount<=0 or v_form is null or v_form not in ('efectivo','transferencia','qr','tarjeta'))) then
    raise exception 'FIADO_CORRECCION_INVALIDA'; end if;

  -- Reserve before checking CAS so a lost response can safely replay the exact request.
  v_existing:=private.reservar_operacion(p_operation_id,p_comercio_id,'corregir_pago_fiado_v1');
  if v_existing is not null then
    select * into v_audit from private.fiado_correcciones_v1 where comercio_id=p_comercio_id and operation_id=p_operation_id;
    if not found or v_audit.fingerprint<>v_fingerprint or v_audit.actor_user_id<>v_uid then raise exception 'FIADO_IDEMPOTENCY_CONFLICT'; end if;
    return v_existing||jsonb_build_object('idempotent',true,'legacy_current_revision',
      (select revision from public.datos_kiosco where id=v_uid));
  end if;
  select * into v_original from public.pagos_fiado where comercio_id=p_comercio_id and id=(p_payload->>'pago_id')::uuid for update;
  if not found then raise exception 'FIADO_CANONICAL_NOT_READY'; end if;
  if exists(select 1 from private.fiado_correcciones_v1 where comercio_id=p_comercio_id and pago_original_id=v_original.id) then raise exception 'FIADO_PAGO_YA_CORREGIDO'; end if;
  if v_amount=v_original.monto and v_form=v_original.forma then raise exception 'FIADO_SIN_CAMBIOS'; end if;
  select * into v_customer from public.clientes where comercio_id=p_comercio_id and id=v_original.cliente_id and deleted_at is null for update;
  if not found then raise exception 'FIADO_CLIENTE_INVALIDO'; end if;
  if not exists(select 1 from public.comercio_dispositivos where id=v_device and comercio_id=p_comercio_id and user_id=v_uid and revoked_at is null) then raise exception 'FIADO_DEVICE_INVALIDO'; end if;
  select * into v_session from public.caja_sesiones where id=v_root and comercio_id=p_comercio_id for update;
  if not found or v_session.estado<>'abierta' or v_session.closed_at_device is not null
    or v_session.device_id<>v_device or v_session.abierta_por is distinct from v_uid then raise exception 'FIADO_SESION_NO_ABIERTA'; end if;
  select * into v_segment from public.caja_sesion_segmentos where segment_id=v_seg and comercio_id=p_comercio_id and root_session_id=v_root for update;
  if not found or v_segment.closed_at_device is not null or v_segment.interrumpido_at_device is not null
    or v_segment.opened_at_device>v_now or exists(select 1 from public.cierres_caja where comercio_id=p_comercio_id and session_segment_id=v_seg) then
    raise exception 'FIADO_SEGMENTO_NO_ABIERTO'; end if;
  perform 1 from public.fiado_cargos where comercio_id=p_comercio_id and cliente_id=v_customer.id order by id for update;
  select coalesce(sum(monto),0) into v_applied from public.fiado_aplicaciones
    where comercio_id=p_comercio_id and cliente_id=v_customer.id and credito_tipo='pago' and credito_id=v_original.id;
  -- A legacy-only payment or incomplete saldoBase backfill must never invent debt/maturity.
  if v_applied<>v_original.monto then raise exception 'FIADO_APLICACIONES_INCOMPLETAS'; end if;
  select coalesce(estado='v4_only',false),f43_legacy_user_id into v_v4,v_legacy_user from public.migraciones_f4 where comercio_id=p_comercio_id;
  v_v4:=coalesce(v_v4,false);
  v_legacy_id:=coalesce(v_original.legacy_id,'v4:'||v_original.id::text);
  v_client_id:=coalesce(v_customer.legacy_id,'v4:'||v_customer.id::text);
  if not v_v4 then
    if v_legacy_user is null then
      select user_id into strict v_legacy_user from public.comercio_miembros where comercio_id=p_comercio_id and rol='duenio' and activo and revoked_at is null;
    end if;
    select * into v_db from public.datos_kiosco where id=v_legacy_user for update;
    if not found then raise exception 'FIADO_CANONICAL_NOT_READY'; end if;
    if v_legacy_user=v_uid and (not (p_payload ? 'legacy_revision') or v_db.revision is distinct from (p_payload->>'legacy_revision')::bigint) then raise exception 'FIADO_LEGACY_CAS_CONFLICT'; end if;
    if p_payload->>'legacy_pago_id' is distinct from v_legacy_id then raise exception 'FIADO_LEGACY_PAGO_MISMATCH'; end if;
    select value into v_legacy from jsonb_array_elements(v_db.db->'pagos') where value->>'id'=v_legacy_id;
    if v_legacy is null or (v_legacy->>'monto')::numeric<>v_original.monto or v_legacy->>'forma' is distinct from v_original.forma
      or v_legacy->>'clienteId' is distinct from v_client_id then raise exception 'FIADO_LEGACY_PAGO_MISMATCH'; end if;
    if (select count(*) from jsonb_array_elements(v_db.db->'pagos') where value->>'id'=v_legacy_id)<>1
      or (v_legacy ? '_v4id' and v_legacy->>'_v4id'<>v_original.id::text) then raise exception 'FIADO_LEGACY_PAGO_MISMATCH'; end if;
    select value into v_client from jsonb_array_elements(v_db.db->'clientes') where value->>'id'=v_client_id;
    if v_client is null then raise exception 'FIADO_LEGACY_CLIENTE_MISSING'; end if;
    if (select count(*) from jsonb_array_elements(v_db.db->'clientes') where value->>'id'=v_client_id)<>1
      or (v_client ? '_v4id' and v_client->>'_v4id'<>v_customer.id::text)
      or coalesce((v_client->>'saldoBase')::numeric,0)<>v_customer.saldo_base then raise exception 'FIADO_LEGACY_CLIENTE_MISMATCH'; end if;
    select coalesce(sum(c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0)),0)
      into v_canonical_balance from public.fiado_cargos c where c.comercio_id=p_comercio_id and c.cliente_id=v_customer.id;
    v_legacy_balance:=v_customer.saldo_base
      +coalesce((select sum(case when value->>'forma'='fiado' then (value->>'total')::numeric
        when value->>'forma'='mixto' then coalesce((select sum((pg->>'monto')::numeric)
          from jsonb_array_elements(coalesce(value->'pagos','[]')) pg where pg->>'forma'='fiado'),0) else 0 end)
        from jsonb_array_elements(coalesce(v_db.db->'ventas','[]'))
        where value->>'clienteId'=v_client_id and not coalesce((value->>'anulada')::boolean,false)),0)
      +coalesce((select sum((value->>'monto')::numeric) from jsonb_array_elements(coalesce(v_db.db->'ajustesFiado','[]')) where value->>'clienteId'=v_client_id),0)
      -coalesce((select sum((value->>'monto')::numeric) from jsonb_array_elements(v_db.db->'pagos') where value->>'clienteId'=v_client_id),0);
    if abs(v_legacy_balance-v_canonical_balance)>0.01 then raise exception 'FIADO_LEGACY_BALANCE_MISMATCH'; end if;
  end if;

  v_business:=private.business_date(p_comercio_id,v_now);
  if v_action='corregir' then v_new:=gen_random_uuid(); end if;
  v_correction:=jsonb_build_object('id',v_id,'pago_original_id',v_original.id,'pago_reemplazo_id',v_new,
    'accion',v_action,'motivo',v_reason,'actor_user_id',v_uid,'created_at',v_now,
    'antes',jsonb_build_object('monto',v_original.monto,'forma',v_original.forma),
    'despues',jsonb_build_object('monto',v_amount,'forma',v_form),'egreso_id',v_egreso);
  -- Restore exactly the original allocation slices, retaining due dates and surcharge class.
  for r in select a.monto as aplicado,c.* from public.fiado_aplicaciones a join public.fiado_cargos c on c.comercio_id=a.comercio_id and c.id=a.cargo_id
    where a.comercio_id=p_comercio_id and a.credito_tipo='pago' and a.credito_id=v_original.id order by c.vence_fecha,c.id
  loop
    v_adjust:=gen_random_uuid(); v_adjust_ids:=array_append(v_adjust_ids,v_adjust);
    v_metadata:=v_correction||jsonb_build_object('tipo','correccion_pago_fiado','operation_id',p_operation_id,
      'cargo_original_id',r.id,'recargable_original',r.recargable);
    insert into public.ajustes_fiado(id,comercio_id,legacy_id,cliente_id,caja_sesion_id,device_id,tipo,monto_delta,motivo,
      fecha_origen_device,occurred_at_device,business_date,vence_fecha,base_cargo_ids,metadata)
    values(v_adjust,p_comercio_id,'v4:'||v_adjust,v_customer.id,v_root,v_device,
      case when r.recargable then 'ajuste' else 'recargo' end,r.aplicado,'Corrección de pago: '||v_reason,
      r.fecha_origen_device,v_now,v_business,r.vence_fecha,array[r.id],v_metadata);
    insert into public.fiado_cargos(comercio_id,cliente_id,origen_tipo,origen_id,monto,fecha_origen_device,business_date,vence_fecha,recargable)
    values(p_comercio_id,v_customer.id,case when r.recargable then 'ajuste' else 'recargo' end,v_adjust,r.aplicado,
      r.fecha_origen_device,r.business_date,r.vence_fecha,r.recargable);
  end loop;
  insert into public.egresos(id,comercio_id,legacy_id,caja_sesion_id,device_id,monto,forma,caja_fisica,motivo,nota,occurred_at_device,business_date,session_segment_id)
  values(v_egreso,p_comercio_id,'v4:'||v_egreso,v_root,v_device,v_original.monto,v_original.forma,
    case when v_original.forma='efectivo' then 'general' else '' end,'Compensación de pago fiado',
    v_reason||' [correccion:'||v_id||']',v_now,v_business,v_seg);
  if v_new is not null then
    insert into public.pagos_fiado(id,comercio_id,legacy_id,cliente_id,caja_sesion_id,device_id,monto,forma,nota,occurred_at_device,business_date,session_segment_id)
    values(v_new,p_comercio_id,'v4:'||v_new,v_customer.id,v_root,v_device,v_amount,v_form,
      'Sustituye pago '||v_legacy_id||': '||v_reason,v_now,v_business,v_seg);
    v_remaining:=private.aplicar_credito_fiado(p_comercio_id,v_customer.id,'pago',v_new,v_amount);
    if v_remaining>0 then raise exception 'PAGO_SUPERA_DEUDA'; end if;
  end if;
  -- Canonical POST-correction aging frontier. Replaying historical FIFO in JavaScript
  -- would otherwise move later payments onto the restored older debt. Entity IDs,
  -- rather than timestamps, let the client preserve and apply newer local records.
  select jsonb_build_object('version',1,'created_at',v_now,'correccion_id',v_id,
    'cliente_id',v_customer.id,'cliente_legacy_id',v_client_id,'saldo_base_incluido',true,
    'cargos_abiertos',coalesce((select jsonb_agg(jsonb_build_object(
      'id',c.id,'origen_tipo',c.origen_tipo,'origen_id',c.origen_id,
      'origen_legacy_id',case when c.origen_tipo='venta' then
          (select coalesce(v.legacy_id,'v4:'||v.id::text) from public.ventas v where v.id=c.origen_id and v.comercio_id=p_comercio_id)
        when c.origen_tipo in ('ajuste','recargo') then
          (select coalesce(a.legacy_id,'v4:'||a.id::text) from public.ajustes_fiado a where a.id=c.origen_id and a.comercio_id=p_comercio_id)
        when c.origen_tipo='saldo_base' then v_client_id end,
      'monto',c.monto,'restante',c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0),
      'fecha_origen_device',c.fecha_origen_device,'vence_fecha',c.vence_fecha,'recargable',c.recargable
    ) order by c.vence_fecha,c.fecha_origen_device,c.id)
      from public.fiado_cargos c where c.comercio_id=p_comercio_id and c.cliente_id=v_customer.id
      and c.monto>coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0)),'[]'::jsonb),
    'incluidos',jsonb_build_object(
      'ventas',coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'legacy_id',coalesce(v.legacy_id,'v4:'||v.id::text)) order by v.id)
        from public.ventas v where v.comercio_id=p_comercio_id and v.cliente_id=v_customer.id and v.monto_fiado>0),'[]'::jsonb),
      'pagos',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'legacy_id',coalesce(p.legacy_id,'v4:'||p.id::text)) order by p.id)
        from public.pagos_fiado p where p.comercio_id=p_comercio_id and p.cliente_id=v_customer.id),'[]'::jsonb),
      'ajustes',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'legacy_id',coalesce(a.legacy_id,'v4:'||a.id::text)) order by a.id)
        from public.ajustes_fiado a where a.comercio_id=p_comercio_id and a.cliente_id=v_customer.id),'[]'::jsonb)
    )) into v_snapshot;
  v_correction:=v_correction||jsonb_build_object('estado_cuenta',v_snapshot);
  -- These rows were created in this transaction and have never been published.
  -- No pre-existing payment, charge, application, adjustment or audit row is updated.
  update public.ajustes_fiado set metadata=metadata||jsonb_build_object('estado_cuenta',v_snapshot)
    where comercio_id=p_comercio_id and id=any(v_adjust_ids);
  insert into private.fiado_correcciones_v1(id,comercio_id,pago_original_id,operation_id,fingerprint,actor_user_id,motivo,accion,antes,despues,egreso_id,pago_reemplazo_id,ajuste_ids,estado_cuenta)
  values(v_id,p_comercio_id,v_original.id,p_operation_id,v_fingerprint,v_uid,v_reason,v_action,v_correction->'antes',v_correction->'despues',v_egreso,v_new,v_adjust_ids,v_snapshot);
  select cierre_id into v_closed from public.cierre_pagos_fiado where comercio_id=p_comercio_id and pago_id=v_original.id limit 1;
  if v_closed is not null then
    insert into public.cierre_ajustes(comercio_id,cierre_id,tipo,operacion_tipo,operacion_id,monto,motivo,metadata)
    values(p_comercio_id,v_closed,'ajuste_manual','correccion_pago_fiado',v_id,v_amount-v_original.monto,
      'Corrección posterior al cierre: '||v_reason,v_correction||jsonb_build_object('operation_id',p_operation_id));
    update public.cierres_caja set estado='requiere_conciliacion' where comercio_id=p_comercio_id and id=v_closed;
  end if;
  select coalesce(jsonb_agg(to_jsonb(p)),'[]') into v_payments from public.pagos_fiado p where p.id=v_new;
  select coalesce(jsonb_agg(to_jsonb(a)),'[]') into v_adjustments from public.ajustes_fiado a where a.id=any(v_adjust_ids);
  select jsonb_agg(to_jsonb(e)) into v_expenses from public.egresos e where e.id=v_egreso;
  select coalesce(jsonb_agg(to_jsonb(c)),'[]') into v_closes from public.cierre_ajustes c where c.operacion_id=v_id and c.comercio_id=p_comercio_id;
  v_rows:=jsonb_build_object('pagos_fiado',v_payments,'ajustes_fiado',v_adjustments,'egresos',v_expenses,'cierre_ajustes',v_closes);

  -- Legacy patch is built only from the LOCKED authoritative JSON. Never rebuild it from V4.
  if not v_v4 then
    v_legacy:=v_legacy||jsonb_build_object('correccionPago',v_correction);
    v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','pagos','valor',v_legacy));
    for r in select value a from jsonb_array_elements(v_adjustments) loop
      v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','ajustesFiado','valor',jsonb_build_object(
        'id',r.a->>'legacy_id','_v4id',r.a->>'id','_v4remote',true,'_v4deviceId',v_device,
        '_v4cajaSesionId',v_root,'_v4sessionSegmentId',v_seg,'clienteId',v_client_id,'monto',r.a->'monto_delta',
        'tipo',r.a->>'tipo','motivo',r.a->>'motivo','fecha',r.a->'occurred_at_device','fechaOrigen',left(r.a->>'fecha_origen_device',10),
        'venceFiado',r.a->'vence_fecha','metadata',r.a->'metadata')));
    end loop;
    v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','egresos','valor',jsonb_build_object(
      'id','v4:'||v_egreso,'_v4id',v_egreso,'_v4remote',true,'_v4deviceId',v_device,'_v4cajaSesionId',v_root,
      '_v4sessionSegmentId',v_seg,'monto',v_original.monto,'forma',v_original.forma,
      'caja',case when v_original.forma='efectivo' then 'general' else '' end,
      'motivo','Compensación de pago fiado','nota',v_reason||' [correccion:'||v_id||']','fecha',v_now,'correccionPago',v_correction)));
    if v_new is not null then
      v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','pagos','valor',jsonb_build_object(
        'id','v4:'||v_new,'_v4id',v_new,'_v4remote',true,'_v4deviceId',v_device,'_v4cajaSesionId',v_root,
        '_v4sessionSegmentId',v_seg,'clienteId',v_client_id,'monto',v_amount,'forma',v_form,
        'nota','Sustituye pago '||v_legacy_id||': '||v_reason,'fecha',v_now)));
    end if;
    -- Keep the cached legacy saldo consistent while retaining saldoBase and every unrelated key.
    v_client:=v_client||jsonb_build_object('saldo',greatest(0,v_legacy_balance+v_original.monto-v_amount));
    v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','clientes','valor',v_client));
    if v_closed is not null then
      select value into v_legacy_close from jsonb_array_elements(coalesce(v_db.db->'cierres','[]'))
        where value->>'_v4id'=v_closed::text or value->>'id'=(select coalesce(legacy_id,'v4:'||id::text) from public.cierres_caja where id=v_closed);
      if v_legacy_close is not null then
        for r in select value c from jsonb_array_elements(v_closes) loop
          v_legacy_close:=v_legacy_close||jsonb_build_object('_v4estado','requiere_conciliacion','_v4requiereConciliacion',true,
            '_v4ajustes',coalesce(v_legacy_close->'_v4ajustes','[]')||jsonb_build_array(jsonb_build_object(
              'id',r.c->'id','tipo',r.c->'tipo','operacionTipo',r.c->'operacion_tipo','operacionId',r.c->'operacion_id',
              'monto',r.c->'monto','motivo',r.c->'motivo','metadata',r.c->'metadata','estado',r.c->'estado','createdAt',r.c->'created_at')));
        end loop;
        v_puts:=v_puts||jsonb_build_array(jsonb_build_object('coleccion','cierres','valor',v_legacy_close));
      end if;
    end if;
    for r in select value p from jsonb_array_elements(v_puts) loop
      v_db.db:=jsonb_set(v_db.db,array[r.p->>'coleccion'],
        coalesce((select jsonb_agg(value) from jsonb_array_elements(coalesce(v_db.db->(r.p->>'coleccion'),'[]'))
          where value->>'id' is distinct from r.p->'valor'->>'id'),'[]')||jsonb_build_array(r.p->'valor'),true);
    end loop;
    update public.datos_kiosco set db=v_db.db,revision=revision+1,actualizado_en=v_now where id=v_legacy_user returning revision into v_db.revision;
  end if;
  v_result:=jsonb_build_object('ok',true,'version','fiado-correccion-v1','idempotent',false,'correccion',v_correction,
    'rows',v_rows,'legacy',case when not v_v4 and v_legacy_user=v_uid then jsonb_build_object('revision',v_db.revision,'puts',v_puts) else null end);
  return private.completar_operacion(p_operation_id,p_comercio_id,v_result);
end $$;

create or replace function public.fiado_capacidades_v1(p_comercio_id uuid)
returns jsonb language sql set search_path='' as $$ select private._fiado_capacidades_v1(p_comercio_id) $$;
create or replace function public.corregir_pago_fiado_v1(p_operation_id text,p_comercio_id uuid,p_payload jsonb)
returns jsonb language sql set search_path='' as $$ select private._corregir_pago_fiado_v1(p_operation_id,p_comercio_id,p_payload) $$;
revoke all on function private._fiado_proteger_compensacion_v1() from public,anon,authenticated,service_role;
revoke all on function private._fiado_capacidades_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function private._corregir_pago_fiado_v1(text,uuid,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.fiado_capacidades_v1(uuid) from public,anon,authenticated,service_role;
revoke all on function public.corregir_pago_fiado_v1(text,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function private._fiado_capacidades_v1(uuid),private._corregir_pago_fiado_v1(text,uuid,jsonb),
  public.fiado_capacidades_v1(uuid),public.corregir_pago_fiado_v1(text,uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
