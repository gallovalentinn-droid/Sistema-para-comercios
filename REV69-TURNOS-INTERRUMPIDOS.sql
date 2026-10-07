-- REV69: interrupciones sin arqueo y ajuste explicativo del efectivo arrastrado.
-- No inserta cierres ni modifica ventas, pagos, egresos, conteos o traspasos.
begin;

alter table public.caja_sesion_segmentos
  add column if not exists interrumpido_at_device timestamptz,
  add column if not exists interrumpido_motivo text,
  add column if not exists interrumpido_registrado_por text,
  add column if not exists interrumpido_registrado_at timestamptz;

alter table public.caja_sesion_segmentos
  drop constraint if exists caja_sesion_segmentos_rev69_interrupcion_check;
alter table public.caja_sesion_segmentos
  add constraint caja_sesion_segmentos_rev69_interrupcion_check check (
    interrumpido_at_device is null or (
      closed_at_device is null and
      interrumpido_at_device >= opened_at_device and
      nullif(btrim(interrumpido_motivo),'') is not null and
      nullif(btrim(interrumpido_registrado_por),'') is not null and
      interrumpido_registrado_at is not null
    )
  );

alter table public.cierre_ajustes
  add column if not exists origen_segment_id uuid;

alter table public.cierre_ajustes
  drop constraint if exists cierre_ajustes_tipo_check;
alter table public.cierre_ajustes
  add constraint cierre_ajustes_tipo_check check (tipo in (
    'llegada_tardia','operacion_descartada','ajuste_manual',
    'efectivo_arrastrado_turno_interrumpido'
  ));

alter table public.cierre_ajustes
  add constraint cierre_ajustes_rev69_origen_fk
    foreign key (comercio_id,origen_segment_id)
    references public.caja_sesion_segmentos(comercio_id,segment_id),
  add constraint cierre_ajustes_rev69_cierre_comercio_fk
    foreign key (comercio_id,cierre_id)
    references public.cierres_caja(comercio_id,id),
  add constraint cierre_ajustes_rev69_tipo_check check (
    tipo <> 'efectivo_arrastrado_turno_interrumpido' or (
      origen_segment_id is not null and monto > 0 and
      nullif(btrim(motivo),'') is not null and
      nullif(btrim(metadata->>'responsable'),'') is not null
    )
  );

create unique index cierre_ajustes_rev69_origen_unico
  on public.cierre_ajustes(comercio_id,origen_segment_id)
  where tipo='efectivo_arrastrado_turno_interrumpido';

create or replace function private._rev69_validar_arrastre()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare
  v_interrumpido timestamptz;
  v_cerrado timestamptz;
begin
  if new.tipo <> 'efectivo_arrastrado_turno_interrumpido' then return new; end if;
  select s.interrumpido_at_device into v_interrumpido
    from public.caja_sesion_segmentos s
   where s.comercio_id=new.comercio_id and s.segment_id=new.origen_segment_id;
  if v_interrumpido is null then raise exception 'REV69_ORIGEN_NO_INTERRUMPIDO'; end if;
  select c.closed_at_device into v_cerrado
    from public.cierres_caja c
   where c.comercio_id=new.comercio_id and c.id=new.cierre_id;
  if v_cerrado is null or v_cerrado < v_interrumpido then
    raise exception 'REV69_CIERRE_DESTINO_INVALIDO';
  end if;
  return new;
end;
$function$;
revoke all on function private._rev69_validar_arrastre() from public,anon,authenticated;
drop trigger if exists cierre_ajustes_rev69_validar on public.cierre_ajustes;
create trigger cierre_ajustes_rev69_validar
  before insert or update on public.cierre_ajustes
  for each row execute function private._rev69_validar_arrastre();

-- Las operaciones offline ocurridas antes de una interrupción siguen pudiendo llegar tarde.
-- Las posteriores se rechazan, igual que ocurre con un cierre normal.
create or replace function private._f5_validar_destino_stream(
  p_comercio_id uuid, p_payload jsonb, p_occurred_at timestamptz
) returns jsonb language plpgsql security definer set search_path = '' as $function$
declare
  v_uid uuid := (select auth.uid());
  v_root public.caja_sesiones%rowtype;
  v_segment public.caja_sesion_segmentos%rowtype;
  v_device uuid := nullif(p_payload->>'device_id','')::uuid;
  v_family uuid := nullif(p_payload->>'lease_family_id','')::uuid;
  v_root_id uuid := nullif(p_payload->>'caja_sesion_id','')::uuid;
  v_segment_id uuid := nullif(p_payload->>'session_segment_id','')::uuid;
  v_stream text := p_payload->>'stream_key';
  v_expected text;
begin
  if v_uid is null or v_device is null or v_family is null or v_root_id is null
     or v_segment_id is null or coalesce(v_stream,'')='' then
    raise exception 'F5_STREAM_FIELDS_REQUIRED';
  end if;
  select * into v_root from public.caja_sesiones s
    where s.id=v_root_id and s.comercio_id=p_comercio_id for share;
  if not found then raise exception 'F5_STREAM_ROOT_INVALID'; end if;
  select * into v_segment from public.caja_sesion_segmentos x
    where x.segment_id=v_segment_id and x.comercio_id=p_comercio_id
      and x.root_session_id=v_root_id for share;
  if not found then raise exception 'F5_STREAM_SEGMENT_INVALID'; end if;
  if v_root.abierta_por is distinct from v_uid
     or v_root.device_id<>v_device or v_root.lease_family_id<>v_family then
    raise exception 'F5_STREAM_SCOPE_INVALID';
  end if;
  if v_root.estado not in ('abierta','cerrada','requiere_conciliacion') then
    raise exception 'F5_STREAM_STATE_INVALID';
  end if;
  if v_segment.closed_at_device is not null
     and coalesce(p_occurred_at,clock_timestamp())>v_segment.closed_at_device then
    raise exception 'F5_OPERATION_AFTER_SEGMENT_CLOSE';
  end if;
  if v_segment.interrumpido_at_device is not null
     and coalesce(p_occurred_at,clock_timestamp())>v_segment.interrumpido_at_device then
    raise exception 'F5_OPERATION_AFTER_SEGMENT_INTERRUPTION';
  end if;
  v_expected:=private.f5_stream_key(
    p_comercio_id,v_uid,v_device,v_root.caja_id,v_family,v_root.id
  );
  if v_stream<>v_expected or v_root.stream_key<>v_expected then
    raise exception 'F5_STREAM_KEY_INVALID';
  end if;
  return jsonb_build_object(
    'root_session_id',v_root.id,'session_segment_id',v_segment.segment_id,
    'caja_id',v_root.caja_id,'estado',v_root.estado,'stream_key',v_expected
  );
end;
$function$;
revoke all on function private._f5_validar_destino_stream(uuid,jsonb,timestamptz)
  from public,anon,authenticated;

commit;
