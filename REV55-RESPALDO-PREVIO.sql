-- Copia interna de los datos y contratos tocados por REV52/REV53.
-- Se aplica una sola vez, antes de esas migraciones. Los datos quedan en el
-- esquema privado de la misma base y no se incluyen en el paquete público.
begin;

create table private.rev55_predeploy_snapshot (
  source text not null,
  row_key text not null,
  body jsonb not null,
  captured_at timestamptz not null default now(),
  primary key (source, row_key)
);

revoke all on private.rev55_predeploy_snapshot from public, anon, authenticated;

insert into private.rev55_predeploy_snapshot (source, row_key, body)
select 'cierres_caja', id::text, to_jsonb(c)
from public.cierres_caja c;

insert into private.rev55_predeploy_snapshot (source, row_key, body)
select 'caja_sesion_segmentos', segment_id::text, to_jsonb(s)
from public.caja_sesion_segmentos s;

insert into private.rev55_predeploy_snapshot (source, row_key, body)
select 'promociones', id::text, to_jsonb(p)
from public.promociones p;

insert into private.rev55_predeploy_snapshot (source, row_key, body)
select 'function', oid::regprocedure::text,
       jsonb_build_object('definition', pg_get_functiondef(oid))
from pg_proc
where oid in (
  'public.abrir_sesion_caja_v4(text,uuid,jsonb)'::regprocedure,
  'public.cerrar_sesion_caja_v4(text,uuid,jsonb)'::regprocedure
);

insert into private.rev55_predeploy_snapshot (source, row_key, body)
select 'constraint', conname,
       jsonb_build_object('definition', pg_get_constraintdef(oid))
from pg_constraint
where conrelid = 'public.promociones'::regclass
  and conname = 'promociones_porcentaje_check';

commit;
