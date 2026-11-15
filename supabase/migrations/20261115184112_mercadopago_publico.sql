-- Isolated MP storage. No existing sales, stock, cash or F5 tables are changed.
begin;
create schema if not exists mp_private;
revoke all on schema mp_private from public, anon, authenticated;

create table if not exists mp_private.accounts (
 id uuid primary key,
 commerce uuid not null,
 provider text not null unique check(provider ~ '^[0-9]{1,30}$'),
 data jsonb not null check(jsonb_typeof(data)='object'),
 version bigint not null default 1,
 refresh_state text not null default 'idle' check(refresh_state in ('idle','in_progress','needs_reauth')),
 refresh_owner uuid
);
create unique index if not exists mp_one_primary on mp_private.accounts(commerce)
 where data->>'active'='true' and data->>'primary'='true';
create index if not exists mp_accounts_commerce on mp_private.accounts(commerce);

create table if not exists mp_private.attempts (
 id uuid primary key,
 commerce uuid not null,
 sale text not null check(sale ~ '^[A-Za-z0-9_-]{1,60}$'),
 account uuid not null references mp_private.accounts(id),
 data jsonb not null check(jsonb_typeof(data)='object'),
 lease_owner uuid,
 lease_until timestamptz,
 unique(commerce,sale)
);
create index if not exists mp_attempts_account on mp_private.attempts(account);
create table if not exists mp_private.receipts (
 account uuid not null references mp_private.accounts(id),
 payment text not null check(length(payment) between 1 and 100),
 commerce uuid not null,
 sale text not null,
 data jsonb not null,
 primary key(account,payment),
 unique(commerce,sale)
);
create table if not exists mp_private.oauth (
 state_hash text primary key check(state_hash ~ '^[0-9a-f]{64}$'),
 encrypted text not null,
 expires_at timestamptz not null
);
create index if not exists mp_oauth_expiry on mp_private.oauth(expires_at);
create table if not exists mp_private.audit (
 id bigint generated always as identity primary key,
 at timestamptz not null default clock_timestamp(),
 commerce uuid not null,
 actor uuid not null,
 action text not null,
 reference text not null
);
alter table mp_private.accounts enable row level security;
alter table mp_private.attempts enable row level security;
alter table mp_private.receipts enable row level security;
alter table mp_private.oauth enable row level security;
alter table mp_private.audit enable row level security;
revoke all on all tables in schema mp_private from public, anon, authenticated, service_role;
revoke all on all sequences in schema mp_private from public, anon, authenticated, service_role;

-- Sole bridge exposed to PostgREST. Edge verifies Auth getUser + membership + F5
-- before calling it; callback only consumes the hashed opaque state before auth.
-- Each call is one short DB transaction. No provider fetch occurs in a DB transaction.
create or replace function public.mp_publico_store(p_op text,p_args jsonb)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, mp_private
as $$
declare
 c uuid; actor_id uuid; account_id uuid; owner_id uuid;
 a mp_private.accounts%rowtype;
 attempt_row mp_private.attempts%rowtype;
 receipt_row mp_private.receipts%rowtype;
 result jsonb; payload jsonb; patch jsonb; new_id uuid;
 sale_id text; state_data text; count_rows integer;
