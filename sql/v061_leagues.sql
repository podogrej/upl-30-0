-- 30-0 УПЛ · v0.61 · «Ліги з друзями»: ліги 11×11 на сайті, без Telegram (docs/leagues_online.md, макети docs/mockups/lg_*.png; DECISIONS п. 11).
-- Запускати: спершу тестова база (upl-30-0-test), потім основна. Supabase → SQL Editor → вставити цілком → Run.
-- Повторний запуск нічого не ламає. Сайт 0.60, ще відкритий у гравців, працює як раніше (нові таблиці й функції йому не потрібні).
-- Нові таблиці — з префіксом fl_ (імена leagues* зайняті лігами Telegram-груп, DECISIONS «Словник»). RLS без політик, прав anon/authenticated немає:
-- створити лігу й вступити — RPC з перевіркою входу (лише з акаунтом) і секрету пристрою; спробу в залік пише лише сервер після перевірки сезону.
--
-- Що тут:
--  1. fl_leagues — ліга: правила (тривалість 1/3/7 днів, спроби 1/3 на день, у залік найкраща/остання, очки «за місце»/«сума», перекрути 3/1/0,
--     рейтинги видно / на пам'ять, епоха); fl_members — учасники; fl_entries — зараховані спроби (сезон, очки, день туру).
--  2. seasons.fl_id — сезон зіграно як спробу ліги (пише сервер, /api/save).
--  3. fl_create, fl_join — лише з входом (Google/Telegram) на своєму пристрої. fl_get — ліга за кодом (правила, учасники, таблиці) — для всіх.
--     fl_mine — мої ліги (для «Грати з друзями» і сторінки гравця). fl_record(season) — зарахувати сезон (лише сервер).
--  4. merge_answer (0.60) — ще й повертає локальний прогрес старого входу (user_state) для злиття на сайті.

-- 1. таблиці
create table if not exists public.fl_leagues (
  id text primary key,                                   -- код у посиланні ?l=…, 6 символів
  created_at timestamptz not null default now(),
  owner uuid not null,                                   -- players.id творця
  name text not null,
  fmt text not null default '11',                        -- '11' — 11×11 (5×5 — пізніше)
  start_day date not null,                               -- перший тур (день за Києвом)
  days int not null,                                     -- 1 / 3 / 7
  tries int not null,                                    -- спроб на день: 1 / 3
  take text not null,                                    -- у залік туру: best / last
  scoring text not null,                                 -- place — за місце в турі; sum — очки сезону
  rerolls int not null,                                  -- перекрути колеса: 3 / 1 / 0
  ratings text not null,                                 -- show — видно; memory — на пам'ять
  era text not null default 'all'                        -- all / y2000 / y2010 / y2015 (як ERAS у грі)
);
create table if not exists public.fl_members (
  league_id text not null,
  player_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (league_id, player_id)
);
create table if not exists public.fl_entries (
  league_id text not null,
  player_id uuid not null,
  day date not null,                                     -- день туру (Київ)
  try_n int not null,                                    -- 1…tries
  season_id bigint not null unique,
  pts int not null, w int not null, d int not null, l int not null, gf int not null, ga int not null, place int not null,
  created_at timestamptz not null default now(),
  primary key (league_id, player_id, day, try_n)
);
create index if not exists fl_members_player_idx on public.fl_members (player_id);
alter table public.fl_leagues enable row level security;
alter table public.fl_members enable row level security;
alter table public.fl_entries enable row level security;
revoke all on table public.fl_leagues, public.fl_members, public.fl_entries from anon, authenticated;

-- 2. сезон — спроба ліги
alter table public.seasons add column if not exists fl_id text;

-- день за Києвом
create or replace function public.fl_today() returns date language sql stable as $$ select (now() at time zone 'Europe/Kyiv')::date $$;

-- 3. створити лігу: лише з входом, пристрій — свого гравця. Творець одразу учасник. Помилки: login? (28000), fl_bad (22023)
create or replace function public.fl_create(p_device uuid, p_secret text, p_name text, p_days int, p_tries int, p_take text, p_scoring text,
                                            p_rerolls int, p_ratings text, p_era text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); code text; k int := 0;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  if char_length(nm) not between 2 and 40 or p_days not in (1, 3, 7) or p_tries not in (1, 3) or p_take not in ('best', 'last')
     or p_scoring not in ('place', 'sum') or p_rerolls not in (0, 1, 3) or p_ratings not in ('show', 'memory')
     or p_era not in ('all', 'y2000', 'y2010', 'y2015') then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  if (select count(*) from fl_leagues where owner = pid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'fl_many' using errcode = '22023';   -- не більше 20 ліг на день від гравця
  end if;
  loop
    code := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from fl_leagues where id = code);
    k := k + 1; if k > 20 then raise exception 'fl_code'; end if;
  end loop;
  insert into fl_leagues (id, owner, name, start_day, days, tries, take, scoring, rerolls, ratings, era)
    values (code, pid, nm, public.fl_today(), p_days, p_tries, p_take, p_scoring, p_rerolls, p_ratings, p_era);
  insert into fl_members (league_id, player_id) values (code, pid);
  return public.fl_get(code);
end $$;
revoke execute on function public.fl_create(uuid, text, text, int, int, text, text, int, text, text) from public, anon;
grant execute on function public.fl_create(uuid, text, text, int, int, text, text, int, text, text) to authenticated;

-- вступити: лише з входом; ліга ще йде. Повторний вступ нічого не міняє
create or replace function public.fl_join(p_device uuid, p_secret text, p_id text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; L fl_leagues%rowtype;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  select * into L from fl_leagues where id = lower(btrim(p_id));
  if not found then raise exception 'fl_none' using errcode = '22023'; end if;
  if public.fl_today() >= L.start_day + L.days then raise exception 'fl_over' using errcode = '22023'; end if;
  insert into fl_members (league_id, player_id) values (L.id, pid) on conflict do nothing;
  return public.fl_get(L.id);
end $$;
revoke execute on function public.fl_join(uuid, text, text) from public, anon;
grant execute on function public.fl_join(uuid, text, text) to authenticated;

-- ліга за кодом — для всіх (як сторінка гравця): правила, тур, учасники, загальна таблиця й таблиця сьогоднішнього туру.
-- Залік туру: у кожного гравця одна спроба дня — найкраща (очки → різниця → забиті → раніше) або остання. «Сума» — очки сезону;
-- «за місце» — з K гравців, що зіграли того дня, 1-й отримує K, останній 1. Загальна: сума за тури → більше перемог у турах → кращий сезон.
create or replace function public.fl_get(p_id text) returns json language sql stable security definer set search_path = public as $$
  with L as (select * from fl_leagues where id = lower(btrim(p_id))),
  pick as (   -- спроба, що йде в залік дня
    select e.*, row_number() over (partition by e.player_id, e.day order by
             case when (select take from L) = 'last' then -e.try_n else 0 end,
             e.pts desc, e.gf - e.ga desc, e.gf desc, e.created_at) rn
      from fl_entries e where e.league_id = (select id from L)
  ), day_rank as (
    select p.*, rank() over (partition by p.day order by p.pts desc, p.gf - p.ga desc, p.gf desc) rk,
           count(*) over (partition by p.day) k
      from pick p where rn = 1
  ), day_pts as (
    select d.*, case when (select scoring from L) = 'sum' then d.pts else d.k - d.rk + 1 end as score from day_rank d
  ), tot as (
    select m.player_id, coalesce(sum(dp.score), 0) total, count(*) filter (where dp.rk = 1) wins, max(dp.pts) best, count(dp.day) played
      from fl_members m left join day_pts dp on dp.player_id = m.player_id
     where m.league_id = (select id from L) group by m.player_id
  ), today_tries as (
    select player_id, count(*) n from fl_entries where league_id = (select id from L) and day = public.fl_today() group by player_id
  )
  select json_build_object(
    'id', L.id, 'name', L.name, 'fmt', L.fmt, 'start_day', L.start_day, 'days', L.days, 'tries', L.tries, 'take', L.take, 'scoring', L.scoring,
    'rerolls', L.rerolls, 'ratings', L.ratings, 'era', L.era, 'today', public.fl_today(),
    'day_n', public.fl_today() - L.start_day + 1, 'over', public.fl_today() >= L.start_day + L.days,
    'owner', (select public_id from players where id = L.owner),
    'board', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                        'total', t.total, 'wins', t.wins, 'best', t.best, 'played', t.played)
                               order by t.total desc, t.wins desc, t.best desc nulls last, pl.public_id)
                        from tot t join players pl on pl.id = t.player_id), '[]'::json),
    'tour', coalesce((select json_agg(json_build_object('u', pl.public_id, 'name', public.name_key(coalesce(pl.name, pl.anon_name)),
                                       'pts', dp.pts, 'w', dp.w, 'd', dp.d, 'l', dp.l, 'gf', dp.gf, 'ga', dp.ga, 'score', dp.score, 'rk', dp.rk,
                                       'tries', (select n from today_tries tt where tt.player_id = dp.player_id))
                              order by dp.rk, pl.public_id)
                       from day_pts dp join players pl on pl.id = dp.player_id where dp.day = public.fl_today()), '[]'::json)
  ) from L;
