-- Docker local only. Every fixture and business change is rolled back.
\set ON_ERROR_STOP on
begin;
do $$ begin
  if to_regprocedure('public.corregir_pago_fiado_v1(text,uuid,jsonb)') is null then
    raise exception 'TEST_FAIL: correction RPC missing';
  end if;
  if to_regprocedure('public.fiado_capacidades_v1(uuid)') is null then
    raise exception 'TEST_FAIL: capabilities RPC missing';
  end if;
end $$;
do $$
declare
  owner_id uuid:=gen_random_uuid(); employee_id uuid:=gen_random_uuid(); shop uuid:=gen_random_uuid();
  device uuid:=gen_random_uuid(); cash uuid:=gen_random_uuid(); root uuid:=gen_random_uuid();
  old_root uuid:=gen_random_uuid(); segment uuid:=gen_random_uuid(); customer uuid:=gen_random_uuid();
  payment uuid:=gen_random_uuid(); charge uuid:=gen_random_uuid(); closing uuid:=gen_random_uuid();
  missing_payment uuid:=gen_random_uuid(); missing_legacy uuid:=gen_random_uuid();
  split_customer uuid:=gen_random_uuid(); split_payment uuid:=gen_random_uuid();
  split_charge_a uuid:=gen_random_uuid(); split_charge_b uuid:=gen_random_uuid();
  aging_customer uuid:=gen_random_uuid(); january_sale uuid:=gen_random_uuid(); february_sale uuid:=gen_random_uuid();
  january_charge uuid:=gen_random_uuid(); february_charge uuid:=gen_random_uuid();
  january_payment uuid:=gen_random_uuid(); february_payment uuid:=gen_random_uuid();
  ec uuid:=gen_random_uuid(); ed uuid:=gen_random_uuid(); er uuid:=gen_random_uuid(); es uuid:=gen_random_uuid();
  req jsonb; response jsonb; again jsonb; original_json jsonb; saved jsonb; patch record;
  balance numeric; n integer; replacement uuid; expense uuid;
