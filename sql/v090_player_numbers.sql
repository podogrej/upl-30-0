-- 0.90: "Your numbers" continued. Additive and idempotent; same signature and grants as 0.85, only new JSON fields.
--  ms:    milestones, oldest first: first season, first title (not anti), first 30-0 (not anti), first relegation (classic format, place 15-16),
--         and the 10/25/50/100/250/500/1000-th season. n = season ordinal, at = when it was played.
--  c100:  players with 100+ played matches in the own XIs (sum of w+d+l over seasons that have the player in the XI), top 50; c100_n = total.
--  pl.om / pl.ot: for players in 'pl': times the wheel offered the player across all picks (om) and times he was taken at that pick (ot).
-- An old client ignores the new fields; a new client treats them as optional.
-- volatile: device_check locks and inserts (see v068_fl_mine_volatile.sql)
create or replace function public.player_numbers(p_device uuid, p_secret text) returns json language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  with s as (
    select id, created_at, place, perfect, formation, format, w, d, l, pts, gf,
           row_number() over (order by created_at, id) rn,
           case when day is not null then 'daily' when mode = 'pick' then 'pick' else format end b,
           case when jsonb_typeof(xi) = 'array' then xi else '[]'::jsonb end xi
      from seasons where player_id = pid and not practice and mode <> 'practice' and verified is not false
  ), x as (
    select s.id sid, s.formation, s.format, s.w, s.w + s.d + s.l mt, (e.i - 1)::int i, e.v->>'id' id, e.v->>'n' n, e.v->>'slot' slot, nullif(e.v->>'c', '') c, case when e.v->>'y' ~ '^\d{4}$' then (e.v->>'y')::int end y,
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
  ), p0 as (
    select id, max(n) n, count(*) k, sum(mt) m, sum(g) g, max(r0) r0, max(sid) last,
           count(*) filter (where format <> 'anti') ka, coalesce(sum(w) filter (where format <> 'anti'), 0) wa,
           mode() within group (order by slot) slot,
           mode() within group (order by c || chr(31) || coalesce(y::text, '')) cy   -- most frequent club and season as a pair
      from x group by id
  ), p as (
    select id, n, k, m, g, r0, last, ka, wa, slot, split_part(cy, chr(31), 1) c, nullif(split_part(cy, chr(31), 2), '')::int y from p0
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
  ), oc as (
    select id, count(*) om, count(*) filter (where taken) ot
      from (select distinct o.season_id, pk.i, e.v id, (s.xi -> (pk.i - 1)::int ->> 'id') = e.v taken
              from season_offers o join s on s.id = o.season_id,
                   jsonb_array_elements(o.off) with ordinality pk(v, i),
                   jsonb_array_elements_text(case when jsonb_typeof(pk.v) = 'array' then pk.v else '[]'::jsonb end) e(v)
             where jsonb_typeof(o.off) = 'array' and pk.i <= 11) q
     group by id
  ), mk as (
    (select 0 o, 'first' k, null::int sn, rn, created_at from s where rn = 1)
    union all (select 1, 'champ', null, rn, created_at from s where format <> 'anti' and place = 1 order by rn limit 1)
    union all (select 2, 'perfect', null, rn, created_at from s where format <> 'anti' and (perfect or w = 30) order by rn limit 1)
    union all (select 3, 'rel', null, rn, created_at from s where format = 'classic' and place >= 15 order by rn limit 1)
    union all (select 4, 's', rn::int, rn, created_at from s where rn in (10, 25, 50, 100, 250, 500, 1000))
  )
  select json_build_object(
    'n', t.n, 'na', t.na, 'w', t.w, 'd', t.d, 'l', t.l, 'pts', t.pts, 'gf', t.gf, 'best', t.best,
    'fm', (select json_build_object('f', f, 'k', k) from fm),
    'xi', coalesce((select json_agg(json_build_object('i', i, 'id', id, 'k', k) order by i, rn) from xc where rn <= 3), '[]'::json),
    'pl', coalesce((select json_object_agg(pr.id, json_build_object('n', n, 'k', k, 'g', g, 'r0', r0, 'slot', slot, 'c', c, 'y', y, 'ka', ka, 'wa', wa, 'om', oc.om, 'ot', oc.ot))
                      from pr left join oc on oc.id = pr.id
                     where rg = 1 or rk = 1 or rd = 1 or pr.id in (select id from xc where rn <= 3)), '{}'::json),
    'ms', coalesce((select json_agg(json_build_object('k', k, 's', sn, 'n', rn, 'at', created_at) order by created_at, rn, o) from mk), '[]'::json),
    'c100', coalesce((select json_agg(json_build_object('id', id, 'n', n, 'c', c, 'slot', slot, 'y', y, 'm', m) order by m desc, id)
                        from (select * from p where m >= 100 order by m desc, id limit 50) q), '[]'::json),
    'c100_n', (select count(*) from p where m >= 100),
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
