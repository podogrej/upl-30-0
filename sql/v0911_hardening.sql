-- 0.91.1 hardening (weekly security review 19.10.2026). Only grants change; safe to run again.
-- The site writes only user_state directly; everything else goes through the server (service key) or security definer RPCs,
-- and security definer functions and *_pub views run as their owner, so these revokes do not touch them.
-- Undo: grant <privilege> on <table> to anon, authenticated.

-- 1. pg_net (channel tick, sql/v0912_channel_cron.sql): only pg_cron (postgres) calls it
do $$ begin
  if exists (select 1 from pg_namespace where nspname = 'net') then
    execute 'revoke all on schema net from anon, authenticated';
    execute 'revoke all on all functions in schema net from anon, authenticated';
    execute 'revoke all on all tables in schema net from anon, authenticated';
  end if;
end $$;

-- 2. no direct writes by anon/authenticated (RLS already blocked them); no direct reads of tables the site never reads
do $$ declare t text; begin
  foreach t in array array['app_marks', 'challenge_results', 'challenges', 'daily_results', 'league_boards', 'league_members',
                           'league_results', 'leagues', 'player_links', 'players', 'season_seeds', 'seasons', 'tg_logins', 'trophies',
                           'f5_rooms', 'f5_players', 'f5_picks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on public.%I from anon, authenticated', t);
    end if;
  end loop;
  foreach t in array array['app_marks', 'league_boards', 'player_links', 'season_seeds', 'tg_logins', 'f5_rooms', 'f5_players', 'f5_picks'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke select on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

-- 3. fl_get: before a 5x5 league is played, other members' formation is hidden too (DECISIONS item 22), not only their xi
create or replace function public.fl_get(p_id text)
 returns json language sql stable security definer set search_path to 'public'
as $function$
  with f as (select public.fl_get_full(p_id) j),
  me as (select pl.public_id from player_links k join players pl on pl.id = k.player_id
          where k.kind = 'auth' and k.key = auth.uid()::text limit 1)
  select case
    when f.j is null or f.j->>'fmt' is distinct from '5' or coalesce(json_typeof(f.j->'result'), 'null') <> 'null'
         or coalesce(auth.role(), '') = 'service_role' then f.j
    else (f.j::jsonb || jsonb_build_object(
            'fives_n', json_array_length(f.j->'fives'),
            'fives', coalesce((select jsonb_agg(case when x.v->>'u' = (select public_id from me) then x.v else x.v - 'xi' - 'form' end order by x.o)
                                 from jsonb_array_elements(f.j::jsonb->'fives') with ordinality x(v, o)), '[]'::jsonb)))::json
  end from f;
$function$;
revoke execute on function public.fl_get(text) from public;
grant execute on function public.fl_get(text) to anon, authenticated;

-- check: expected no rows
select table_name, grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated')
   and (privilege_type in ('INSERT', 'UPDATE', 'DELETE') and table_name <> 'user_state'
        or privilege_type = 'SELECT' and table_name in ('app_marks', 'league_boards', 'player_links', 'season_seeds', 'tg_logins', 'f5_rooms', 'f5_players', 'f5_picks'));
