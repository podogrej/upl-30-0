-- 0.92 share: the result link (/r/<id>) shows a daily-challenge season as the challenge (day, score, condition met).
-- seasons_pub gets three columns at the end (vd_day, vd_score, vd_gate); the squad (xi) of a daily-challenge season is hidden
-- until the challenge day is over (Kyiv), so a shared link is not the answer. Same column list and order as v087 otherwise.
-- Safe to run again; only adds (index, column seasons.vd_day, view columns at the end, wider check), player_profile keeps its JSON.
-- Old site versions read only the columns they name and do not send vd_day.
create index if not exists vd_results_season_idx on public.vd_results (season_id);
-- challenge day stored with the season itself (sent by the site): the squad stays hidden even if the server gave no seed
alter table public.seasons add column if not exists vd_day date;
create or replace view public.seasons_pub with (security_invoker = false) as
select s.id, s.created_at, s.nickname, s.mode, s.format, s.club, s.formation, s.year, s.version,
       s.w, s.d, s.l, s.pts, s.place, s.gf, s.ga, s.gd, s.xp, s.xg, s.xga, s.tier, s.perfect, s.golden, s.practice, s.day,
       case when coalesce(v.day, ss.vd_day, s.vd_day) >= (now() at time zone 'Europe/Kyiv')::date then null else s.xi end as xi,
       s.tbl, s.verified, s.competition, s.data_version, s.era, s.show_r, s.player_id,
       s.fl_id is not null as in_fl,
       case when p.id is null then null else json_build_object('name', p.name, 'anon_name', p.anon_name, 'public_id', p.public_id) end as players,
       v.day as vd_day, v.score as vd_score, v.gate_ok as vd_gate
  from public.seasons s
  left join public.players p on p.id = s.player_id
  left join public.season_seeds ss on ss.id = s.seed_id   -- challenge day also for a season the server did not verify
  left join lateral (select r.day, r.score, r.gate_ok from public.vd_results r where r.season_id = s.id order by r.id limit 1) v on true;
revoke all on public.seasons_pub from public, anon, authenticated;
grant select on public.seasons_pub to anon, authenticated;

-- traffic_events: 'share' event (utm_medium = channel). The check only widens, so the old site keeps working.
do $$ begin
  if to_regclass('public.traffic_events') is not null then
    alter table public.traffic_events drop constraint if exists traffic_events_event_check;
    alter table public.traffic_events add constraint traffic_events_event_check check (event in ('visit', 'season_start', 'season_finish', 'share'));
  end if;
end $$;

