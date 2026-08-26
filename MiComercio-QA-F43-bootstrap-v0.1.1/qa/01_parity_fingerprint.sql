-- Mi Comercio — PARITY FINGERPRINT v0.1
-- READ ONLY. Ejecutar sobre el SANDBOX después de reconstruir.
-- PASS requiere igualdad exacta con EXPECTED_PROD_FINGERPRINT.json.
--
-- La huella MD5 se usa sólo como checksum determinista de estructura.
-- El MANIFEST del paquete usa SHA-256.

with
cols as (
  select format('%I.%I|%s|%s|%s|%s',
                table_schema, table_name, ordinal_position,
                column_name, udt_name, coalesce(column_default,''))
         || '|' || is_nullable as s
  from information_schema.columns
  where table_schema in ('public','private')
  order by table_schema,table_name,ordinal_position
),
rels as (
  select format('%I.%I|%s|rls=%s|forcerls=%s',
                n.nspname,c.relname,c.relkind,c.relrowsecurity,c.relforcerowsecurity) as s
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private')
    and c.relkind in ('r','p','v','m')
  order by n.nspname,c.relname
),
funcs as (
  select format('%I.%I(%s)|%s',
                n.nspname,p.proname,
                pg_get_function_identity_arguments(p.oid),
                regexp_replace(pg_get_functiondef(p.oid),'\s+',' ','g')) as s
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','private')
  order by n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)
),
pols as (
  select format('%I.%I|%s|%s|%s|%s|%s|%s',
                schemaname,tablename,policyname,permissive,
                array_to_string(roles,','),cmd,
                coalesce(qual,''),coalesce(with_check,'')) as s
  from pg_policies
  where schemaname in ('public','private')
  order by schemaname,tablename,policyname
),
idx as (
  select format('%I.%I|%s|%s',
                n.nspname,t.relname,i.relname,
                regexp_replace(pg_get_indexdef(i.oid),'\s+',' ','g')) as s
  from pg_index x
  join pg_class i on i.oid=x.indexrelid
  join pg_class t on t.oid=x.indrelid
  join pg_namespace n on n.oid=t.relnamespace
  where n.nspname in ('public','private')
  order by n.nspname,t.relname,i.relname
),
cons as (
  select format('%I.%I|%s|%s|%s',
                n.nspname,c.relname,k.conname,k.contype,
                regexp_replace(pg_get_constraintdef(k.oid,true),'\s+',' ','g')) as s
  from pg_constraint k
  join pg_class c on c.oid=k.conrelid
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private')
  order by n.nspname,c.relname,k.conname
),
views as (
  select format('%I.%I|%s',
                n.nspname,c.relname,
                regexp_replace(pg_get_viewdef(c.oid,true),'\s+',' ','g')) as s
  from pg_class c
  join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','private')
    and c.relkind in ('v','m')
  order by n.nspname,c.relname
),
grants as (
  select format('%s|%s|%s|%s|%s',
                table_schema,table_name,grantee,privilege_type,is_grantable) as s
  from information_schema.role_table_grants
  where table_schema in ('public','private')
    and grantee in ('anon','authenticated','public')
  order by table_schema,table_name,grantee,privilege_type
),
actual as (
  select
    (select count(*) from rels)::int rel_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from rels) rel_hash,
    (select count(*) from cols)::int column_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from cols) column_hash,
    (select count(*) from funcs)::int function_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from funcs) function_hash,
    (select count(*) from pols)::int policy_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from pols) policy_hash,
    (select count(*) from idx)::int index_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from idx) index_hash,
    (select count(*) from cons)::int constraint_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from cons) constraint_hash,
    (select count(*) from views)::int view_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from views) view_hash,
    (select count(*) from grants)::int grant_count,
    (select md5(coalesce(string_agg(s,E'\n'),'')) from grants) grant_hash
)
select
  a.*,
  a.rel_count=45 and a.rel_hash='cae8a81ca51cbcfaddc6ecfb49d4f121' as pass_relations,
  a.column_count=497 and a.column_hash='de8654550a061a61a2711fba6571e7b3' as pass_columns,
  a.function_count=65 and a.function_hash='999ac5f35c31f8aff5eed40676d7f340' as pass_functions,
  a.policy_count=51 and a.policy_hash='3b005cffc52efd047169e9c960d4ae1f' as pass_policies,
  a.index_count=109 and a.index_hash='79ad6aa6a987520f5cce8ac2ba5816f2' as pass_indexes,
  a.constraint_count=253 and a.constraint_hash='805ec531e984f3729dda667810d0b7f6' as pass_constraints,
  a.view_count=4 and a.view_hash='46188c1ac1a8db0c8079d0af9b729cba' as pass_views,
  a.grant_count=80 and a.grant_hash='253fc97beb9e2b2f80d47679cbfa237b' as pass_grants,
  (
    a.rel_count=45 and a.rel_hash='cae8a81ca51cbcfaddc6ecfb49d4f121'
    and a.column_count=497 and a.column_hash='de8654550a061a61a2711fba6571e7b3'
    and a.function_count=65 and a.function_hash='999ac5f35c31f8aff5eed40676d7f340'
    and a.policy_count=51 and a.policy_hash='3b005cffc52efd047169e9c960d4ae1f'
    and a.index_count=109 and a.index_hash='79ad6aa6a987520f5cce8ac2ba5816f2'
    and a.constraint_count=253 and a.constraint_hash='805ec531e984f3729dda667810d0b7f6'
    and a.view_count=4 and a.view_hash='46188c1ac1a8db0c8079d0af9b729cba'
    and a.grant_count=80 and a.grant_hash='253fc97beb9e2b2f80d47679cbfa237b'
  ) as pass_structural_parity
from actual a;
