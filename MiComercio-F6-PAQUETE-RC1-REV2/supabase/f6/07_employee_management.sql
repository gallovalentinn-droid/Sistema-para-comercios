-- F6: lista completa para gestionar empleados, incluidos los suspendidos.
-- Las mutaciones siguen pasando por f5_actualizar_miembro y conservan su auditoría.

create or replace function private._f6_listar_miembros_gestion(p_comercio_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_uid uuid:=(select auth.uid());
  v_items jsonb;
  v_total bigint;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  if p_comercio_id is null then raise exception 'F6_COMERCIO_REQUIRED'; end if;
  if not exists (
    select 1
      from public.comercio_miembros actor
     where actor.comercio_id=p_comercio_id
       and actor.user_id=v_uid
       and actor.activo
       and actor.rol in ('duenio','admin')
  ) then raise exception 'ROLE_REQUIRED'; end if;

  select count(*)
    into v_total
    from public.comercio_miembros member
   where member.comercio_id=p_comercio_id;

  select coalesce(jsonb_agg(to_jsonb(roster) order by roster.activo desc,roster.created_at,roster.user_id),'[]'::jsonb)
    into v_items
    from (
      select member.user_id,identity.usuario_normalizado as usuario,member.nombre_mostrado,
             member.rol,member.permisos,member.permission_version,member.activo,
             member.created_at,member.updated_at,member.revoked_at
        from public.comercio_miembros member
        left join private.f5_login_identidades identity
          on identity.comercio_id=member.comercio_id
         and identity.user_id=member.user_id
       where member.comercio_id=p_comercio_id
    ) roster;

  return jsonb_build_object('items',v_items,'total',v_total);
end
$function$;

create or replace function public.f6_listar_miembros_gestion(p_comercio_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
  select private._f6_listar_miembros_gestion(p_comercio_id)
$function$;

revoke all on function private._f6_listar_miembros_gestion(uuid) from public,anon,authenticated,service_role;
revoke all on function public.f6_listar_miembros_gestion(uuid) from public,anon,authenticated,service_role;
grant execute on function private._f6_listar_miembros_gestion(uuid) to authenticated;
grant execute on function public.f6_listar_miembros_gestion(uuid) to authenticated;
