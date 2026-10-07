-- REV71: memoria del lector de facturas (reemplaza a REV70-ALIAS-FACTURA.sql, que nunca se aplicó).
-- Cambio respecto de REV70: la licencia operable se exige también en USING de escritura, así que con la
-- licencia vencida no se puede borrar ni modificar una fila existente, ni trasladarla a otro comercio.
-- Guarda, por comercio y proveedor, qué producto eligió la persona para cada texto
-- impreso en la factura (o código de artículo), y cuántas unidades trae el bulto.
-- No guarda imágenes, importes ni cantidades de ninguna factura.
-- Idempotente: se puede aplicar dos veces.
begin;

create table if not exists public.factura_alias_producto (
  comercio_id uuid not null references public.comercios(id) on delete cascade,
  proveedor_clave text not null default '',
  texto_clave text not null,
  producto_ref text not null,
  unidades_por_bulto integer not null default 1,
  usos integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (comercio_id, proveedor_clave, texto_clave),
  constraint factura_alias_producto_rev70_check check (
    char_length(proveedor_clave) <= 160
    and char_length(texto_clave) between 1 and 220
    and char_length(producto_ref) between 1 and 120
    and unidades_por_bulto between 1 and 1000
    and usos between 1 and 1000000
  )
);

comment on table public.factura_alias_producto is
  'REV71: texto impreso en facturas de compra (o cod:<código>) -> producto elegido por el comercio. Sin importes ni imágenes.';

-- Mantiene updated_at y updated_by del lado del servidor aunque el cliente mande otros valores.
create or replace function private.rev70_alias_sello()
returns trigger
language plpgsql
set search_path to ''
as $function$
begin
  new.updated_at := now();
  new.updated_by := (select auth.uid());
  return new;
end;
$function$;
revoke all on function private.rev70_alias_sello() from public, anon, authenticated;

drop trigger if exists factura_alias_producto_rev70_sello on public.factura_alias_producto;
create trigger factura_alias_producto_rev70_sello
  before insert or update on public.factura_alias_producto
  for each row execute function private.rev70_alias_sello();

alter table public.factura_alias_producto enable row level security;

drop policy if exists factura_alias_producto_select on public.factura_alias_producto;
create policy factura_alias_producto_select on public.factura_alias_producto
  for select to authenticated
  using ((select private.es_miembro(factura_alias_producto.comercio_id)));

drop policy if exists factura_alias_producto_write on public.factura_alias_producto;
create policy factura_alias_producto_write on public.factura_alias_producto
  for all to authenticated
  using (
    (select private.tiene_permiso(factura_alias_producto.comercio_id, 'productos_editar'))
    and (select private.licencia_activa(factura_alias_producto.comercio_id))
  )
  with check (
    (select private.tiene_permiso(factura_alias_producto.comercio_id, 'productos_editar'))
    and (select private.licencia_activa(factura_alias_producto.comercio_id))
  );

revoke all on table public.factura_alias_producto from public, anon, authenticated;
grant select, insert, update, delete on table public.factura_alias_producto to authenticated;

do $rev71$
begin
  if has_table_privilege('anon', 'public.factura_alias_producto', 'SELECT')
     or has_table_privilege('authenticated', 'public.factura_alias_producto', 'TRUNCATE')
     or not (select relrowsecurity from pg_class where oid = 'public.factura_alias_producto'::regclass)
  then
    raise exception 'REV71_PERMISOS_INSEGUROS';
  end if;
end;
$rev71$;

commit;
