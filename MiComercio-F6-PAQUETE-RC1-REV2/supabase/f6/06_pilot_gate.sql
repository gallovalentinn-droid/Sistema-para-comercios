-- F6.6: gate técnico del piloto. No transforma datos ni sustituye la evidencia
-- externa: hace visibles los seis requisitos y falla cerrado si falta cualquiera.

create or replace function public.f6_pilot_gate(
  p_comercio_id uuid,
  p_observed_build text,
  p_baseline_reproducible boolean,
  p_pin_precondition_resolved boolean
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_expected_build constant text := '6.0.0-f6-rc1';
  v_migration_state text;
  v_build_ok boolean;
  v_v4_only boolean;
  v_baseline_ok boolean := coalesce(p_baseline_reproducible,false);
  v_pin_ok boolean := coalesce(p_pin_precondition_resolved,false);
  v_closes_ok boolean := false;
  v_provisional_ok boolean := false;
  v_close_count integer := 0;
  v_provisional_count integer := 0;
  v_same_day date;
  v_checks jsonb;
begin
  if p_comercio_id is null then raise exception 'F6_PILOT_COMERCIO_REQUIRED'; end if;

  select m.estado into v_migration_state
    from public.migraciones_f4 m
   where m.comercio_id=p_comercio_id;
  v_build_ok:=coalesce(trim(p_observed_build),'')=v_expected_build;
  v_v4_only:=coalesce(v_migration_state='v4_only',false);

  select count(*) into v_close_count
    from public.cierres_caja c
   where c.comercio_id=p_comercio_id;

  select grouped.business_date into v_same_day
    from (
      select s.business_date
        from public.cierres_caja c
        join public.caja_sesiones s
          on s.id=c.caja_sesion_id and s.comercio_id=c.comercio_id
       where c.comercio_id=p_comercio_id
       group by s.business_date
      having count(*)>=2
         and count(distinct coalesce(c.session_segment_id,c.caja_sesion_id))=count(*)
       order by s.business_date desc
       limit 1
    ) grouped;
  v_closes_ok:=v_same_day is not null;

  select count(*) into v_provisional_count
    from public.cierres_caja c
    join public.caja_sesiones s
      on s.id=c.caja_sesion_id and s.comercio_id=c.comercio_id
   where c.comercio_id=p_comercio_id
     and s.provisional
     and s.estado='requiere_conciliacion'
     and c.session_segment_id is not null
     and c.estado='requiere_conciliacion';
  v_provisional_ok:=v_provisional_count>0;

  v_checks:=jsonb_build_object(
    'build_identity',jsonb_build_object(
      'ok',v_build_ok,'expected',v_expected_build,'observed',coalesce(p_observed_build,'')
    ),
    'v4_only',jsonb_build_object(
      'ok',v_v4_only,'observed',coalesce(v_migration_state,'ausente')
    ),
    'baseline_reproducible',jsonb_build_object(
      'ok',v_baseline_ok,'source','evidencia_externa_explicita'
    ),
    'pin_precondition',jsonb_build_object(
      'ok',v_pin_ok,'source','evidencia_externa_explicita'
    ),
    'cierres_independientes',jsonb_build_object(
      'ok',v_closes_ok,'cierres_observados',v_close_count,'dia_con_multiples_turnos',v_same_day
    ),
    'provisional_conciliation',jsonb_build_object(
      'ok',v_provisional_ok,'cierres_observados',v_provisional_count
    )
  );

  return jsonb_build_object(
    'ready',v_build_ok and v_v4_only and v_baseline_ok and v_pin_ok and v_closes_ok and v_provisional_ok,
    'comercio_id',p_comercio_id,
    'checked_at',statement_timestamp(),
    'checks',v_checks
  );
end
$function$;

revoke all on function public.f6_pilot_gate(uuid,text,boolean,boolean)
  from public,anon,authenticated,service_role;
grant execute on function public.f6_pilot_gate(uuid,text,boolean,boolean)
  to service_role;
