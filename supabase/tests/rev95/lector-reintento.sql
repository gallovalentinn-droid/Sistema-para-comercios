-- Ejecutar exclusivamente en la fixture local, después de REV84-LECTOR-CUPO.sql y REV95-LECTOR-REINTENTO.sql.
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'TEST: %',label; end if; end$$;
create function pg_temp.reserve(n integer,attempts integer) returns jsonb language sql as $$select public.f6_service_reservar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,attempts)$$;
create function pg_temp.finish(n integer) returns jsonb language sql as $$select public.f6_service_finalizar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid)$$;
create function pg_temp.attempt(n integer,ordinal integer) returns jsonb language sql as $$select public.f6_service_iniciar_intento_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when ordinal=1 then 'openai' else 'gemini' end,ordinal)$$;
create function pg_temp.result(n integer,model text) returns jsonb language sql as $$select public.f6_service_registrar_resultado_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,model,'{"inputTokens":1,"outputTokens":1,"thoughtTokens":0,"cachedTokens":0,"toolUseTokens":0,"totalTokens":2}',array['items'],1)$$;
do $$declare r jsonb;c uuid:='00000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-0000000000aa';begin
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 update public.comercio_licencias set limite_ia_mensual=30,activo=true where comercio_id=c;
 -- Tres intentos en orden; el cuarto y una reserva de cuatro se rechazan.
 perform pg_temp.check((pg_temp.reserve(1,3)->>'ok')::boolean,'reserva de tres');
 perform pg_temp.attempt(1,1);perform pg_temp.attempt(1,2);perform pg_temp.attempt(1,3);
 begin perform pg_temp.attempt(1,4);raise exception 'TEST: cuarto intento';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 perform pg_temp.result(1,'gpt-6-luna');perform pg_temp.finish(1);
 perform pg_temp.check((select count(*)=3 from private.factura_ai_intentos_rev84),'tres llamadas reales registradas');
 perform pg_temp.check((select rev84_state='resultado' and rev84_pending_calls=0 and rev84_max_attempts=3 from public.factura_ai_uso_v4),'resultado con tres plazas');
 begin perform pg_temp.reserve(2,4);raise exception 'TEST: cuatro plazas';exception when raise_exception then if sqlerrm not like '%F6_IA_INPUT_INVALID%' then raise;end if;end;
 begin perform pg_temp.reserve(2,0);raise exception 'TEST: cero plazas';exception when raise_exception then if sqlerrm not like '%F6_IA_INPUT_INVALID%' then raise;end if;end;
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- El orden de intentos se sigue exigiendo.
 perform pg_temp.reserve(3,3);perform pg_temp.attempt(3,1);
 begin perform pg_temp.attempt(3,3);raise exception 'TEST: salto de intento';exception when raise_exception then if sqlerrm not like '%F6_IA_ATTEMPT_ORDER_INVALID%' then raise;end if;end;
 perform pg_temp.finish(3);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Los límites no cambian: la tercera plaza cuenta contra el tope de seis en cinco minutos.
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now() from generate_series(1,3)n;
 perform pg_temp.check((pg_temp.reserve(4,3)->>'ok')::boolean,'tres + tres plazas');perform pg_temp.finish(4);
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)values(c,a,'60000000-0000-4000-8000-000000000004','openai',1,now());
 r:=pg_temp.reserve(5,3);perform pg_temp.check(r->>'code'='IA_LIMITE_FRECUENCIA','cuatro + tres plazas se rechaza');
 -- Una reserva rechazada no deja fila: la misma lectura puede pedir dos plazas, como antes de REV95.
 perform pg_temp.check((pg_temp.reserve(5,2)->>'ok')::boolean,'la misma lectura entra con dos plazas');perform pg_temp.finish(5);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- El modelo de respaldo nuevo se registra después de un reintento.
 perform pg_temp.reserve(6,3);perform pg_temp.attempt(6,1);perform pg_temp.attempt(6,2);perform pg_temp.attempt(6,3);
 perform pg_temp.result(6,'gemini-3.5-flash-lite');perform pg_temp.finish(6);
 perform pg_temp.check((select provider_model='gemini-3.5-flash-lite' and rev84_state='resultado' from public.factura_ai_uso_v4),'respaldo registrado tras reintento');
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
end$$;
