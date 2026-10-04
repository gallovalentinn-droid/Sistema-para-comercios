begin;
insert into public.factura_alias_producto(comercio_id,proveedor_clave,texto_clave,producto_ref) values('00000000-0000-4000-8000-000000000001','proveedor','legacy','p');
do $$begin
 if (select modo_stock is not null or pack_detectado is not null from public.factura_alias_producto where texto_clave='legacy') then raise exception 'LEGACY_MODIFIED';end if;
 if not (select relrowsecurity from pg_class where oid='public.factura_alias_producto'::regclass) then raise exception 'RLS_MISSING';end if;
 if has_table_privilege('anon','public.factura_alias_producto','SELECT') or has_table_privilege('authenticated','public.factura_alias_producto','TRUNCATE') then raise exception 'ACL_OPEN';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000aa',true);
update public.factura_alias_producto set modo_stock='unidad',pack_detectado=8,unidades_por_bulto=8 where texto_clave='legacy';
reset role;
do $$begin
 if not exists(select 1 from public.factura_alias_producto where texto_clave='legacy' and modo_stock='unidad' and pack_detectado=8) then raise exception 'MEMORY_NOT_SAVED';end if;
end$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000bb',true);
do $$begin if exists(select 1 from public.factura_alias_producto) then raise exception 'FOREIGN_MEMORY_VISIBLE';end if;end$$;
reset role;
rollback;
