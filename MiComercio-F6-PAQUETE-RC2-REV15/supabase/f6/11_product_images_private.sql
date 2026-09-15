-- F6 rev11: las fotos de inventario son privadas.
-- Las lecturas pasan por las policies de 08_product_images.sql y el cliente
-- obtiene URLs firmadas temporales; no se sirven por /object/public/.

update storage.buckets
   set public=false
 where id='product-images';

do $test$
begin
  if not exists (
    select 1
      from storage.buckets
     where id='product-images'
       and not public
  ) then
    raise exception 'F6_PRODUCT_IMAGE_PRIVATE_BUCKET_REQUIRED';
  end if;
end
$test$;
