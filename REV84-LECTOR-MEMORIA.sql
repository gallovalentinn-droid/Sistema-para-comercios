-- Independiente del cupo. No guarda importes ni imágenes. Conserva RLS/permisos REV71.
begin;
alter table public.factura_alias_producto add column if not exists modo_stock text;
alter table public.factura_alias_producto add column if not exists pack_detectado integer;
do $migration$
begin
 if not exists(select 1 from pg_constraint where conrelid='public.factura_alias_producto'::regclass and conname='factura_alias_producto_rev84_stock_check') then
  alter table public.factura_alias_producto add constraint factura_alias_producto_rev84_stock_check
   check ((modo_stock is null or modo_stock in ('pack','unidad','manual')) and (pack_detectado is null or pack_detectado between 1 and 1000000));
 end if;
end;
$migration$;
commit;
