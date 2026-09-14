-- F6: las imágenes pertenecen al comercio, no al usuario que las subió.
-- Lectura: cualquier miembro activo. Escritura: productos_editar efectivo.

create or replace function private.f6_puede_acceder_imagenes(
  p_comercio_id text,
  p_requiere_edicion boolean default false
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(exists (
    select 1
      from public.comercio_miembros member
     where member.comercio_id::text=nullif(trim(p_comercio_id),'')
       and member.user_id=(select auth.uid())
       and member.activo
       and private.licencia_activa(member.comercio_id)
       and (
         not coalesce(p_requiere_edicion,false)
         or member.rol in ('duenio','admin')
         or member.permisos->>'productos_editar'='true'
       )
  ),false)
$function$;

revoke all on function private.f6_puede_acceder_imagenes(text,boolean) from public,anon,authenticated,service_role;
grant execute on function private.f6_puede_acceder_imagenes(text,boolean) to authenticated;

drop policy if exists "producto imagen propia delete" on storage.objects;
drop policy if exists "producto imagen propia insert" on storage.objects;
drop policy if exists "producto imagen propia update" on storage.objects;
drop policy if exists f6_product_images_select on storage.objects;
drop policy if exists f6_product_images_insert on storage.objects;
drop policy if exists f6_product_images_update on storage.objects;
drop policy if exists f6_product_images_delete on storage.objects;

create policy f6_product_images_select
on storage.objects
for select
to authenticated
using (
  bucket_id='product-images'
  and private.f6_puede_acceder_imagenes((storage.foldername(name))[1],false)
);

create policy f6_product_images_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id='product-images'
  and private.f6_puede_acceder_imagenes((storage.foldername(name))[1],true)
);

create policy f6_product_images_update
on storage.objects
for update
to authenticated
using (
  bucket_id='product-images'
  and private.f6_puede_acceder_imagenes((storage.foldername(name))[1],true)
)
with check (
  bucket_id='product-images'
  and private.f6_puede_acceder_imagenes((storage.foldername(name))[1],true)
);

create policy f6_product_images_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id='product-images'
  and private.f6_puede_acceder_imagenes((storage.foldername(name))[1],true)
);

