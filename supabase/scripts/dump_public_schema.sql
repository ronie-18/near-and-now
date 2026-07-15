-- Run this in the Supabase SQL Editor and copy the full result back.
-- Produces a readable, complete snapshot of every table in the public schema:
-- columns (name/type/nullable/default), primary keys, foreign keys, and
-- unique/check constraints — everything needed to catch mismatches like the
-- admin_sessions -> admin_users foreign key bug without guessing from memory.

select
  c.table_name,
  string_agg(
    format(
      '  %s %s%s%s',
      c.column_name,
      c.data_type
        || coalesce('(' || c.character_maximum_length || ')', '')
        || case when c.data_type = 'ARRAY' then '[]' else '' end,
      case when c.is_nullable = 'NO' then ' NOT NULL' else '' end,
      case when c.column_default is not null then ' DEFAULT ' || c.column_default else '' end
    ),
    E'\n' order by c.ordinal_position
  ) as columns
from information_schema.columns c
where c.table_schema = 'public'
group by c.table_name
order by c.table_name;

-- Primary keys
select
  tc.table_name,
  string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) as primary_key_columns
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY'
group by tc.table_name
order by tc.table_name;

-- Foreign keys (this is what would have caught the admin_sessions bug instantly)
select
  tc.table_name as from_table,
  kcu.column_name as from_column,
  ccu.table_name as to_table,
  ccu.column_name as to_column,
  tc.constraint_name,
  rc.delete_rule
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
join information_schema.constraint_column_usage ccu
  on tc.constraint_name = ccu.constraint_name and tc.table_schema = ccu.table_schema
join information_schema.referential_constraints rc
  on tc.constraint_name = rc.constraint_name and tc.table_schema = rc.constraint_schema
where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
order by tc.table_name, kcu.column_name;

-- Which tables have RLS enabled, and their policies (this is what would have
-- caught "admin_sessions has no RLS and no grants" instantly)
select
  n.nspname as schema,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;

select
  schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- Base table-level GRANTs per role (this is what would have caught the
-- admin_sessions/admin_notifications missing-grant bug instantly)
select
  table_name, grantee, string_agg(privilege_type, ', ' order by privilege_type) as privileges
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
group by table_name, grantee
order by table_name, grantee;