-- player_profile (base: sql/v090_profile_verified.sql): favourite player and club skip today's daily-challenge seasons and their
-- average rating is not shown,
-- otherwise they would hint at the hidden squad. Same signature, same JSON, same grants.
create or replace function public.player_profile(p_player uuid) returns json language plpgsql stable security definer set search_path = public as $$
declare pid uuid := p_player; p players%rowtype; hops int := 0; res json;
begin
  loop
    select * into p from players where id = pid;
    exit when not found or p.merged_into is null or hops >= 5;
    pid := p.merged_into; hops := hops + 1;
  end loop;
  if p.id is null then return null; end if;
  if p.deleted_at is not null then
    return json_build_object('public_id', p.public_id, 'name', public.name_key(p.anon_name), 'anon', true, 'deleted', true);
  end if;
  with s as (
    select se.id, se.created_at, se.day, se.mode, se.format, se.club, se.formation, se.w, se.d, se.l, se.pts, se.place, se.gf, se.ga, se.xi,
           case when se.day is not null then 'daily' when se.mode = 'pick' then 'pick' else se.format end as b,
           coalesce((select r.day from vd_results r where r.season_id = se.id order by r.id limit 1),
                    (select ss.vd_day from season_seeds ss where ss.id = se.seed_id), se.vd_day)
             >= (now() at time zone 'Europe/Kyiv')::date as vd_today
      from seasons se where se.player_id = pid and not se.practice and se.mode <> 'practice' and se.verified is true
  ), n as (
    select count(*) seasons, count(*) filter (where place = 1 and format <> 'anti') champions,
           count(*) filter (where w = 30 and format <> 'anti') perfect,
           sum(w) filter (where format <> 'anti') wins, count(*) filter (where format <> 'anti') games,
           max(pts) filter (where format = 'classic') best_classic, min(created_at) first_at
      from s
  ), rk as (
    select s.id, s.b, s.pts, s.w, s.d, s.l, s.place, s.formation, s.mode, s.club, s.day, s.created_at,
           case when coalesce(s.vd_today, false) then null else (select round(avg(case when coalesce(x->>'r0', x->>'r') ~ '^\d{1,3}(\.\d+)?$' then coalesce(x->>'r0', x->>'r')::numeric end), 1)
              from jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x) end avg_r,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end desc,
                                                        case when s.b = 'anti' then -s.place else s.place end, s.gf - s.ga desc, s.created_at) best_n,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end,
                                                        case when s.b = 'anti' then -s.place else s.place end desc, s.gf - s.ga, s.created_at) worst_n,
           count(*) over (partition by s.b) bn
      from s
  ), xi as (
    select x from s, jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x where not coalesce(s.vd_today, false)
  ), fc as (
    select x->>'c' c, count(*) k from xi where coalesce(x->>'c', '') <> '' group by 1 order by 2 desc, 1 limit 1
  ), fp as (
    select x->>'id' id, max(x->>'n') n, count(*) k from xi where coalesce(x->>'id', '') <> '' group by 1 order by 3 desc, 2 limit 1
  ), tr as (
    select trophy, min(created_at) at from trophies where player_id = pid group by trophy
  ), dd as (
    select distinct day from daily_results where player_id = pid
  ), isl as (
    select max(day) z, count(*) k from (select day, day - (row_number() over (order by day))::int g from dd) q group by g
  )
  select json_build_object(
    'public_id', p.public_id,
    'name', public.name_key(coalesce(p.name, p.anon_name)),
    'anon', p.name is null,
    'since', least(p.created_at, n.first_at),
    'seasons', n.seasons, 'champions', n.champions, 'perfect', n.perfect, 'best_classic', n.best_classic,
    'win_pct', case when n.games > 0 then round(100.0 * n.wins / (30 * n.games)) end,
    'best', (select json_object_agg(b, json_build_object('id', id, 'pts', pts, 'w', w, 'd', d, 'l', l, 'place', place, 'formation', formation,
                                                          'mode', mode, 'club', club, 'day', day, 'at', created_at::date, 'avg', avg_r)) from rk where best_n = 1),
    'worst', (select json_object_agg(b, json_build_object('id', id, 'pts', pts, 'w', w, 'd', d, 'l', l, 'place', place, 'formation', formation,
                                                          'mode', mode, 'club', club, 'day', day, 'at', created_at::date, 'avg', avg_r)) from rk where worst_n = 1 and bn > 1),
    'fav_club', (select json_build_object('c', c, 'k', k, 'pct', round(100.0 * k / nullif((select count(*) from xi), 0))) from fc),
    'fav_player', (select json_build_object('id', id, 'n', n, 'k', k) from fp),
    'trophies', coalesce((select json_agg(json_build_object('id', trophy, 'at', at::date) order by at desc) from tr), '[]'::json),
    'streak_best', coalesce((select max(k) from isl), 0),
    'streak_now', coalesce((select max(k) from isl where z >= (now() at time zone 'Europe/Kyiv')::date - 1), 0)
  ) into res from n;
  return res;
end $$;
revoke execute on function public.player_profile(uuid) from public;
grant execute on function public.player_profile(uuid) to anon, authenticated;

-- check: expected one row "t | t | t | t"
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seasons_pub' and column_name = 'vd_score') as has_vd,
       not has_table_privilege('anon', 'public.vd_results', 'select') as vd_results_closed,
       coalesce((select pg_get_constraintdef(oid) like '%share%' from pg_constraint where conname = 'traffic_events_event_check'), to_regclass('public.traffic_events') is null) as share_ok,
       pg_get_functiondef('public.player_profile(uuid)'::regprocedure) like '%vd_today%' as profile_ok;
