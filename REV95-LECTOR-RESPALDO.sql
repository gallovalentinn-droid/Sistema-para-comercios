-- REV95: el respaldo del lector pasa a gemini-3.5-flash-lite. Solo amplía los modelos cuyo resultado se puede registrar.
-- No altera cupo, límites ni permisos. Conserva gemini-3.8-flash para poder volver atrás.
-- Aplicar ANTES de desplegar la función con el modelo nuevo. Idempotente.
do $rev95$
declare
  v_definition text;
  v_old constant text := $$p_model not in ('gemini-3.8-flash','gpt-6-luna')$$;
  v_new constant text := $$p_model not in ('gemini-3.8-flash','gemini-3.5-flash-lite','gpt-6-luna')$$;
begin
  select pg_get_functiondef('public.f6_service_registrar_resultado_lectura_factura(uuid,uuid,uuid,text,jsonb,text[],integer)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition)>0 then return; end if;
  if position(v_old in v_definition)=0 then
    raise exception 'REV95_TELEMETRY_CONTRACT_UNEXPECTED';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$rev95$;
