-- Explicit Data API grants. From 30.10.2026 Supabase stops granting access to new tables in "public" automatically;
-- existing tables keep their grants. This file writes down the grants the main DB has today (checked 21.10.2026),
-- so a DB built from scratch gets the same access, and keeps the server role working for tables created later.
-- Safe to run again; on an existing DB it changes nothing (same grants). Grants nothing new to anon/authenticated.

-- server role (api/ via service key): everything in public, as today; also for tables and sequences created later
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;

-- site (anon/authenticated): read-only public views and the own-state table guarded by RLS; nothing else
do $$
declare r text;
begin
  foreach r in array array['seasons_pub', 'challenges_pub', 'challenge_results_pub'] loop
    if to_regclass('public.' || r) is not null then execute format('grant select on public.%I to anon, authenticated', r); end if;
  end loop;
  if to_regclass('public.user_state') is not null then
    grant select, insert, update, delete on public.user_state to anon, authenticated;
  end if;
end $$;