$$;
revoke execute on function public.fl_get(text) from public;
grant execute on function public.fl_get(text) to anon, authenticated;

-- мої ліги (за секретом пристрою): назва, тур, учасники, моє місце в загальній таблиці, мої зараховані спроби сьогодні
create or replace function public.fl_mine(p_device uuid, p_secret text) returns json language plpgsql stable security definer set search_path = public as $$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  select coalesce(json_agg(x order by x.over, x.created_at desc), '[]'::json) into res from (
    select L.id, L.name, L.fmt, L.days, L.tries, L.created_at, public.fl_today() - L.start_day + 1 as day_n,
           public.fl_today() >= L.start_day + L.days as over,
           (select count(*) from fl_members mm where mm.league_id = L.id) as members,
           (select count(*) from fl_entries e where e.league_id = L.id and e.player_id = pid and e.day = public.fl_today()) as tries_today,
           (select b.o from json_array_elements(public.fl_get(L.id)->'board') with ordinality b(v, o)
             where b.v->>'u' = (select public_id from players where id = pid)) as place
      from fl_leagues L join fl_members m on m.league_id = L.id and m.player_id = pid
  ) x;
  return res;
end $$;
revoke execute on function public.fl_mine(uuid, text) from public;
grant execute on function public.fl_mine(uuid, text) to anon, authenticated;

