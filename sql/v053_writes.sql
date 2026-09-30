-- 30-0 УПЛ · v0.53 · КРОК 1 з 2: результати пише сервер, власність пристрою — секретом (аудит 30.09: К5, К6, В2, В6)
-- Запускати: спершу тестова база (upl-30-0-test), потім основна. Supabase → SQL Editor → вставити цілком → Run.
-- Повторний запуск нічого не ламає. Сайт 0.52, ще відкритий у гравців, працює як раніше:
-- старі політики прямого запису (seasons/trophies/daily_results/challenges) у цьому кроці НЕ чіпаємо — їх закриває крок 2 (v054_close_writes.sql).
--
-- Що тут:
--  1. app_marks — позначки часу запуску (межа «старих» пристроїв для К6; перемикач кроку 2).
--  2. player_links.secret_set_at, player_links.claimed_from — коли пристрій отримав секрет і від якого гравця його відʼєднано (К6).
--  3. device_check (та сама сигнатура): старий пристрій без секрету, що вже має історію, не забирає її собі (К6, див. нижче).
--  4. device_ok(p_device, p_secret) → player_id: перевірка секрету для сервера (/api/save, /api/seed); виконувати може лише service_role.
--  5. legacy_writes_open(): чи ще дозволено /api/seed без секрету (сайт 0.52). Після кроку 2 — false.
--  6. link_account: вхід другим акаунтом на спільному пристрої не зливає двох людей (В6).
--  7. Унікальний індекс «одна офіційна спроба дня на пристрій» (В2) — лише якщо дублів немає, інакше NOTICE.
--  8. Індекси player_id для trophies / challenges / challenge_results.
--
-- Примітка про daily_results: в ОСНОВНІЙ базі таблиця суворіша, ніж у new_db_part_A.sql
-- (w,d,l,pts,place,gf,ga — smallint NOT NULL, formation і xi NOT NULL, перевірки w+d+l=30, pts=3w+d, nickname 2–24 символи;
-- політики anon названо "insert today" / "read all", а не "daily insert" / "daily read").
-- Файли з визначенням таблиць не змінюємо (правило: лише додаємо). Сервер (api/verify.js, syncDaily) заповнює всі ці поля з перевіреного сезону.

-- 1. позначки часу. Перший запуск ставить 'v053' і більше його не змінює
create table if not exists public.app_marks (
  key text primary key,
  at timestamptz not null default now()
);
alter table public.app_marks enable row level security;   -- політик немає: anon/authenticated не читають і не пишуть
insert into public.app_marks (key) values ('v053') on conflict (key) do nothing;

-- 2. нові колонки звʼязків
alter table public.player_links add column if not exists secret_set_at timestamptz;
alter table public.player_links add column if not exists claimed_from uuid references public.players(id);

-- 3. чи є в гравця історія (результати, імʼя, інші входи) — крім самого цього пристрою
create or replace function public.player_has_history(p_player uuid, p_device uuid) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from players where id = p_player and name is not null)
      or exists (select 1 from player_links where player_id = p_player and not (kind = 'device' and key = p_device::text))
      or exists (select 1 from seasons where player_id = p_player)
      or exists (select 1 from daily_results where player_id = p_player)
      or exists (select 1 from trophies where player_id = p_player)
      or exists (select 1 from challenges where player_id = p_player)
      or exists (select 1 from challenge_results where player_id = p_player)
      or exists (select 1 from f5_players where player_id = p_player)
      or exists (select 1 from league_results where player_id = p_player)
      or exists (select 1 from league_members where player_id = p_player);
$$;
revoke execute on function public.player_has_history(uuid, uuid) from public, anon, authenticated;

-- К6. Пристрій без секрету:
--  • звʼязок створено після першого запуску цього файлу (новий пристрій) або в гравця нема історії → секрет просто реєструється;
--  • звʼязок старий (до 0.53) і в гравця Є історія → device_id публічний (є в seasons), тож «перший, хто прийшов із секретом», може бути
--    не власником. Такий пристрій отримує НОВОГО гравця; стара історія лишається на старому гравці (claimed_from — для ручного
--    відновлення: select merge_players(claimed_from, player_id) — лише за зверненням людини, яку владелець упізнав).
--    Справжній власник, що не відкривав гру з 0.38, продовжує грати, але стара історія не підтягується автоматично; зловмисник
--    отримує порожній профіль і не може ні перейменувати, ні злити чужу історію.
create or replace function public.device_check(p_device uuid, p_secret text) returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid; h text; want text; lk_at timestamptz; cut timestamptz; fresh uuid;
begin
  if p_device is null or length(coalesce(p_secret, '')) < 16 then raise exception 'device?' using errcode = '22023'; end if;
  pid := public.player_for_device(p_device);
  want := encode(sha256(convert_to(p_secret, 'UTF8')), 'hex');
  select secret_hash, created_at, player_id into h, lk_at, pid from player_links where kind = 'device' and key = p_device::text for update;
  if h is not null then
    if h <> want then raise exception 'device secret' using errcode = '28000'; end if;
    return pid;
  end if;
  select at into cut from app_marks where key = 'v053';
  if cut is not null and lk_at < cut and public.player_has_history(pid, p_device) then
    insert into players (anon_name) values (public.anon_name()) returning id into fresh;
    update player_links set player_id = fresh, secret_hash = want, secret_set_at = now(), claimed_from = pid
     where kind = 'device' and key = p_device::text;
    return fresh;
  end if;
  update player_links set secret_hash = want, secret_set_at = now() where kind = 'device' and key = p_device::text;
  return pid;
