-- Ejecutar exclusivamente en la fixture local, después de REV84-LECTOR-CUPO.sql, REV95-LECTOR-RESPALDO.sql y REV95-LECTOR-REINTENTO.sql.
create function pg_temp.check(ok boolean,label text) returns void language plpgsql as $$begin if ok is not true then raise exception 'TEST: %',label; end if; end$$;
create function pg_temp.op(n integer) returns uuid language sql as $$select ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.reserve(n integer,attempts integer default 2) returns jsonb language sql as $$select public.f6_service_reservar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',pg_temp.op(n),attempts)$$;
create function pg_temp.finish(n integer) returns jsonb language sql as $$select public.f6_service_finalizar_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',pg_temp.op(n))$$;
create function pg_temp.attempt(n integer,ordinal integer) returns jsonb language sql as $$select public.f6_service_iniciar_intento_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',pg_temp.op(n),case when ordinal=1 then 'openai' else 'gemini' end,ordinal)$$;
create function pg_temp.extend(n integer) returns jsonb language sql as $$select public.f6_service_ampliar_intento_lectura_factura_rev95('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',pg_temp.op(n))$$;
create function pg_temp.result(n integer,model text) returns jsonb language sql as $$select public.f6_service_registrar_resultado_lectura_factura_rev84('00000000-0000-4000-8000-0000000000aa','00000000-0000-4000-8000-000000000001',pg_temp.op(n),model,'{"inputTokens":1,"outputTokens":1,"thoughtTokens":0,"cachedTokens":0,"toolUseTokens":0,"totalTokens":2}',array['items'],1)$$;
do $$declare r jsonb;c uuid:='00000000-0000-4000-8000-000000000001';a uuid:='00000000-0000-4000-8000-0000000000aa';begin
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 update public.comercio_licencias set limite_ia_mensual=30,activo=true where comercio_id=c;
 -- La reserva inicial conserva su contrato: tres plazas anticipadas se rechazan.
 begin perform pg_temp.reserve(1,3);raise exception 'TEST: tres plazas anticipadas';exception when raise_exception then if sqlerrm not like '%F6_IA_INPUT_INVALID%' then raise;end if;end;
 -- La plaza extra se concede recién después de usar las admitidas, una sola vez, y habilita el tercer intento.
 perform pg_temp.check((pg_temp.reserve(1)->>'ok')::boolean,'reserva base');
 perform pg_temp.check(pg_temp.extend(1)->>'code'='IA_REINTENTO_NO_DISPONIBLE','sin usar las plazas no se amplía');
 perform pg_temp.attempt(1,1);
 perform pg_temp.check(pg_temp.extend(1)->>'code'='IA_REINTENTO_NO_DISPONIBLE','con el respaldo pendiente no se amplía');
 perform pg_temp.attempt(1,2);
 begin perform pg_temp.attempt(1,3);raise exception 'TEST: tercer intento sin ampliar';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 perform pg_temp.check((pg_temp.extend(1)->>'ok')::boolean,'ampliación concedida');
 perform pg_temp.check(pg_temp.extend(1)->>'code'='IA_REINTENTO_NO_DISPONIBLE','ampliación única');
 perform pg_temp.attempt(1,3);
 perform pg_temp.check(pg_temp.extend(1)->>'code'='IA_REINTENTO_NO_DISPONIBLE','sin cuarta plaza');
 begin perform pg_temp.attempt(1,4);raise exception 'TEST: cuarto intento';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 perform pg_temp.result(1,'gemini-3.5-flash-lite');perform pg_temp.finish(1);
 perform pg_temp.check((select count(*)=3 from private.factura_ai_intentos_rev84),'tres llamadas reales registradas');
 perform pg_temp.check((select provider_model='gemini-3.5-flash-lite' and rev84_state='resultado' and rev84_pending_calls=0 and rev84_max_attempts=3 from public.factura_ai_uso_v4),'respaldo registrado tras reintento');
 begin perform pg_temp.extend(1);raise exception 'TEST: ampliar lectura cerrada';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 begin perform pg_temp.extend(99);raise exception 'TEST: ampliar lectura inexistente';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- R2: con dos llamadas previas, dos lecturas solapadas se admiten como antes de REV95 (2 + 2 + 2 = 6).
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now() from generate_series(1,2)n;
 perform pg_temp.check((pg_temp.reserve(2)->>'ok')::boolean,'primera lectura solapada');
 perform pg_temp.check((pg_temp.reserve(3)->>'ok')::boolean,'segunda lectura solapada admitida');
 -- La ampliación de una no le quita a la otra las plazas que ya tiene admitidas.
 perform pg_temp.attempt(2,1);perform pg_temp.attempt(2,2);
 perform pg_temp.check(pg_temp.extend(2)->>'code'='IA_LIMITE_FRECUENCIA','4 reales + 2 pendientes ajenas + 1 se rechaza');
 perform pg_temp.check((select rev84_max_attempts=2 and rev84_pending_calls=0 from public.factura_ai_uso_v4 where operation_id=pg_temp.op(2)::text),'el rechazo no altera la reserva');
 perform pg_temp.attempt(3,1);perform pg_temp.attempt(3,2);
 perform pg_temp.check((select count(*)=6 from private.factura_ai_intentos_rev84),'la segunda lectura usó sus dos plazas');
 perform pg_temp.check(pg_temp.extend(3)->>'code'='IA_LIMITE_FRECUENCIA','tope de seis en cinco minutos intacto');
 perform pg_temp.finish(2);perform pg_temp.finish(3);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Tope horario intacto: 28 previas + 2 propias = 30; la plaza extra sería la 31.
 insert into private.factura_ai_intentos_rev84(comercio_id,user_id,operation_id,provider,attempt,started_at)
 select c,a,('60000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'openai',1,now()-interval '10 minutes' from generate_series(1,28)n;
 perform pg_temp.reserve(4);perform pg_temp.attempt(4,1);perform pg_temp.attempt(4,2);
 perform pg_temp.check(pg_temp.extend(4)->>'code'='IA_LIMITE_FRECUENCIA','tope de treinta por hora intacto');perform pg_temp.finish(4);
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Lectura de un solo proveedor (HEIC): una plaza base y una ampliación.
 perform pg_temp.reserve(5,1);perform pg_temp.attempt(5,1);
 perform pg_temp.check((pg_temp.extend(5)->>'ok')::boolean,'ampliación con un solo proveedor');
 perform pg_temp.finish(5);
 perform pg_temp.check((select rev84_state='fallida' and rev84_pending_calls=0 from public.factura_ai_uso_v4),'la plaza ampliada sin usar se libera al cerrar');
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
 -- Vencida, sin permiso o con licencia inactiva: no se amplía.
 perform pg_temp.reserve(6);perform pg_temp.attempt(6,1);perform pg_temp.attempt(6,2);
 update public.comercio_miembros set activo=false where comercio_id=c;
 begin perform pg_temp.extend(6);raise exception 'TEST: ampliar sin permiso';exception when raise_exception then if sqlerrm not like '%F6_IA_FORBIDDEN%' then raise;end if;end;
 update public.comercio_miembros set activo=true where comercio_id=c;
 update public.factura_ai_uso_v4 set rev84_expires_at=now()-interval '1 second';
 begin perform pg_temp.extend(6);raise exception 'TEST: ampliar vencida';exception when raise_exception then if sqlerrm not like '%F6_IA_RESERVATION_NOT_ACTIVE%' then raise;end if;end;
 perform pg_temp.check(not has_function_privilege('anon','public.f6_service_ampliar_intento_lectura_factura_rev95(uuid,uuid,uuid)','execute'),'anon sin acceso');
 perform pg_temp.check(not has_function_privilege('authenticated','public.f6_service_ampliar_intento_lectura_factura_rev95(uuid,uuid,uuid)','execute'),'authenticated sin acceso');
 delete from private.factura_ai_intentos_rev84;delete from public.factura_ai_uso_v4;
end$$;