begin
  insert into auth.users(id) values(owner_id),(employee_id);
  insert into public.comercios(id,nombre) values(shop,'Fixture correccion fiado rollback');
  insert into public.comercio_miembros(comercio_id,user_id,rol,activo) values(shop,owner_id,'duenio',true),(shop,employee_id,'empleado',true);
  insert into public.comercio_licencias(comercio_id,activo,plan,estado_administrativo,valid_from,valid_until)
    values(shop,true,'beta','activa',now()-interval '1 day',now()+interval '30 days');
  insert into public.cajas(id,comercio_id,codigo,nombre) values(cash,shop,'fiadotest','Fixture');
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre) values(device,shop,owner_id,cash,'Fixture');
  insert into public.caja_sesiones(id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date,estado)
    values(root,shop,cash,device,owner_id,now()-interval '1 hour',current_date,'abierta'),
      (old_root,shop,cash,device,owner_id,now()-interval '20 days',current_date-20,'cerrada');
  update public.caja_sesiones set closed_at_device=now()-interval '10 days' where id=old_root;
  insert into public.caja_sesion_segmentos(segment_id,comercio_id,root_session_id,opened_at_device)
    values(segment,shop,root,now()-interval '1 hour');
  insert into public.clientes(id,comercio_id,legacy_id,nombre,saldo_base,alta_at_device)
    values(customer,shop,'cliente-fiado-test','Cliente saldoBase',500,now()-interval '30 days');
  insert into public.fiado_cargos(id,comercio_id,cliente_id,origen_tipo,monto,fecha_origen_device,business_date,vence_fecha,recargable)
    values(charge,shop,customer,'saldo_base',500,now()-interval '30 days',current_date-30,current_date-15,true);
  insert into public.pagos_fiado(id,comercio_id,legacy_id,cliente_id,caja_sesion_id,device_id,monto,forma,nota,occurred_at_device,business_date)
    values(payment,shop,'pago-fiado-test',customer,old_root,device,100,'efectivo','Original intacto',now()-interval '11 days',current_date-11);
  insert into public.fiado_aplicaciones(comercio_id,cliente_id,credito_tipo,credito_id,cargo_id,monto)
    values(shop,customer,'pago',payment,charge,100);
  insert into public.cierres_caja(id,comercio_id,caja_sesion_id,closed_at_device,total_ventas,esperado_general,contado_general)
    values(closing,shop,old_root,now()-interval '10 days',1234,567,567);
  insert into public.cierre_pagos_fiado(cierre_id,pago_id,comercio_id) values(closing,payment,shop);
  original_json:=jsonb_build_object('id','pago-fiado-test','_v4id',payment,'clienteId','cliente-fiado-test',
    'monto',100,'forma','efectivo','nota','Original intacto','fecha',now()-interval '11 days');
  insert into public.datos_kiosco(id,revision,db) values(owner_id,7,jsonb_build_object(
    'pagos',jsonb_build_array(original_json),'clientes',jsonb_build_array(jsonb_build_object(
      'id','cliente-fiado-test','_v4id',customer,'nombre','Cliente saldoBase','saldoBase',500,'saldo',400)),
    'cierres',jsonb_build_array(jsonb_build_object('id','cierre-fiado-test','_v4id',closing,'esperadoGeneral',567,'total',1234,'contadoGeneral',567)),
    'productos',jsonb_build_array(jsonb_build_object('id','producto-ajeno','nombre','Preservar','stock',17)),
    'config',jsonb_build_object('pinHash','preservar','nroVenta',999),'noConocido',jsonb_build_object('valor',42)));
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  if public.fiado_capacidades_v1(shop)->>'version'<>'fiado-correccion-v1' then raise exception 'TEST_FAIL capabilities'; end if;
  req:=jsonb_build_object('pago_id',payment,'accion','corregir','monto',60,'forma','qr','motivo','Error de monto y medio',
    'device_id',device,'caja_sesion_id',root,'session_segment_id',segment,'legacy_revision',7,'legacy_pago_id','pago-fiado-test');
  begin
    perform public.corregir_pago_fiado_v1('fixture-cas-error',shop,req||'{"legacy_revision":6}');
    raise exception 'TEST_FAIL CAS accepted';
  exception when others then if sqlerrm<>'FIADO_LEGACY_CAS_CONFLICT' then raise; end if; end;
  begin
    perform public.corregir_pago_fiado_v1('fixture-overpayment',shop,req||'{"monto":1000}');
    raise exception 'TEST_FAIL overpayment accepted';
  exception when others then if sqlerrm<>'PAGO_SUPERA_DEUDA' then raise; end if; end;
  if exists(select 1 from private.fiado_correcciones_v1 where comercio_id=shop)
    or (select revision from public.datos_kiosco where id=owner_id)<>7 then raise exception 'TEST_FAIL failed correction not atomic'; end if;
  begin
    perform public.corregir_pago_fiado_v1('fixture-offline',shop,req||jsonb_build_object('lease_id',gen_random_uuid()));
    raise exception 'TEST_FAIL offline accepted';
  exception when others then if sqlerrm<>'FIADO_ONLINE_ONLY' then raise; end if; end;
  begin
    perform public.corregir_pago_fiado_v1('fixture-invalid-segment',shop,req||jsonb_build_object('session_segment_id',gen_random_uuid()));
    raise exception 'TEST_FAIL nonexistent segment accepted';
  exception when others then if sqlerrm<>'FIADO_SEGMENTO_NO_ABIERTO' then raise; end if; end;
  begin
    update public.datos_kiosco set db=jsonb_set(db,'{clientes,0,saldoBase}','600') where id=owner_id;
    perform public.corregir_pago_fiado_v1('fixture-mismatch-saldobase',shop,req);
    raise exception 'TEST_FAIL inconsistent saldoBase accepted';
  exception when others then if sqlerrm<>'FIADO_LEGACY_CLIENTE_MISMATCH' then raise; end if; end;
  begin
    update public.datos_kiosco set db=jsonb_set(db,'{ajustesFiado}',jsonb_build_array(jsonb_build_object('id','unsynced','clienteId','cliente-fiado-test','monto',20))) where id=owner_id;
    perform public.corregir_pago_fiado_v1('fixture-mismatch-ledger',shop,req);
    raise exception 'TEST_FAIL inconsistent ledger accepted';
  exception when others then if sqlerrm<>'FIADO_LEGACY_BALANCE_MISMATCH' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',employee_id::text,true);
  begin
    perform public.corregir_pago_fiado_v1('fixture-owner-error',shop,req);
    raise exception 'TEST_FAIL employee accepted';
  exception when others then if sqlerrm<>'F6_ONBOARDING_OWNER_REQUIRED' then raise; end if; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  response:=public.corregir_pago_fiado_v1('fixture-correct-payment',shop,req);
  if response->'correccion'->'estado_cuenta'->>'version' is distinct from '1' then raise exception 'TEST_FAIL canonical aging snapshot missing'; end if;
  replacement:=(response->'correccion'->>'pago_reemplazo_id')::uuid;
  expense:=(response->'correccion'->>'egreso_id')::uuid;
  if response->'legacy'->>'revision'<>'8' or response->>'ok'<>'true' then raise exception 'TEST_FAIL response %',response; end if;
  select db into saved from public.datos_kiosco where id=owner_id;
  if saved->'config'<>jsonb_build_object('pinHash','preservar','nroVenta',999) or saved->'noConocido'<>'{"valor":42}'
    or saved->'productos'->0->>'stock'<>'17' then raise exception 'TEST_FAIL unrelated legacy data changed'; end if;
  if (saved->'clientes'->0->>'saldo')::numeric<>440 or (saved->'clientes'->0->>'saldoBase')::numeric<>500 then raise exception 'TEST_FAIL legacy balance/base %',saved->'clientes'; end if;
  if not exists(select 1 from public.pagos_fiado where id=payment and monto=100 and forma='efectivo' and nota='Original intacto') then raise exception 'TEST_FAIL original overwritten'; end if;
  if not exists(select 1 from public.fiado_aplicaciones where credito_id=payment and monto=100 and cargo_id=charge) then raise exception 'TEST_FAIL original allocation overwritten'; end if;
  select sum(c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0)) into balance
    from public.fiado_cargos c where c.comercio_id=shop and c.cliente_id=customer;
  if balance<>440 then raise exception 'TEST_FAIL canonical balance %',balance; end if;
  if not exists(select 1 from public.fiado_cargos where comercio_id=shop and id<>charge and monto=100 and vence_fecha=current_date-15 and recargable) then raise exception 'TEST_FAIL maturity reset'; end if;
  if not exists(select 1 from public.egresos where id=expense and monto=100 and forma='efectivo' and session_segment_id=segment) then raise exception 'TEST_FAIL cash compensation'; end if;
  if not exists(select 1 from public.pagos_fiado where id=replacement and monto=60 and forma='qr' and session_segment_id=segment) then raise exception 'TEST_FAIL replacement'; end if;
  if not exists(select 1 from public.cierres_caja where id=closing and esperado_general=567 and total_ventas=1234 and contado_general=567 and estado='requiere_conciliacion') then raise exception 'TEST_FAIL closing rewritten'; end if;
  if saved->'cierres'->0->>'_v4estado'<>'requiere_conciliacion' or saved->'cierres'->0->>'esperadoGeneral'<>'567' then raise exception 'TEST_FAIL legacy closing'; end if;
  if jsonb_array_length(response->'rows'->'cierre_ajustes')<>1 then raise exception 'TEST_FAIL missing closing adjustment'; end if;
  again:=public.corregir_pago_fiado_v1('fixture-correct-payment',shop,req);
  if again->>'idempotent'<>'true' then raise exception 'TEST_FAIL replay'; end if;
  select count(*) into n from private.fiado_correcciones_v1 where comercio_id=shop;
  if n<>1 then raise exception 'TEST_FAIL duplicate correction'; end if;
  begin
    perform public.corregir_pago_fiado_v1('fixture-correct-payment',shop,req||'{"monto":70}');
    raise exception 'TEST_FAIL payload mismatch accepted';
  exception when others then if sqlerrm<>'FIADO_IDEMPOTENCY_CONFLICT' then raise; end if; end;
  begin
    perform public.corregir_pago_fiado_v1('fixture-second-original',shop,req);
    raise exception 'TEST_FAIL second correction accepted';
  exception when others then if sqlerrm<>'FIADO_PAGO_YA_CORREGIDO' then raise; end if; end;
  begin
    perform public.reversar_egreso_v4('fixture-reverse-compensation',shop,jsonb_build_object(
      'id',gen_random_uuid(),'egreso_id',expense,'motivo','No debe permitirse','device_id',device,'caja_sesion_id',root));
    raise exception 'TEST_FAIL compensation reverted';
  exception when others then if sqlerrm<>'FIADO_COMPENSACION_NO_REVERTIBLE' then raise; end if; end;
  -- Correcting a replacement QR payment exercises QR expense constraint, cancellation, and split allocation.
  response:=public.corregir_pago_fiado_v1('fixture-cancel-replacement',shop,req||jsonb_build_object(
    'pago_id',replacement,'accion','anular','legacy_revision',8,'legacy_pago_id','v4:'||replacement,'motivo','Anular sustituto incorrecto'));
  if jsonb_array_length(response->'rows'->'pagos_fiado')<>0 or response->'rows'->'egresos'->0->>'forma'<>'qr' then raise exception 'TEST_FAIL QR cancellation'; end if;
  select sum(c.monto-coalesce((select sum(a.monto) from public.fiado_aplicaciones a where a.cargo_id=c.id),0)) into balance
    from public.fiado_cargos c where c.comercio_id=shop and c.cliente_id=customer;
  if balance<>500 then raise exception 'TEST_FAIL cancel balance %',balance; end if;
  -- Incomplete canonical backfill is rejected instead of inventing an allocation or changing saldoBase.
  insert into public.pagos_fiado(id,comercio_id,cliente_id,monto,forma,occurred_at_device,business_date)
    values(missing_payment,shop,customer,10,'tarjeta',now(),current_date);
  begin
    perform public.corregir_pago_fiado_v1('fixture-incomplete-payment',shop,req||jsonb_build_object('pago_id',missing_payment));
    raise exception 'TEST_FAIL missing applications accepted';
  exception when others then if sqlerrm<>'FIADO_APLICACIONES_INCOMPLETAS' then raise; end if; end;
  -- V4-only does not touch legacy JSON or require legacy CAS.
  insert into public.migraciones_f4(comercio_id,estado) values(shop,'v4_only');
  insert into public.pagos_fiado(id,comercio_id,cliente_id,monto,forma,occurred_at_device,business_date)
    values(missing_legacy,shop,customer,10,'tarjeta',now(),current_date);
  perform private.aplicar_credito_fiado(shop,customer,'pago',missing_legacy,10);
  response:=public.corregir_pago_fiado_v1('fixture-v4only-cancel',shop,(req-'legacy_revision'-'legacy_pago_id')||jsonb_build_object('pago_id',missing_legacy,'accion','anular'));
  if response->'legacy'<>'null'::jsonb then raise exception 'TEST_FAIL V4 legacy write'; end if;
  if (select revision from public.datos_kiosco where id=owner_id)<>9 then raise exception 'TEST_FAIL V4 changed legacy revision'; end if;
  insert into public.clientes(id,comercio_id,nombre,saldo_base) values(split_customer,shop,'Fixture split mora',0);
  insert into public.fiado_cargos(id,comercio_id,cliente_id,origen_tipo,monto,fecha_origen_device,business_date,vence_fecha,recargable)
    values(split_charge_a,shop,split_customer,'ajuste',60,now()-interval '40 days',current_date-40,current_date-15,true),
      (split_charge_b,shop,split_customer,'recargo',40,now()-interval '5 days',current_date-5,current_date-2,false);
  insert into public.pagos_fiado(id,comercio_id,cliente_id,monto,forma,occurred_at_device,business_date)
    values(split_payment,shop,split_customer,100,'tarjeta',now(),current_date);
  insert into public.fiado_aplicaciones(comercio_id,cliente_id,credito_tipo,credito_id,cargo_id,monto)
    values(shop,split_customer,'pago',split_payment,split_charge_a,60),(shop,split_customer,'pago',split_payment,split_charge_b,40);
  response:=public.corregir_pago_fiado_v1('fixture-split-maturity',shop,(req-'legacy_revision'-'legacy_pago_id')||jsonb_build_object('pago_id',split_payment,'accion','anular'));
  if jsonb_array_length(response->'rows'->'ajustes_fiado')<>2 then raise exception 'TEST_FAIL split adjustment count'; end if;
  if not exists(select 1 from public.fiado_cargos where cliente_id=split_customer and id not in (split_charge_a,split_charge_b)
      and monto=60 and vence_fecha=current_date-15 and recargable)
    or not exists(select 1 from public.fiado_cargos where cliente_id=split_customer and id not in (split_charge_a,split_charge_b)
      and monto=40 and vence_fecha=current_date-2 and not recargable) then raise exception 'TEST_FAIL split maturity/surcharge'; end if;
  -- P1 regression: undo January payment AFTER a February payment was assigned to February.
  -- Historical FIFO replay would incorrectly leave February open; canonical allocation must survive.
  insert into public.clientes(id,comercio_id,legacy_id,nombre,saldo_base) values(aging_customer,shop,'aging-customer','Fixture January February',0);
  insert into public.ventas(id,comercio_id,legacy_id,caja_sesion_id,device_id,ticket_seq,ticket_ref,cliente_id,
      occurred_at_device,business_date,subtotal,total,forma,monto_fiado)
    values(january_sale,shop,'aging-january-sale',old_root,device,1,'QA-JAN',aging_customer,'2026-01-01T12:00:00Z','2026-01-01',100,100,'fiado',100),
      (february_sale,shop,'aging-february-sale',old_root,device,2,'QA-FEB',aging_customer,'2026-02-01T12:00:00Z','2026-02-01',100,100,'fiado',100);
  insert into public.fiado_cargos(id,comercio_id,cliente_id,origen_tipo,origen_id,monto,fecha_origen_device,business_date,vence_fecha,recargable)
    values(january_charge,shop,aging_customer,'venta',january_sale,100,'2026-01-01T12:00:00Z','2026-01-01','2026-01-31',true),
      (february_charge,shop,aging_customer,'venta',february_sale,100,'2026-02-01T12:00:00Z','2026-02-01','2026-03-03',true);
  insert into public.pagos_fiado(id,comercio_id,legacy_id,cliente_id,monto,forma,occurred_at_device,business_date)
    values(january_payment,shop,'aging-january-payment',aging_customer,100,'efectivo','2026-01-10T12:00:00Z','2026-01-10'),
      (february_payment,shop,'aging-february-payment',aging_customer,100,'efectivo','2026-02-10T12:00:00Z','2026-02-10');
  insert into public.fiado_aplicaciones(comercio_id,cliente_id,credito_tipo,credito_id,cargo_id,monto)
    values(shop,aging_customer,'pago',january_payment,january_charge,100),(shop,aging_customer,'pago',february_payment,february_charge,100);
  response:=public.corregir_pago_fiado_v1('fixture-aging-later-payment',shop,(req-'legacy_revision'-'legacy_pago_id')||jsonb_build_object('pago_id',january_payment,'accion','anular'));
  if jsonb_array_length(response->'correccion'->'estado_cuenta'->'cargos_abiertos')<>1
    or response->'correccion'->'estado_cuenta'->'cargos_abiertos'->0->>'vence_fecha' is distinct from '2026-01-31'
    or (response->'correccion'->'estado_cuenta'->'cargos_abiertos'->0->>'restante')::numeric<>100 then
      raise exception 'TEST_FAIL January aging snapshot %',response->'correccion'->'estado_cuenta'; end if;
  if not exists(select 1 from public.fiado_aplicaciones where credito_id=february_payment and cargo_id=february_charge and monto=100)
    or jsonb_array_length(response->'correccion'->'estado_cuenta'->'incluidos'->'pagos')<>2
    or jsonb_array_length(response->'correccion'->'estado_cuenta'->'incluidos'->'ventas')<>2 then raise exception 'TEST_FAIL February payment reassigned/frontier incomplete'; end if;
  if response->'rows'->'ajustes_fiado'->0->'metadata'->'estado_cuenta' is distinct from response->'correccion'->'estado_cuenta'
    or (select estado_cuenta from private.fiado_correcciones_v1 where comercio_id=shop and operation_id='fixture-aging-later-payment')
       is distinct from response->'correccion'->'estado_cuenta' then raise exception 'TEST_FAIL snapshot replicas disagree'; end if;
  if has_function_privilege('anon','public.corregir_pago_fiado_v1(text,uuid,jsonb)','execute')
    or has_table_privilege('authenticated','private.fiado_correcciones_v1','insert') then raise exception 'TEST_FAIL grants'; end if;
  execute 'set local role authenticated';
  perform public.fiado_capacidades_v1(shop);
  again:=public.corregir_pago_fiado_v1('fixture-correct-payment',shop,req);
  if again->>'idempotent'<>'true' then raise exception 'TEST_FAIL authenticated wrapper'; end if;
  execute 'reset role';

  -- An employee with Fiado can annul another actor's payment, using their own open shift.
  insert into public.cajas(id,comercio_id,codigo,nombre) values(ec,shop,'EMP-QA','Caja empleado');
  insert into public.comercio_dispositivos(id,comercio_id,user_id,caja_id,nombre) values(ed,shop,employee_id,ec,'Empleado QA');
  insert into public.caja_sesiones(id,comercio_id,caja_id,device_id,abierta_por,opened_at_device,business_date,estado)
    values(er,shop,ec,ed,employee_id,now()-interval '1 hour',current_date,'abierta');
  insert into public.caja_sesion_segmentos(segment_id,comercio_id,root_session_id,opened_at_device) values(es,shop,er,now()-interval '1 hour');
  perform set_config('request.jwt.claim.sub',employee_id::text,true);
  req:=jsonb_build_object('pago_id',february_payment,'accion','anular','monto',0,'forma','efectivo','motivo','Error de cobro QA',
    'device_id',ed,'caja_sesion_id',er,'session_segment_id',es);
  begin
    perform public.corregir_pago_fiado_v1('employee-no-permission',shop,req);
    raise exception 'TEST_FAIL employee without Fiado accepted';
  exception when others then if sqlerrm<>'FIADO_PERMISSION_REQUIRED' then raise; end if; end;
  update public.comercio_miembros set permisos='{"fiado_operar":true}' where comercio_id=shop and user_id=employee_id;
  if public.fiado_capacidades_v1(shop)->>'anular'<>'true' or public.fiado_capacidades_v1(shop)->>'corregir'<>'false' then raise exception 'TEST_FAIL employee capability'; end if;
  execute 'set local role authenticated';
  response:=public.corregir_pago_fiado_v1('employee-annul',shop,req);
  again:=public.corregir_pago_fiado_v1('employee-annul',shop,req);
  execute 'reset role';
  if again->>'idempotent'<>'true' or response->>'ok'<>'true' then raise exception 'TEST_FAIL employee replay'; end if;
  if response->'correccion'->>'actor_user_id'<>employee_id::text then raise exception 'TEST_FAIL employee audit'; end if;
  if (select count(*) from private.fiado_correcciones_v1 where operation_id='employee-annul' and comercio_id=shop)<>1 then raise exception 'TEST_FAIL employee double effect'; end if;
  if not exists(select 1 from public.egresos where id=(response->'correccion'->>'egreso_id')::uuid and session_segment_id=es and monto=100) then raise exception 'TEST_FAIL employee cash'; end if;
  if not exists(select 1 from public.pagos_fiado where id=february_payment and monto=100) then raise exception 'TEST_FAIL employee original lost'; end if;
  update public.comercio_miembros set revoked_at=now() where comercio_id=shop and user_id=employee_id;
  begin
    perform public.corregir_pago_fiado_v1('employee-annul',shop,req);
    raise exception 'TEST_FAIL revoked replay accepted';
  exception when others then if sqlerrm not in ('COMERCIO_FORBIDDEN','FIADO_PERMISSION_REQUIRED') then raise; end if; end;
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  raise notice 'PASS: shadow CAS, owner auth, amount/QR, original/allocation immutable, saldoBase, maturity, closing snapshot, replay/fingerprint, double correction, protected compensation, QR cancellation, incomplete backfill, V4-only, grants';
end $$;
rollback;

