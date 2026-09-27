-- REV53: admitir promociones de cantidad del mismo producto sin abrir
-- la puerta a porcentajes cero en descuentos comunes.
-- Aplicar después de REV52-CAJA-TRASPASO.sql y antes de publicar beta REV53.
begin;

alter table public.promociones
  drop constraint if exists promociones_porcentaje_check;

alter table public.promociones
  add constraint promociones_porcentaje_check check (
    (porcentaje > 0 and porcentaje <= 100)
    or (
      tipo = 'producto' and producto_id is not null and porcentaje = 0
      and case
        when objetivo_texto ~ '^([2-9]|[1-9][0-9])x([1-9]|[1-9][0-9])$'
        then split_part(objetivo_texto, 'x', 1)::integer > split_part(objetivo_texto, 'x', 2)::integer
        else false
      end
    )
  );

commit;
