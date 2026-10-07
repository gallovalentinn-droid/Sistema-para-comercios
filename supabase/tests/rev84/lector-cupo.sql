-- Ejecutar exclusivamente en la fixture local.
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'TEST: %',label; end if; end$$;
create function pg_temp.reserve(n integer,attempts integer default 2) returns jsonb language sql as $$select public.f6_service_reservar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,attempts)$$;
create function pg_temp.finish(n integer) returns jsonb language sql as $$select public.f6_service_finalizar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)$$;
create function pg_temp.attempt(n integer,ordinal integer) returns jsonb language sql as $$select public.f6_service_iniciar_intento_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when ordinal=1 then 'openai' else 'gemini' end,ordinal)$$;
create function pg_temp.result(n integer) returns jsonb language sql as $$select public.f6_service_registrar_resultado_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('10000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'gpt-6-luna','{"inputTokens":1,"outputTokens":1,"thoughtTokens":0,"cachedTokens":0,"toolUseTokens":0,"totalTokens":2}',array['items'],1)$$;
do $$declare r jsonb;c uuid:='00000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-0000000000aa';begin
 perform pg_temp.check((pg_temp.reserve(1)->>'ok')::boolean,'admission');
 perform pg_temp.check(pg_temp.reserve(1)->>'code'='LECTURA_EN_CURSO','duplicate active');
 perform pg_temp.check((pg_temp.reserve(2)->>'ok')::boolean,'two active');
 perform pg_temp.check(pg_temp.reserve(3)->>'code'='IA_LECTURAS_EN_CURSO','third active rejected');
 perform pg_temp.attempt(1,1);perform pg_temp.attempt(1,2);perform pg_temp.result(1);perform pg_temp.finish(1);
 perform pg_temp.check(pg_temp.reserve(1)->>'code'='LECTURA_NO_RECUPERABLE','duplicate success');
 perform pg_temp.finish(2);perform pg_temp.check(pg_temp.reserve(2)->>'code'='LECTURA_NO_RECUPERABLE','duplicate failure');
 r:=public.f6_service_capacidades_lector_factura_rev84(a,c);
 perform pg_temp.check(r->>'usados'='1' and r->>'reservados'='0','success counts once/failure releases');
 perform pg_temp.check((select count(*)=2 from private.factura_ai_intentos_rev84),'fallback two actual calls');
 perform pg_temp.check((select count(*)=2 from public.factura_ai_uso_v4),'never deletes rows');
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Invalid telemetry rolls back its transaction; revoked authority cannot start backup.
 perform pg_temp.reserve(101);perform pg_temp.attempt(101,1);
 begin
  perform public.f6_service_registrar_resultado_lectura_factura_rev84(a,c,'10000000-0000-4000-8000-000000000101','gpt-6-luna','{}',array['items'],1);
  raise exception 'TEST: invalid telemetry';
 exception when raise_exception then if sqlerrm not like '%F6_IA_TELEMETRY_INPUT_INVALID%' then raise;end if;end;
 perform pg_temp.check((pg_temp.finish(101)->>'confirmed')::boolean=false,'invalid telemetry does not charge');
 perform pg_temp.reserve(102);update public.comercio_miembros set activo=false where comercio_id=c;
 begin perform pg_temp.attempt(102,1);raise exception 'TEST: revoked permission';exception when raise_exception then if sqlerrm not like '%F6_IA_FORBIDDEN%' then raise;end if;end;
 update public.comercio_miembros set activo=true where comercio_id=c;perform pg_temp.finish(102);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Only metadata, no image/product/amount columns. Old RPCs remain byte-for-byte fixture definitions.
 perform pg_temp.check(not exists(select 1 from information_schema.columns where table_name='factura_ai_intentos_rev84' and column_name in ('items','image','subtotal','response')),'no invoice persistence');
 perform pg_temp.check(not has_function_privilege('anon','public.f6_service_reservar_lectura_factura_rev84(uuid,uuid,uuid,integer)','execute'),'anon RPC denied');
 perform pg_temp.check(not has_function_privilege('authenticated','public.f6_service_capacidades_lector_factura_rev84(uuid,uuid)','execute'),'authenticated RPC denied');
 perform pg_temp.check(not has_table_privilege('authenticated','private.factura_ai_intentos_rev84','select'),'attempts hidden');
 begin perform public.f6_service_capacidades_lector_factura_rev84('00000000-0000-4000-8000-0000000000bb',c);raise exception 'TEST: foreign actor';exception when raise_exception then if sqlerrm not like '%F6_IA_FORBIDDEN%' then raise;end if;end;
 update public.comercio_licencias set activo=false where comercio_id=c;
 begin perform pg_temp.reserve(9);raise exception 'TEST: inactive license';exception when raise_exception then if sqlerrm not like '%F6_IA_LICENSE_INACTIVE%' then raise;end if;end;
 update public.comercio_licencias set activo=true where comercio_id=c;
 -- Expired lease releases monthly and pending call capacity without a cleanup job.
 perform pg_temp.reserve(4);update public.factura_ai_uso_v4 set rev84_expires_at=now()-interval '1 second';
 perform pg_temp.check(pg_temp.reserve(4)->>'code'='LECTURA_NO_RECUPERABLE','expired duplicate');
 perform pg_temp.check((pg_temp.reserve(5)->>'ok')::boolean,'expired capacity reused');perform pg_temp.finish(5);
 delete from public.factura_ai_uso_v4;
 -- Both windows count effective calls + admitted pending slots.
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now() from generate_series(1,4)n;
 perform pg_temp.check((pg_temp.reserve(10)->>'ok')::boolean,'four + two slots');perform pg_temp.attempt(10,1);
 perform pg_temp.check(pg_temp.reserve(11,1)->>'code'='IA_LIMITE_FRECUENCIA','pending backup blocks others');
 perform pg_temp.attempt(10,2);perform pg_temp.finish(10);
 perform pg_temp.check((select count(*)=6 from private.factura_ai_intentos_rev84),'admitted backup never re-limited');
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now() from generate_series(1,5)n;
 r:=pg_temp.reserve(12);perform pg_temp.check(r->>'code'='IA_LIMITE_FRECUENCIA' and (r->>'retryAfterSeconds')::int>0,'five + two rejected before call');
 perform pg_temp.check((pg_temp.reserve(13,1)->>'ok')::boolean,'five + one allowed');perform pg_temp.finish(13);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now()-interval '10 minutes' from generate_series(1,28)n;
 perform pg_temp.check((pg_temp.reserve(14)->>'ok')::boolean,'28 + two hourly');perform pg_temp.finish(14);
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)values(c,a,'20000000-0000-4000-8000-000000000029','openai',1,now()-interval '10 minutes');
 perform pg_temp.check(pg_temp.reserve(15)->>'code'='IA_LIMITE_FRECUENCIA','29 + two hourly rejected');
 perform pg_temp.check((pg_temp.reserve(16,1)->>'ok')::boolean,'29 + one hourly allowed');perform pg_temp.finish(16);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Monthly 3x warning remains advisory when short windows and quota allow admission.
 update public.comercio_licencias set limite_ia_mensual=30 where comercio_id=c;
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now()-interval '2 hours' from generate_series(1,90)n;
 r:=pg_temp.reserve(17);perform pg_temp.check(r->>'ok'='true' and r->>'monthlyCallsWarning'='true','monthly warning does not block');perform pg_temp.finish(17);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Rollback preserves rows: legacy counts five; REV84 uses two, holds one, leaves two.
 update public.comercio_licencias set limite_ia_mensual=5 where comercio_id=c;
 insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date,rev84_state,rev84_expires_at,rev84_pending_calls,rev84_max_attempts,result_recorded_at)
 select c,a,('30000000-0000-4000-8000-'||lpad(n::text,12,'0')),private.business_date(c,now()),
 case n when 1 then null when 2 then 'resultado' when 3 then 'fallida' else 'reservada' end,
 case when n=4 then now()-interval '1 second' when n=5 then now()+interval '3 minutes' else null end,
 case when n in (4,5) then 2 else 0 end,2,case when n=2 then now() else null end from generate_series(1,5)n;
 r:=public.f6_service_capacidades_lector_factura_rev84(a,c);perform pg_temp.check(r->>'usados'='2' and r->>'reservados'='1' and r->>'disponibles'='2','REV84 rollback fixture');
 r:=public.f6_service_reservar_lectura_factura(a,c,'40000000-0000-4000-8000-000000000001');perform pg_temp.check(r->>'ok'='false' and r->>'usados'='5','REV83 counts retained failed/expired rows');
 r:=public.f6_service_capacidades_lector_factura_rev84(a,c);perform pg_temp.check(r->>'usados'='2' and r->>'disponibles'='2','reactivation restores same calculation');
 update public.factura_ai_uso_v4 set rev84_expires_at=now()-interval '1 second' where rev84_state='reservada';
 r:=public.f6_service_capacidades_lector_factura_rev84(a,c);perform pg_temp.check(r->>'reservados'='0' and r->>'disponibles'='3','zero active rollback');
 insert into public.factura_ai_uso_v4(comercio_id,user_id,operation_id,business_date) values(c,a,'other-month',private.business_date(c,now())-interval '1 month'),('00000000-0000-4000-8000-000000000002',a,'other-commerce',private.business_date(c,now()));
 r:=public.f6_service_capacidades_lector_factura_rev84(a,c);perform pg_temp.check(r->>'usados'='2','other month/commerce isolated');
end$$;
