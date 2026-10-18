-- Channel queue tick from the database (pg_cron + pg_net) instead of the GitHub Actions schedule (.github/workflows/channel.yml).
-- The token is generated here and never typed by a person: pg_cron sends it, the server checks it with cron_token_ok (service role only).
-- Part 1: both databases (and tools/tests/setup.sh). Safe to run again; the token is kept.
create table if not exists public.app_secrets (name text primary key, value text not null, created_at timestamptz not null default now());
alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from public, anon, authenticated;
insert into public.app_secrets (name, value)
  values ('channel_cron', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  on conflict (name) do nothing;

create or replace function public.cron_token_ok(p_token text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(length(p_token) = 64 and p_token = (select value from public.app_secrets where name = 'channel_cron'), false);
$$;
revoke all on function public.cron_token_ok(text) from public, anon, authenticated;
grant execute on function public.cron_token_ok(text) to service_role;

-- schedules the tick (upsert by job name); minutes 5, 15, ... so it never overlaps the GitHub schedule at 0, 10, ...
create or replace function public.channel_cron_on(p_base text) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  if p_base !~ '^https://[a-z0-9.-]+$' then raise exception 'base url?'; end if;
  return cron.schedule('channel', '5-59/10 * * * *', format(
    $c$select net.http_get(url := %L, headers := jsonb_build_object('Authorization', 'Bearer ' || (select value from public.app_secrets where name = 'channel_cron')), timeout_milliseconds := 30000)$c$,
    p_base || '/api/cron?task=channel'));
end $$;
revoke all on function public.channel_cron_on(text) from public, anon, authenticated;

-- check: expected one row, token_ok = true, anon_read = false
select (select count(*) from public.app_secrets where name = 'channel_cron') as tokens,
       public.cron_token_ok((select value from public.app_secrets where name = 'channel_cron')) as token_ok,
       has_table_privilege('anon', 'public.app_secrets', 'select') as anon_read;

-- Part 2: main database only, run by hand after Part 1:
--   create extension if not exists pg_cron;
--   create extension if not exists pg_net;
--   select public.channel_cron_on('https://upl30.com.ua');
--   check after ~10 min: select status_code, left(content, 120) from net._http_response order by created desc limit 3;
-- undo: select cron.unschedule('channel');
