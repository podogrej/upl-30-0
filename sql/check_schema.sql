-- ТІЛЬКИ ЧИТАННЯ: нічого не змінює. «Відбиток» схеми public (таблиці, колонки, індекси, політики, функції, тригери, права).
-- Запускати в основній базі (SQL Editor → Run) і в тестовій; результат — порівняти з тим, що будують A+B (tools/tests/setup.sh).
-- Тіла функцій і умови політик — md5, щоб результат був коротким.
with t as (
  select 'table' kind, c.relname name,
         'rls=' || c.relrowsecurity || ' rows≈' || greatest(c.reltuples, 0)::bigint || ' | ' ||
         (select string_agg(a.attname || ':' || format_type(a.atttypid, a.atttypmod) || case when a.attnotnull then '!' else '' end ||
                 coalesce('=' || left(pg_get_expr(d.adbin, d.adrelid), 40), ''), ', ' order by a.attnum)
            from pg_attribute a left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
           where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) detail
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
  union all
  select 'index', indexname, tablename || ' | ' || regexp_replace(indexdef, '^.* USING ', '')
    from pg_indexes where schemaname = 'public'
  union all
  select 'constraint', conname, conrelid::regclass || ' | ' || left(pg_get_constraintdef(oid), 120)
    from pg_constraint where connamespace = 'public'::regnamespace and contype in ('c', 'f', 'u', 'p')
  union all
  select 'policy', tablename || '.' || policyname,
         cmd || ' ' || array_to_string(roles, ',') || ' using:' || coalesce(left(md5(qual), 8), '-') || ' check:' || coalesce(left(md5(with_check), 8), '-')
    from pg_policies where schemaname = 'public'
  union all
  select 'function', p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
         case when p.prosecdef then 'definer ' else '' end || coalesce(array_to_string(p.proconfig, ','), '') ||
         ' body:' || left(md5(p.prosrc), 8) ||
         ' exec:' || coalesce((select string_agg(distinct g.grantee, ',') from information_schema.routine_privileges g
                                where g.routine_schema = 'public' and g.routine_name = p.proname and g.privilege_type = 'EXECUTE'
                                  and g.grantee in ('anon', 'authenticated', 'PUBLIC')), '-')
    from pg_proc p where p.pronamespace = 'public'::regnamespace
  union all
  select 'trigger', tgname, tgrelid::regclass || ' | ' || regexp_replace(pg_get_triggerdef(oid), '^.* ON ', '')
    from pg_trigger where not tgisinternal and tgrelid in (select oid from pg_class where relnamespace = 'public'::regnamespace)
  union all
  select 'grant', table_name || ':' || grantee, string_agg(privilege_type, ',' order by privilege_type)
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
   group by table_name, grantee
  union all
  select 'bucket', id, 'public=' || public from storage.buckets
)
select kind, name, detail from t
union all
select '#total', count(*)::text, md5(string_agg(kind || name || coalesce(detail, ''), '' order by kind, name)) from t
order by 1, 2;
