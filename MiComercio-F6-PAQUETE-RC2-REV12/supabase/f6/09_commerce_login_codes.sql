-- F6: todo comercio nuevo recibe de forma automática el código de acceso
-- que necesitan sus empleados. También repara comercios creados después
-- del backfill original de F5.

create or replace function private.f6_ensure_comercio_login_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
      from private.f5_login_comercios login_code
     where login_code.comercio_id=new.id
  ) then
    return new;
  end if;

  loop
    begin
      insert into private.f5_login_comercios(comercio_id,codigo_normalizado)
      values(new.id,lower(substr(replace(gen_random_uuid()::text,'-',''),1,10)));
      return new;
    exception
      when unique_violation then
        if exists (
          select 1
            from private.f5_login_comercios login_code
           where login_code.comercio_id=new.id
        ) then
          return new;
        end if;
    end;
  end loop;
end
$function$;

revoke all on function private.f6_ensure_comercio_login_code() from public,anon,authenticated,service_role;

drop trigger if exists f6_ensure_comercio_login_code_after_insert on public.comercios;
create trigger f6_ensure_comercio_login_code_after_insert
after insert on public.comercios
for each row execute function private.f6_ensure_comercio_login_code();

do $backfill$
declare
  v_comercio uuid;
begin
  for v_comercio in
    select comercio.id
      from public.comercios comercio
      left join private.f5_login_comercios login_code on login_code.comercio_id=comercio.id
     where login_code.comercio_id is null
  loop
    loop
      begin
        insert into private.f5_login_comercios(comercio_id,codigo_normalizado)
        values(v_comercio,lower(substr(replace(gen_random_uuid()::text,'-',''),1,10)));
        exit;
      exception
        when unique_violation then
          exit when exists (
            select 1
              from private.f5_login_comercios login_code
             where login_code.comercio_id=v_comercio
          );
      end;
    end loop;
  end loop;
end
$backfill$;
