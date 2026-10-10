-- 0.85: "Your numbers" on the own player page. Additive only and idempotent; safe for the 0.84 client (nothing it uses changes).
--  1. season_offers: players the wheel offered for each of the 11 picks (written by /api/save only, no anon/authenticated access).
--     Erased with the account: trigger on players.deleted_at (set by delete_player) and FK cascade on seasons.
--  2. player_numbers(device, secret): all blocks of the section in one JSON, own seasons only (device_check).
create table if not exists public.season_offers (
  season_id bigint primary key references public.seasons (id) on delete cascade,
  player_id uuid,
  off jsonb not null,                   -- 11 arrays of offered player ids, aligned with seasons.xi
  created_at timestamptz not null default now()
);
create index if not exists season_offers_player_idx on public.season_offers (player_id);
alter table public.season_offers enable row level security;
revoke all on public.season_offers from anon, authenticated;

create or replace function public.season_offers_forget() returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from season_offers where player_id = new.id or season_id in (select id from seasons where player_id = new.id);
  return new;
end $$;
revoke execute on function public.season_offers_forget() from public, anon, authenticated;
create or replace trigger players_offers_forget after update of deleted_at on public.players
  for each row when (new.deleted_at is not null and old.deleted_at is null) execute function public.season_offers_forget();

-- volatile: device_check locks and inserts (see v068_fl_mine_volatile.sql)
create or replace function public.player_numbers(p_device uuid, p_secret text) returns json language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  with s as (
    select id, formation, format, w, d, l, pts, gf,
           case when day is not null then 'daily' when mode = 'pick' then 'pick' else format end b,
           case when jsonb_typeof(xi) = 'array' then xi else '[]'::jsonb end xi
      from seasons where player_id = pid and not practice and mode <> 'practice' and verified is not false
  ), x as (
    select s.id sid, s.formation, s.format, s.w, (e.i - 1)::int i, e.v->>'id' id, e.v->>'n' n, e.v->>'slot' slot, nullif(e.v->>'c', '') c,
           case when coalesce(e.v->>'r0', e.v->>'r') ~ '^\d{1,3}(\.\d+)?$' then coalesce(e.v->>'r0', e.v->>'r')::numeric end r0,
           case when e.v->>'g' ~ '^\d{1,2}$' then (e.v->>'g')::int else 0 end g
      from s, jsonb_array_elements(s.xi) with ordinality e(v, i)
     where jsonb_typeof(e.v) = 'object' and coalesce(e.v->>'id', '') <> ''
  ), t as (
    select count(*) n, count(*) filter (where format <> 'anti') na,
           coalesce(sum(w) filter (where format <> 'anti'), 0) w, coalesce(sum(d) filter (where format <> 'anti'), 0) d,
           coalesce(sum(l) filter (where format <> 'anti'), 0) l, coalesce(sum(pts) filter (where format <> 'anti'), 0) pts,
           coalesce(sum(gf) filter (where format <> 'anti'), 0) gf, max(pts) filter (where format <> 'anti') best
      from s
  ), fm as (
    select formation f, count(*) k from s group by 1 order by 2 desc, 1 limit 1
  ), p as (
    select id, max(n) n, count(*) k, sum(g) g, max(r0) r0, max(sid) last,
           count(*) filter (where format <> 'anti') ka, coalesce(sum(w) filter (where format <> 'anti'), 0) wa,
           mode() within group (order by slot) slot, mode() within group (order by c) c
      from x group by id
  ), pr as (
    select p.*, row_number() over (order by g desc, k desc, id) rg, row_number() over (order by k desc, g desc, id) rk,
           case when r0 <= 80 and k >= 2 then row_number() over (partition by (r0 <= 80 and k >= 2) order by k desc, g desc, id) end rd
      from p
  ), xc as (
    select i, id, count(*) k, row_number() over (partition by i order by count(*) desc, id) rn
      from x where formation = (select f from fm) group by i, id
  ), cl as (
    select c, count(*) k from x where c is not null group by c
  ), so as (
    select o.off from season_offers o join s on s.id = o.season_id where jsonb_typeof(o.off) = 'array'
  ), ro as (
    select e.v id, count(*) k from so, jsonb_array_elements(so.off) pk, jsonb_array_elements_text(case when jsonb_typeof(pk) = 'array' then pk else '[]'::jsonb end) e(v)
     group by e.v
  )
  select json_build_object(
    'n', t.n, 'na', t.na, 'w', t.w, 'd', t.d, 'l', t.l, 'pts', t.pts, 'gf', t.gf, 'best', t.best,
    'fm', (select json_build_object('f', f, 'k', k) from fm),
    'xi', coalesce((select json_agg(json_build_object('i', i, 'id', id, 'k', k) order by i, rn) from xc where rn <= 3), '[]'::json),
    'pl', coalesce((select json_object_agg(id, json_build_object('n', n, 'k', k, 'g', g, 'r0', r0, 'slot', slot, 'c', c, 'ka', ka, 'wa', wa))
                      from pr where rg = 1 or rk = 1 or rd = 1 or id in (select id from xc where rn <= 3)), '{}'::json),
    'top', json_build_object('g', (select id from pr where rg = 1 and g > 0), 'k', (select id from pr where rk = 1), 'dog', (select id from pr where rd = 1)),
    'uniq', (select count(*) from p), 'once', (select count(*) from p where k = 1),
    'once_n', coalesce((select json_agg(n order by last desc) from (select n, last from p where k = 1 order by last desc limit 300) q), '[]'::json),
    'xin', (select count(*) from x), 'avg', (select round(avg(r0), 1) from x),
    'dog', (select count(*) from x where r0 <= 80), 'rn', (select count(r0) from x),
    'cl_n', (select count(*) from cl),
    'cl', coalesce((select json_agg(json_build_object('c', c, 'k', k) order by k desc, c) from (select * from cl order by k desc, c limit 40) q), '[]'::json),
    'modes', coalesce((select json_agg(json_build_object('b', b, 'k', k, 'pts', pts) order by pts desc) from (select b, count(*) k, sum(pts) pts from s group by b) q), '[]'::json),
    'off_n', (select count(*) from so),
    'rej', case when (select count(*) from so) >= 10 then coalesce((select json_agg(json_build_object('id', id, 'k', k) order by k desc, id)
                  from (select id, k from ro where id not in (select id from p) order by k desc, id limit 5) q), '[]'::json) end
  ) into res from t;
  return res;
end $$;
revoke execute on function public.player_numbers(uuid, text) from public;
grant execute on function public.player_numbers(uuid, text) to anon, authenticated;