begin
 if jsonb_typeof(p_args) <> 'object' then raise exception 'DATOS_INVALIDOS'; end if;
 if p_op='state-consume' then
   delete from mp_private.oauth where state_hash=p_args->>'stateHash'
     returning case when expires_at>clock_timestamp() then encrypted else null end into state_data;
   return case when state_data is null then null else jsonb_build_object('encrypted',state_data) end;
 end if;
 c := (p_args->>'commerceId')::uuid; actor_id := (p_args->>'actor')::uuid;
 if c is null or actor_id is null then raise exception 'PERMISO_DENEGADO'; end if;
 -- Serializes aggregate mutations across Edge workers and commerce account choices.
 perform pg_advisory_xact_lock(hashtextextended('mp:'||c::text,0));
 if p_op='state-save' then
   delete from mp_private.oauth where expires_at<clock_timestamp();
   insert into mp_private.oauth(state_hash,encrypted,expires_at)
     values(p_args->>'stateHash',p_args->>'encrypted',clock_timestamp()+interval '10 minutes');
   return 'true'::jsonb;
 elsif p_op='accounts' then
   select coalesce(jsonb_agg(data||jsonb_build_object('version',version,'refreshState',refresh_state) order by id),'[]'::jsonb)
     into result from mp_private.accounts where commerce=c and data->>'active'='true';
   return result;
 elsif p_op='provider-account' then
   select * into a from mp_private.accounts where provider=p_args->>'providerId';
   if found and a.commerce<>c then raise exception 'CUENTA_OTRO_COMERCIO'; end if;
   return case when a.id is null then null else jsonb_build_object('id',a.id) end;
 elsif p_op='account-save' then
   select * into a from mp_private.accounts where provider=p_args->>'providerId' for update;
   if found and a.commerce<>c then raise exception 'CUENTA_OTRO_COMERCIO'; end if;
   new_id := (p_args->>'id')::uuid;
   if a.id is not null and a.id<>new_id then raise exception 'RECONECTAR_CUENTA'; end if;
   if length(p_args->>'alias') not between 1 and 80 or length(p_args->>'credentials')<1 then raise exception 'DATOS_INVALIDOS'; end if;
   payload := coalesce(a.data,'{}'::jsonb)||jsonb_build_object('id',new_id,'commerceId',c,'providerId',p_args->>'providerId','alias',p_args->>'alias','credentials',p_args->>'credentials','active',true,
     'primary',case when a.data->>'active'='true' then coalesce((a.data->>'primary')::boolean,false)
       else not exists(select 1 from mp_private.accounts where commerce=c and data->>'active'='true') end);
   insert into mp_private.accounts(id,commerce,provider,data) values(new_id,c,p_args->>'providerId',payload)
   on conflict(id) do update set data=excluded.data,version=accounts.version+1,refresh_state='idle',refresh_owner=null;
   insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,'connected',new_id::text);
   return payload;
 elsif p_op='receipts' then
   select coalesce(jsonb_agg(data order by sale),'[]'::jsonb) into result from mp_private.receipts
     where commerce=c and sale in(select jsonb_array_elements_text(p_args->'saleIds'));
   return result;
 elsif p_op='attempt' then
   select data into result from mp_private.attempts where commerce=c and sale=p_args->>'saleId';return result;
 elsif p_op='sale-recover' then
   -- Edge supplies its authenticated membership/F5 context, as for all store
   -- mutations. Same commerce advisory lock coordinates recovery/disconnect
   -- and leases. Never return account credentials or reserve an unknown sale.
   if p_args->>'action' is null or p_args->>'action' not in('manual','qr-status','qr-cancel') then raise exception 'ACCION_INVALIDA';end if;
   select * into attempt_row from mp_private.attempts where commerce=c and sale=p_args->>'saleId' for update;
   if attempt_row.id is null then return null;end if;
   if attempt_row.account::text is distinct from p_args->>'accountId'
     or attempt_row.data->>'amountCents' is distinct from p_args->>'amountCents'
     or attempt_row.data->>'fingerprint' is distinct from p_args->>'fingerprint' then raise exception 'TICKET_CAMBIO';end if;
   if attempt_row.data->>'status' not in('canceled','expired','manual','verified') then return null;end if;
   if attempt_row.lease_owner is not null and attempt_row.lease_until>clock_timestamp() then raise exception 'COBRO_OCUPADO';end if;
   select * into receipt_row from mp_private.receipts where commerce=c and sale=attempt_row.sale and account=attempt_row.account;
   if receipt_row.account is not null then return jsonb_build_object('attempt',attempt_row.data,'receipt',receipt_row.data);end if;
   if attempt_row.data->>'status'='verified' then raise exception 'QR_PENDIENTE';end if;
   if p_args->>'action'='manual' then
     if attempt_row.data->>'status'<>'manual' then
       update mp_private.attempts set data=data||jsonb_build_object('status','manual') where id=attempt_row.id returning data into result;
       insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,'manual',attempt_row.sale);
     else result := attempt_row.data;end if;
     return jsonb_build_object('ok',true,'attempt',result,'receipt',null);
   end if;
   return jsonb_build_object('attempt',attempt_row.data,'receipt',null);
 end if;

 if p_op in ('sale-update','sale-release','claim') then
   sale_id := p_args->>'saleId';owner_id := (p_args->>'owner')::uuid;
   select * into attempt_row from mp_private.attempts where commerce=c and sale=sale_id for update;
   if attempt_row.id is null or attempt_row.lease_owner is distinct from owner_id or attempt_row.lease_until<=clock_timestamp() then
     if p_op='sale-release' then return 'false'::jsonb; end if;
     raise exception 'COBRO_OCUPADO';
   end if;
   if p_op='sale-release' then
     update mp_private.attempts set lease_owner=null,lease_until=null where id=attempt_row.id;return 'true'::jsonb;
   elsif p_op='sale-update' then
     patch := p_args->'patch';
     if jsonb_typeof(patch)<>'object' or exists(select 1 from jsonb_object_keys(patch) k where k not in('status','orderId','qrData')) then raise exception 'DATOS_INVALIDOS'; end if;
     if patch ? 'status' and patch->>'status' not in('prepared','creating','created','processed','canceled','expired','action_required','failed','manual','verified','rejected') then raise exception 'DATOS_INVALIDOS'; end if;
     if attempt_row.data->>'status' in ('manual','verified') and patch->>'status' is distinct from attempt_row.data->>'status' then raise exception 'COBRO_FINALIZADO_MANUAL'; end if;
     if attempt_row.data->>'orderId' is not null and patch ? 'orderId' and patch->>'orderId' is distinct from attempt_row.data->>'orderId' then raise exception 'QR_PENDIENTE'; end if;
     if patch->>'status'='manual' and attempt_row.data->>'status' not in('prepared','canceled','expired','manual') then raise exception 'QR_PENDIENTE'; end if;
     payload := attempt_row.data||patch;
     update mp_private.attempts set data=payload where id=attempt_row.id;
     if patch->>'status'='manual' then insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,'manual',sale_id);end if;
     return payload;
   elsif p_op='claim' then
     if attempt_row.data->>'status'='manual' then raise exception 'COBRO_FINALIZADO_MANUAL'; end if;
     if p_args->>'kind' not in('qr','transfer') then raise exception 'DATOS_INVALIDOS'; end if;
     if p_args->>'kind'='transfer' and (attempt_row.data->>'orderId' is not null or attempt_row.data->>'status'='creating') then raise exception 'QR_PENDIENTE'; end if;
     select * into receipt_row from mp_private.receipts where account=attempt_row.account and payment=p_args->>'paymentId';
     if found then
       if receipt_row.commerce<>c or receipt_row.sale<>sale_id then raise exception 'TRANSFERENCIA_UTILIZADA';end if;
       return receipt_row.data;
     end if;
     if exists(select 1 from mp_private.receipts where commerce=c and sale=sale_id) then raise exception 'VENTA_YA_VERIFICADA';end if;
     payload := jsonb_build_object('commerceId',c,'saleId',sale_id,'accountId',attempt_row.account,'paymentId',p_args->>'paymentId','amountCents',(attempt_row.data->>'amountCents')::bigint,'kind',p_args->>'kind','verifiedAt',clock_timestamp(),'actor',actor_id);
     insert into mp_private.receipts(account,payment,commerce,sale,data) values(attempt_row.account,p_args->>'paymentId',c,sale_id,payload);
     update mp_private.attempts set data=data||jsonb_build_object('status','verified') where id=attempt_row.id;
     insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,'verified',sale_id);
     return payload;
   end if;
 end if;

 account_id := (p_args->>'accountId')::uuid;
 select * into a from mp_private.accounts where id=account_id and commerce=c for update;
 if a.id is null or a.data->>'active'<>'true' then raise exception 'CUENTA_NO_DISPONIBLE'; end if;
 if p_op='account' then return a.data||jsonb_build_object('version',a.version,'refreshState',a.refresh_state);
 elsif p_op='primary' then
   update mp_private.accounts set data=data||jsonb_build_object('primary',false) where commerce=c and data->>'primary'='true';
   update mp_private.accounts set data=data||jsonb_build_object('primary',true) where id=account_id;
   insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,p_op,account_id::text);return 'true'::jsonb;
 elsif p_op='disconnect' then
   if exists(select 1 from mp_private.attempts where account=account_id and data->>'status' not in('canceled','expired','verified','manual')) then raise exception 'COBRO_PENDIENTE'; end if;
   if a.refresh_state='in_progress' then raise exception 'COBRO_PENDIENTE';end if;
   update mp_private.accounts set data=data||jsonb_build_object('active',false,'primary',false,'credentials',''),version=version+1,refresh_state='needs_reauth',refresh_owner=null where id=account_id;
   if not exists(select 1 from mp_private.accounts where commerce=c and data->>'active'='true' and data->>'primary'='true') then
     update mp_private.accounts set data=data||jsonb_build_object('primary',true) where id=(select id from mp_private.accounts where commerce=c and data->>'active'='true' order by id limit 1);
   end if;
   insert into mp_private.audit(commerce,actor,action,reference) values(c,actor_id,p_op,account_id::text);return 'true'::jsonb;
 elsif p_op='position' then
   if length(p_args->>'posId') not between 1 and 100 then raise exception 'DATOS_INVALIDOS';end if;
   update mp_private.accounts set data=data||jsonb_build_object('posId',p_args->>'posId') where id=account_id;return 'true'::jsonb;
 elsif p_op='used' then
   select data into result from mp_private.receipts where account=account_id and payment=p_args->>'paymentId';return result;
 elsif p_op='refresh-begin' then
   if a.refresh_state<>'idle' or a.version<>(p_args->>'version')::bigint then return 'false'::jsonb;end if;
   update mp_private.accounts set refresh_state='in_progress',refresh_owner=(p_args->>'owner')::uuid where id=account_id;return 'true'::jsonb;
 elsif p_op in('refresh-finish','refresh-fail') then
   if a.refresh_state<>'in_progress' or a.refresh_owner is distinct from (p_args->>'owner')::uuid then return 'false'::jsonb;end if;
   if p_op='refresh-finish' then
     update mp_private.accounts set data=data||jsonb_build_object('credentials',p_args->>'credentials'),version=version+1,refresh_state='idle',refresh_owner=null where id=account_id;
   else update mp_private.accounts set refresh_state='needs_reauth',refresh_owner=null where id=account_id;end if;
   return 'true'::jsonb;
 elsif p_op='sale-begin' then
   sale_id := p_args->>'saleId';owner_id := (p_args->>'owner')::uuid;
   if (p_args->>'amountCents')::bigint<=0 or (p_args->>'amountCents')::bigint>99999999999999 or length(p_args->>'fingerprint') not between 1 and 128 then raise exception 'DATOS_INVALIDOS';end if;
   select * into attempt_row from mp_private.attempts where commerce=c and sale=sale_id for update;
   if attempt_row.id is null then
     new_id := gen_random_uuid();
     payload := jsonb_build_object('id',new_id,'commerceId',c,'saleId',sale_id,'accountId',account_id,'amountCents',(p_args->>'amountCents')::bigint,'fingerprint',p_args->>'fingerprint','actor',actor_id,'status',case when p_args->>'cancelIfMissing'='true' then 'canceled' else 'prepared' end,'orderId',null,'qrData',null,'createdAt',clock_timestamp(),'reference','MC_'||replace(new_id::text,'-',''),'posId',p_args->>'posId');
     insert into mp_private.attempts(id,commerce,sale,account,data,lease_owner,lease_until) values(new_id,c,sale_id,account_id,payload,owner_id,clock_timestamp()+interval '90 seconds');
     return payload;
   end if;
   if attempt_row.account<>account_id or attempt_row.data->>'amountCents'<>p_args->>'amountCents' or attempt_row.data->>'fingerprint'<>p_args->>'fingerprint' then raise exception 'TICKET_CAMBIO';end if;
   if attempt_row.lease_owner is not null and attempt_row.lease_until>clock_timestamp() then return null;end if;
   -- Recover legacy prepared rows that reserved a sale before a POS was configured.
   -- Once creating, a POS is immutable because the provider may have seen the body.
   if attempt_row.data->>'status'='prepared' and coalesce(attempt_row.data->>'posId','')='' and coalesce(p_args->>'posId','')<>'' then
     attempt_row.data := attempt_row.data||jsonb_build_object('posId',p_args->>'posId');
   end if;
   update mp_private.attempts set data=attempt_row.data,lease_owner=owner_id,lease_until=clock_timestamp()+interval '90 seconds' where id=attempt_row.id;
   return attempt_row.data;
 end if;
 raise exception 'ACCION_INVALIDA';
exception when unique_violation then
 if p_op='account-save' then raise exception 'CUENTA_OTRO_COMERCIO'; end if;
 if p_op='claim' then raise exception 'TRANSFERENCIA_UTILIZADA'; end if;
 raise;
end;
$$;
revoke all on function public.mp_publico_store(text,jsonb) from public,anon,authenticated;
grant execute on function public.mp_publico_store(text,jsonb) to service_role;
comment on function public.mp_publico_store(text,jsonb) is 'Internal MP bridge. service_role only. Edge must validate Auth, membership and F5 before calling. Opaque state consumption is the only callback pre-auth operation.';
commit;