-- зарахувати сезон як спробу ліги (лише сервер, після перевірки сезону): сезон перевірено, гравець — учасник, ліга йде сьогодні,
-- класика «Звичайний», епоха ліги, спроби дня ще є. Повертає номер спроби або null (не зараховано) з причиною в NOTICE
create or replace function public.fl_record(p_season bigint) returns int language plpgsql security definer set search_path = public as $$
declare s seasons%rowtype; L fl_leagues%rowtype; v_day date; n int;
begin
  select * into s from seasons where id = p_season;
  if not found or s.fl_id is null or s.verified is not true or s.practice or s.day is not null then return null; end if;
  if exists (select 1 from fl_entries where season_id = p_season) then return (select try_n from fl_entries where season_id = p_season); end if;
  select * into L from fl_leagues where id = s.fl_id;
  if not found then return null; end if;
  v_day := (s.created_at at time zone 'Europe/Kyiv')::date;
  if v_day < L.start_day or v_day >= L.start_day + L.days then raise notice 'fl_record: поза турами'; return null; end if;
  if s.format <> 'classic' or s.mode <> 'normal' or coalesce(s.era, 'all') <> L.era then raise notice 'fl_record: не ті правила'; return null; end if;
  if not exists (select 1 from fl_members where league_id = L.id and player_id = s.player_id) then raise notice 'fl_record: не учасник'; return null; end if;
  select count(*) into n from fl_entries where league_id = L.id and player_id = s.player_id and day = v_day;
  if n >= L.tries then raise notice 'fl_record: спроби дня вичерпано'; return null; end if;
  insert into fl_entries (league_id, player_id, day, try_n, season_id, pts, w, d, l, gf, ga, place)
    values (L.id, s.player_id, v_day, n + 1, s.id, s.pts, s.w, s.d, s.l, s.gf, s.ga, s.place);
  return n + 1;
end $$;
revoke execute on function public.fl_record(bigint) from public, anon, authenticated;
grant execute on function public.fl_record(bigint) to service_role;

-- 4. «Це ти?» (0.60) + локальний прогрес (баг 0.60): на «так» повертаємо user_state старого входу (prev_state) — сайт зливає його
--    з поточним (трофеї, серія, рекорди) тим самим правилом, що й при вході (acctMerge), і зберігає в акаунт поточного входу
create or replace function public.merge_answer(p_device uuid, p_secret text, p_offer uuid, p_yes boolean) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; o merge_offers%rowtype; fresh boolean; prev jsonb;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(uid);
  select * into o from merge_offers where id = p_offer for update;
  if not found or acc is null or o.dst <> acc or dev <> acc or o.answered_at is not null then
    raise exception 'offer?' using errcode = '22023';
  end if;
  update merge_offers set answered_at = now(), answer = case when p_yes then 'yes' else 'no' end where id = p_offer;
  if p_yes and exists (select 1 from players where id = o.src and merged_into is null and deleted_at is null) then
    select us.data into prev from user_state us
     where us.user_id in (select key::uuid from player_links where player_id = o.src and kind = 'auth' and key ~ '^[0-9a-f-]{36}$')
     order by us.updated_at desc limit 1;
    fresh := not exists (select 1 from seasons where player_id = acc and not practice);
    perform public.merge_players_logged(o.src, acc, 'offer ' || p_offer::text, fresh);
  end if;
  return (public.player_json(acc)::jsonb || jsonb_build_object('prev_state', prev))::json;
end $$;
revoke execute on function public.merge_answer(uuid, text, uuid, boolean) from public, anon;
grant execute on function public.merge_answer(uuid, text, uuid, boolean) to authenticated;

-- результат запуску
select 'ліг' as "що", count(*)::text as "скільки" from public.fl_leagues
union all select 'учасників', count(*)::text from public.fl_members
union all select 'зарахованих спроб', count(*)::text from public.fl_entries;