end $$;
revoke execute on function public.device_check(uuid, text) from public, anon, authenticated;

-- 4. перевірка власності пристрою для сервера (ключ сервера — лише у Vercel)
create or replace function public.device_ok(p_device uuid, p_secret text) returns uuid language plpgsql security definer set search_path = public as $$
begin
  return public.device_check(p_device, p_secret);
end $$;
revoke execute on function public.device_ok(uuid, text) from public, anon, authenticated;
grant execute on function public.device_ok(uuid, text) to service_role;

-- 5. перехідний період: /api/seed без секрету (сайт 0.52) дозволено, доки не виконано крок 2
create or replace function public.legacy_writes_open() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from app_marks where key = 'v054');
$$;
revoke execute on function public.legacy_writes_open() from public, anon, authenticated;
grant execute on function public.legacy_writes_open() to service_role;

-- 6. В6. Вхід акаунтом на пристрої, чий гравець уже належить ІНШОМУ акаунту (Google/Telegram), — історії не зливаємо:
--    пристрій переходить до гравця цього акаунта (перший вхід акаунта — новий гравець). Нічого не видаляється.
--    Пристрій без чужого акаунта (грав анонімно) — як раніше: його історія приєднується до акаунта.
create or replace function public.link_account(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); dev uuid; acc uuid; tgid text; other boolean;
begin
  if uid is null then raise exception 'login?' using errcode = '28000'; end if;
  dev := public.device_check(p_device, p_secret);
  select substring(email from '^tg-(\d+)@users\.') into tgid from auth.users where id = uid;
  other := exists (select 1 from player_links
                    where player_id = dev and ((kind = 'auth' and key <> uid::text) or (kind = 'tg' and key is distinct from tgid)));
  acc := public.player_for_auth(uid);
  if acc is null then
    if other then insert into players (anon_name) values (public.anon_name()) returning id into acc;
    else acc := dev; end if;
    insert into player_links (kind, key, player_id) values ('auth', uid::text, acc) on conflict (kind, key) do nothing;
    acc := public.player_for_auth(uid);
  end if;
  if acc <> dev then
    if other then update player_links set player_id = acc where kind = 'device' and key = p_device::text;
    else perform public.merge_players(dev, acc); end if;
  end if;
  if tgid is not null then
    insert into player_links (kind, key, player_id) values ('tg', tgid, acc) on conflict (kind, key) do nothing;
    update league_results set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
    update league_members set player_id = acc where tg_user_id = tgid::bigint and player_id is null;
  end if;
  return public.player_json(acc);
end $$;
revoke execute on function public.link_account(uuid, text) from public, anon;
grant execute on function public.link_account(uuid, text) to authenticated;

-- 7. В2. Одна офіційна спроба дня на пристрій. Якщо дублі вже є — індекс не створюємо (файл не падає), пишемо NOTICE.
--    Подивитися дублі: select device_id, day, count(*) from season_seeds where daily and official group by 1, 2 having count(*) > 1;
do $$
declare n int;
begin
  if exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'season_seeds_official_uq') then return; end if;
  select count(*) into n from (select 1 from public.season_seeds where daily and official group by device_id, day having count(*) > 1) x;
  if n > 0 then
    raise notice 'season_seeds: % пар (пристрій, день) з кількома офіційними спробами — унікальний індекс НЕ створено', n;
  else
    create unique index season_seeds_official_uq on public.season_seeds (device_id, day) where daily and official;
  end if;
end $$;

-- 8. індекси player_id (сторінка гравця, player_has_history)
create index if not exists trophies_player_idx on public.trophies (player_id);
create index if not exists challenges_player_idx on public.challenges (player_id);
create index if not exists challenge_results_player_idx on public.challenge_results (player_id);
