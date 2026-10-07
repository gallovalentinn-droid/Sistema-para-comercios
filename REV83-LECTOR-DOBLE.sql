-- REV83: permite registrar resultados de GPT y Gemini sin alterar cupo ni permisos.
-- Aplicar después de las migraciones F6 existentes. Idempotente.
do $rev83$
declare
  v_definition text;
  v_old constant text := $$p_model<>'gemini-3.8-flash'$$;
  v_new constant text := $$p_model not in ('gemini-3.8-flash','gpt-6-luna')$$;
begin
  select pg_get_functiondef('public.f6_service_registrar_resultado_lectura_factura(uuid,uuid,uuid,text,jsonb,text[],integer)'::regprocedure)
    into v_definition;
  if position(v_new in v_definition)>0 then return; end if;
  if position(v_old in v_definition)=0 then
    raise exception 'REV83_TELEMETRY_CONTRACT_UNEXPECTED';
  end if;
  execute replace(v_definition,v_old,v_new);
end
$rev83$;
