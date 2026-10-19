-- 0.92 share: the result link (/r/<id>) shows a daily-challenge season as the challenge (day, score, condition met).
-- seasons_pub gets three columns at the end (vd_day, vd_score, vd_gate); the squad (xi) of a daily-challenge season is hidden
-- until the challenge day is over (Kyiv), so a shared link is not the answer. Same column list and order as v087 otherwise.
-- Safe to run again; changes nothing in the tables. Old site versions read only the columns they name.
create index if not exists vd_results_season_idx on public.vd_results (season_id);
create or replace view public.seasons_pub with (security_invoker = false) as
select s.id, s.created_at, s.nickname, s.mode, s.format, s.club, s.formation, s.year, s.version,
       s.w, s.d, s.l, s.pts, s.place, s.gf, s.ga, s.gd, s.xp, s.xg, s.xga, s.tier, s.perfect, s.golden, s.practice, s.day,
       case when v.day >= (now() at time zone 'Europe/Kyiv')::date then null else s.xi end as xi,
       s.tbl, s.verified, s.competition, s.data_version, s.era, s.show_r, s.player_id,
       s.fl_id is not null as in_fl,
       case when p.id is null then null else json_build_object('name', p.name, 'anon_name', p.anon_name, 'public_id', p.public_id) end as players,
       v.day as vd_day, v.score as vd_score, v.gate_ok as vd_gate
  from public.seasons s
  left join public.players p on p.id = s.player_id
  left join lateral (select r.day, r.score, r.gate_ok from public.vd_results r where r.season_id = s.id order by r.id limit 1) v on true;
revoke all on public.seasons_pub from public, anon, authenticated;
grant select on public.seasons_pub to anon, authenticated;

-- check: expected one row "t | t"
select exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'seasons_pub' and column_name = 'vd_score') as has_vd,
       not has_table_privilege('anon', 'public.vd_results', 'select') as vd_results_closed;
