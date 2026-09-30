-- 30-0 УПЛ · v0.59 · сторінка гравця, ім'я гравця в одному місці, імена лише латиницею (DECISIONS п. 2, п. 12; аудит В5)
-- Запускати: спершу тестова база (upl-30-0-test), потім основна. Supabase → SQL Editor → вставити цілком → Run.
-- Результат запуску — таблиця «було → стало»: чиї імена переписано на латиницю (повторний запуск — порожня таблиця).
-- Повторний запуск нічого не ламає (і в базі, де попередня версія цього файлу вже виконувалась). Після 0.60: повторний запуск цього файлу
-- повертає функції 0.59 (set_player_name, player_json, delete_player, player_profile) — тоді одразу запустити й sql/v060_one_player.sql. Сайт 0.58, ще відкритий у гравців,
-- працює як раніше (player_json лише отримав нові поля; перше ім'я кирилицею з Telegram сервер сам переписує латиницею).
-- Нових політик запису для anon/authenticated немає: ім'я й видалення — лише через RPC з перевіркою секрету пристрою (як set_player_name).
--
-- Що тут:
--  1. players.name_changed_at (правило «не частіше ніж раз на 30 днів»), players.public_id — короткий публічний номер
--     для посилання на сторінку гравця (?u=…); device_id і номер гравця в посиланні не світимо.
--  2. name_key(text) — ключ унікальності (нижній регістр, пробіли стиснуто); name_translit(text) — будь-яке ім'я → латиниця
--     (офіційна українська транслітерація КМУ 2010: андрій → andrii, вітя → vitia, щербак → shcherbak, євген → yevhen; andré → andre).
--  3. name_problem / name_clean / name_blocked — правила (рішення власника 30.09.2026): 3–20 символів, лише a-z, цифри, «_» і «.»,
--     хоч одна літера, на початку й у кінці — літера або цифра, без мату (data/names/blocklist.txt; копії тут, у v059_name_conflicts.sql
--     і в src/account.js перевіряє tools/tests/player_page.js). name_free — перше вільне ім'я з основи (andrii, andrii2, andrii3…).
--  4. set_player_name (та сама сигнатура): правила вище, унікальність без урахування регістру (помилка name_taken),
--     зміна не частіше ніж раз на 30 днів (помилка name_wait:<дата>). Перше ім'я (з анонімного) — без очікування.
--     set_player_auto_name — перше ім'я з Telegram/Google: транслітерація, зайняте — з номером (andrii7), не вийшло — лишається анонімним.
--  5. Разова міграція: живі гравці, чиє ім'я не проходить правила (кирилиця, пробіли, великі літери, «andré») або збігається з чужим,
--     отримують латинську версію (з номером, якщо зайнято) і name_changed_at = null — можуть один раз змінити ім'я без очікування.
--     Анонімні імена — «silent_owl». Потім — унікальний індекс імен.
--  6. anon_name() — нові анонімні імена «silent_owl»; player_json — ще public_id і дата зміни імені.
--  7. merge_players: спершу позначаємо злитого гравця, потім переносимо ім'я (інакше унікальний індекс заважав би злиттю).
--  8. game_stats / trophy_stats — «гравців» рахуємо за гравцем (player_id), а не за пристроєм.
--  9. player_profile(uuid), player_profile_pub(public_id) — публічні цифри сторінки гравця (без пристроїв, без історії сезонів).
-- 10. delete_player(device, secret) — «Видалити акаунт» (DECISIONS п. 12): особисті дані стираються, результати лишаються під анонімним іменем.

-- 1. нові колонки гравця
alter table public.players add column if not exists name_changed_at timestamptz;
alter table public.players add column if not exists public_id text;

create or replace function public.gen_public_id() returns text language sql volatile as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 8);
$$;
update public.players set public_id = public.gen_public_id() where public_id is null;
alter table public.players alter column public_id set default public.gen_public_id();
create unique index if not exists players_public_id_uq on public.players (public_id);

-- 2. ключ імені (на ньому — унікальний індекс; тіло не міняємо, щоб індекс лишався правильним): нижній регістр (і для кирилиці),
--    апострофи ’ʼ`‘ → ', пробіли стиснуто. Для латинських імен це просто lower().
create or replace function public.name_key(p text) returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(lower(p), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЫЭЪЁ’ʼ`‘', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэъё' || repeat(chr(39), 4)),
    '\s+', ' ', 'g'));
$$;

-- транслітерація (КМУ 2010): є, ї, й, ю, я на початку слова — ye, yi, y, yu, ya, далі — ie, i, i, iu, ia; зг → zgh; ь і апостроф — пропускаємо.
-- Російські ы, э, ъ, ё — y, e, (нічого), yo/io. Латиниця з діакритикою — без неї (andré → andre). Пробіл і дефіс → «_»,
-- решта незвичного — геть, «__»/«..» стискаємо, на краях «_»/«.» прибираємо, обрізаємо до 20. Результат може не пройти правила (закороткий) — це перевіряє name_free.
create or replace function public.name_translit(p text) returns text language plpgsql immutable parallel safe as $$
declare s text := public.name_key(coalesce(p, '')); r text := ''; c text; pv text := ''; w boolean; i int;
begin
  s := lower(replace(translate(s, 'ÀÁÂÃÄÅĀĂĄàáâãäåāăąÇĆČçćčĎĐďđÈÉÊËĒĖĘĚèéêëēėęěĞğÌÍÎÏĪİìíîïīıŁłÑŃŇñńňÒÓÔÕÖØŌòóôõöøōŘřŚŠŞśšşŤťÙÚÛÜŪŮùúûüūůÝŸýÿŹŻŽźżž',
                                  'AAAAAAAAAaaaaaaaaaCCCcccDDddEEEEEEEEeeeeeeeeGgIIIIIIiiiiiiLlNNNnnnOOOOOOOoooooooRrSSSsssTtUUUUUUuuuuuuYYyyZZZzzz'), 'ß', 'ss'));
  for i in 1 .. char_length(s) loop
    c := substr(s, i, 1);
    w := pv !~ '[a-z0-9а-яіїєґыэъё'']';   -- початок слова (апостроф слова не розриває: п'ять → piat)
    r := r || case c
      when 'а' then 'a' when 'б' then 'b' when 'в' then 'v' when 'г' then case when pv = 'з' then 'gh' else 'h' end when 'ґ' then 'g'
      when 'д' then 'd' when 'е' then 'e' when 'є' then case when w then 'ye' else 'ie' end when 'ж' then 'zh' when 'з' then 'z'
      when 'и' then 'y' when 'і' then 'i' when 'ї' then case when w then 'yi' else 'i' end when 'й' then case when w then 'y' else 'i' end
      when 'к' then 'k' when 'л' then 'l' when 'м' then 'm' when 'н' then 'n' when 'о' then 'o' when 'п' then 'p' when 'р' then 'r'
      when 'с' then 's' when 'т' then 't' when 'у' then 'u' when 'ф' then 'f' when 'х' then 'kh' when 'ц' then 'ts' when 'ч' then 'ch'
      when 'ш' then 'sh' when 'щ' then 'shch' when 'ь' then '' when chr(39) then '' when 'ю' then case when w then 'yu' else 'iu' end
      when 'я' then case when w then 'ya' else 'ia' end when 'ы' then 'y' when 'э' then 'e' when 'ъ' then '' when 'ё' then case when w then 'yo' else 'io' end
      when ' ' then '_' when '-' then '_'
      else c end;
    pv := c;
  end loop;
  r := regexp_replace(regexp_replace(r, '[^a-z0-9_.]', '', 'g'), '([_.])[_.]+', '\1', 'g');
  return regexp_replace(left(regexp_replace(r, '^[_.]+', ''), 20), '[_.]+$', '');
end $$;

-- 3. мат (data/names/blocklist.txt): основа всередині імені без «_» і «.»; «^основа» — лише з початку слова (початок, «_», «.», цифра)
create or replace function public.name_blocked(p text) returns boolean language sql immutable as $$
  select exists (select 1 from unnest(array[
    '^hui','^huy','khui','khuy','xui','xuy','pizd','pyzd','blyad','bliad','blyat','bliat','ebat','yeban','ieban','yobany',
    'mudak','mudil','zalup','gandon','pidor','pidar','shliukh','shlyukh','suchar',
    'fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','asshole'
  ]) b where case when left(b, 1) = '^' then ('_' || coalesce(p, '')) ~ ('[_.0-9]' || substr(b, 2))
                  else position(b in regexp_replace(coalesce(p, ''), '[_.]', '', 'g')) > 0 end);
$$;

-- що не так з іменем (вже в нижньому регістрі, без пробілів): null — усе добре; інакше код помилки
create or replace function public.name_problem(s text) returns text language sql immutable parallel safe as $$
  select case
    when s is null then null
    when char_length(s) not between 3 and 20 then 'name_len'
    when s !~ '^[a-z0-9._]+$' or s !~ '[a-z]' then 'name_chars'
    when s !~ '^[a-z0-9].*[a-z0-9]$' then 'name_edge'
    when public.name_blocked(s) then 'name_bad'
  end;
$$;

-- ім'я за правилами (нижній регістр, пробіли → «_»); порожнє → null (знову анонімний). Помилки: name_len, name_chars, name_edge, name_bad (код 22023)
create or replace function public.name_clean(p_name text) returns text language plpgsql immutable set search_path = public as $$
declare s text := nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', '_', 'g'), ''); e text;
begin
  if s is null then return null; end if;
  e := public.name_problem(s);
  if e is not null then raise exception '%', e using errcode = '22023'; end if;
  return s;
end $$;

-- перше вільне ім'я з основи: andrii → andrii2 → andrii3… (основу за потреби вкорочуємо, щоб влізти в 20). Основа не проходить правила — null.
create or replace function public.name_free(p_base text, p_self uuid) returns text language plpgsql stable set search_path = public as $$
declare k int := 1; v text := p_base;
begin
  if public.name_problem(p_base) is not null then return null; end if;
  loop
    if public.name_problem(v) is null and not exists (select 1 from players where id is distinct from p_self and name is not null
                                                          and merged_into is null and deleted_at is null and public.name_key(name) = v) then
      return v;
    end if;
    k := k + 1;
    if k > 9999 then return null; end if;
    v := regexp_replace(left(p_base, 20 - char_length(k::text)), '[_.]+$', '') || k;
  end loop;
end $$;

revoke execute on function public.name_free(text, uuid) from public, anon, authenticated;

-- 6. анонімні імена — «silent_owl» (латиниця, нижній регістр, «_» замість пробілу)
create or replace function public.anon_name() returns text language sql volatile as $$
  select lower((array['Silent','Swift','Clever','Brave','Lucky','Sneaky','Calm','Bold','Quiet','Wild','Sharp','Happy',
                'Mighty','Rapid','Hidden','Golden','Cosmic','Stormy','Sunny','Frosty','Nimble','Fearless','Curious','Steady'])[1 + floor(random() * 24)::int]
      || '_' ||
         (array['Owl','Fox','Wolf','Bear','Lynx','Hawk','Otter','Badger','Eagle','Stork','Heron','Beaver',
                'Falcon','Raven','Bison','Hare','Moose','Panther','Tiger','Dolphin','Hedgehog','Squirrel','Marten','Crane'])[1 + floor(random() * 24)::int]);
$$;

create or replace function public.player_json(p_id uuid) returns json language sql volatile security definer set search_path = public as $$
  select json_build_object('id', id, 'name', public.name_key(name), 'anon_name', public.name_key(anon_name), 'public_id', public_id,
                           'name_changed_at', name_changed_at,
                           'name_next', case when name_changed_at > now() - interval '30 days' then name_changed_at + interval '30 days' end)
    from players where id = p_id;
$$;
revoke execute on function public.player_json(uuid) from public, anon, authenticated;

-- 4. перше ім'я автоматично (з Telegram/Google, з поля «Твоє ім'я»): транслітерація, зайняте — з номером. Лише якщо імені ще немає;
--    відлік 30 днів не запускає. Нічого не вийшло (закоротке, мат) — гравець лишається анонімним.
create or replace function public.name_auto_set(p_player uuid, p_raw text) returns void language plpgsql security definer set search_path = public as $$
declare nm text; an text;
begin
  select public.name_key(anon_name) into an from players where id = p_player and name is null and deleted_at is null and merged_into is null;
  if not found then return; end if;
  nm := public.name_free(public.name_translit(p_raw), p_player);
  if nm is null or nm = an then return; end if;
  begin
    update players set name = nm where id = p_player and name is null;
  exception when unique_violation then null;   -- хтось щойно взяв те саме ім'я — лишаємось анонімним, наступного разу спробуємо ще
  end;
end $$;
revoke execute on function public.name_auto_set(uuid, text) from public, anon, authenticated;

create or replace function public.set_player_auto_name(p_device uuid, p_secret text, p_raw text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  pid := public.device_check(p_device, p_secret);
  perform public.name_auto_set(pid, p_raw);
  return public.player_json(pid);
end $$;
revoke execute on function public.set_player_auto_name(uuid, text, text) from public;
grant execute on function public.set_player_auto_name(uuid, text, text) to anon, authenticated;

-- ім'я гравця (вибране вручну)
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text; cur players%rowtype;
begin
  pid := public.device_check(p_device, p_secret);
  select * into cur from players where id = pid for update;
  begin
    nm := public.name_clean(p_name);
  exception when sqlstate '22023' then
    -- сайт 0.58 (ще відкритий у гравців) підставляє перше ім'я з Telegram як є («Андрій») — переписуємо латиницею, а не падаємо
    if cur.name is null then perform public.name_auto_set(pid, p_name); return public.player_json(pid); end if;
    raise;
  end;
  -- те саме ім'я (інший регістр) — лише зберігаємо в нижньому регістрі, без відліку 30 днів
  if nm is not distinct from public.name_key(cur.name) then
    if nm is not null and cur.name is distinct from nm then update players set name = nm where id = pid; end if;
    return public.player_json(pid);
  end if;
  if cur.name_changed_at > now() - interval '30 days' then
    raise exception 'name_wait:%', to_char((cur.name_changed_at + interval '30 days') at time zone 'Europe/Kyiv', 'YYYY-MM-DD') using errcode = '22023';
  end if;
  if nm is not null and exists (select 1 from players where id <> pid and name is not null and merged_into is null and deleted_at is null
                                                          and public.name_key(name) = nm) then
    raise exception 'name_taken' using errcode = '23505';
  end if;
  begin
    -- перше ім'я (з анонімного, зокрема автоматичне з Telegram/Google) не запускає відлік; зміна чи скидання імені — запускає
    update players set name = nm, name_changed_at = case when cur.name is not null then now() else name_changed_at end where id = pid;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505';
  end;
  return public.player_json(pid);
end $$;
grant execute on function public.set_player_name(uuid, text, text) to anon, authenticated;

-- 7. злиття: спершу позначка «злито», потім ім'я (унікальний індекс рахує лише не злитих)
create or replace function public.merge_players(p_src uuid, p_dst uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_src is null or p_dst is null or p_src = p_dst then return; end if;
  update player_links      set player_id = p_dst where player_id = p_src;
  update seasons           set player_id = p_dst where player_id = p_src;
  update daily_results     set player_id = p_dst where player_id = p_src;
  update trophies          set player_id = p_dst where player_id = p_src;
  update challenges        set player_id = p_dst where player_id = p_src;
  update challenge_results set player_id = p_dst where player_id = p_src;
  update f5_players        set player_id = p_dst where player_id = p_src;
  update league_results    set player_id = p_dst where player_id = p_src;
  update league_members    set player_id = p_dst where player_id = p_src;
  update players set merged_into = p_dst where id = p_src;
  update players d set name = coalesce(d.name, s.name) from players s where d.id = p_dst and s.id = p_src;
end $$;
revoke execute on function public.merge_players(uuid, uuid) from public, anon, authenticated;


-- 5. разова міграція імен (рішення власника 30.09.2026: лише латиниця). Повторний запуск нічого не змінює — усі імена вже за правилами.
--    Живий гравець з іменем не за правилами («Вітя», «андрій ш», «andré») або з тим самим іменем, що в старшого гравця, отримує
--    латинську версію (vitia, andrii_sh, andre; зайняте — з номером: vitia2); не вийшло (закоротке, мат) — знову анонімний.
--    name_changed_at = null — нове ім'я можна один раз змінити без очікування 30 днів. Список змін — результат запуску (у кінці файлу).
create temp table if not exists v059_renames (player_id uuid, was text, became text);
delete from v059_renames;
do $$
declare r record; nm text; kept boolean;
begin
  for r in select id, name, created_at from public.players
            where name is not null and merged_into is null and deleted_at is null order by created_at, id loop
    -- з 0.60: зарезервоване ім'я гравця (name_reserved, «andré» власника) повторний запуск не переписує
    if to_regclass('public.name_reserved') is not null then
      execute 'select exists (select 1 from public.name_reserved where name = $1 and player_id = $2)' into kept using r.name, r.id;
      if kept then continue; end if;
    end if;
    if public.name_problem(r.name) is null and not exists (
         select 1 from public.players o where o.id <> r.id and o.name is not null and o.merged_into is null and o.deleted_at is null
            and public.name_key(o.name) = public.name_key(r.name) and (o.created_at, o.id) < (r.created_at, r.id)) then
      continue;
    end if;
    nm := public.name_free(public.name_translit(r.name), r.id);
    update public.players set name = nm, name_changed_at = null where id = r.id;
    insert into v059_renames values (r.id, r.name, nm);
  end loop;
end $$;
-- анонімні імена: «Silent Owl» → «silent_owl»
update public.players set anon_name = regexp_replace(lower(btrim(anon_name)), '\s+', '_', 'g')
 where anon_name is distinct from regexp_replace(lower(btrim(anon_name)), '\s+', '_', 'g');

-- унікальність імені без урахування регістру (лише серед живих гравців). Після міграції збігів немає.
create unique index if not exists players_name_uq on public.players (public.name_key(name)) where name is not null and merged_into is null and deleted_at is null;

-- 8. лічильники «гравців» — за гравцем (старі рядки без player_id — за пристроєм)
create or replace function public.game_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'seasons',   (select count(*) from seasons),
    'players',   (select count(distinct coalesce(player_id::text, device_id::text)) from seasons),
    'champions', (select count(*) from seasons where place = 1 and not practice and format <> 'anti'),
    'unbeaten',  (select count(*) from seasons where place = 1 and l = 0 and not practice and format <> 'anti'),
    'perfect',   (select count(*) from seasons where perfect and not practice and format <> 'anti'),
    'anti',      (select count(*) from seasons where format = 'anti' and l = 30 and not practice)
  );
$$;
grant execute on function public.game_stats() to anon, authenticated;
-- рідкість трофеїв: скільки гравців (player_id) має кожен трофей і скільки гравців узагалі грало
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct coalesce(player_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(player_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon, authenticated;

-- 9. сторінка гравця: лише публічні цифри. Історію сезонів бачить лише власник (сайт бере її сам, за своїм player_id).
--    Сезони — не тренувальні й не визнані сервером підробкою (verified = false); старі неперевірені (null) рахуються.
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
    select id, created_at, day, mode, format, club, formation, w, d, l, pts, place, gf, ga, xi,
           case when day is not null then 'daily' else format end as b
      from seasons where player_id = pid and not practice and mode <> 'practice' and verified is not false
  ), n as (
    select count(*) seasons, count(*) filter (where place = 1 and format <> 'anti') champions,
           count(*) filter (where w = 30 and format <> 'anti') perfect,
           sum(w) filter (where format <> 'anti') wins, count(*) filter (where format <> 'anti') games,
           max(pts) filter (where format = 'classic') best_classic, min(created_at) first_at
      from s
  ), rk as (
    select s.id, s.b, s.pts, s.w, s.d, s.l, s.place, s.formation, s.mode, s.club, s.day, s.created_at,
           (select round(avg(case when coalesce(x->>'r0', x->>'r') ~ '^\d{1,3}(\.\d+)?$' then coalesce(x->>'r0', x->>'r')::numeric end), 1)
              from jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x) avg_r,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end desc,
                                                        case when s.b = 'anti' then -s.place else s.place end, s.gf - s.ga desc, s.created_at) best_n,
           row_number() over (partition by s.b order by case when s.b = 'anti' then -s.pts else s.pts end,
                                                        case when s.b = 'anti' then -s.place else s.place end desc, s.gf - s.ga, s.created_at) worst_n,
           count(*) over (partition by s.b) bn
      from s
  ), xi as (
    select x from s, jsonb_array_elements(case when jsonb_typeof(s.xi) = 'array' then s.xi else '[]'::jsonb end) x
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
create or replace function public.player_profile_pub(p_public text) returns json language sql stable security definer set search_path = public as $$
  select public.player_profile(id) from players where public_id = lower(btrim(p_public)) limit 1;
$$;
revoke execute on function public.player_profile(uuid) from public;
revoke execute on function public.player_profile_pub(text) from public;
grant execute on function public.player_profile(uuid) to anon, authenticated;
grant execute on function public.player_profile_pub(text) to anon, authenticated;

-- 10. «Видалити акаунт» (DECISIONS п. 12): лише власник пристрою (секрет). Особисті дані — ім'я, копії імен і імена Telegram у результатах,
--     номер Telegram у сезонах/результатах дня/трофеях, прив'язки пристроїв і входів, стан акаунта (user_state), сам вхід (auth.users) — стираємо.
--     Результати лишаються й показуються під анонімним іменем гравця. Пристрій після цього — новий гравець.
--     У табло ліг груп номер Telegram лишається (він — частина ключа рядка), ім'я там замінюється анонімним.
create or replace function public.delete_player(p_device uuid, p_secret text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; an text; uids uuid[]; tgs bigint[];
begin
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is not null and acc <> pid then raise exception 'not your player' using errcode = '28000'; end if;
  select coalesce(array_agg(key::uuid) filter (where kind = 'auth'), '{}'), coalesce(array_agg(key::bigint) filter (where kind = 'tg' and key ~ '^\d{1,18}$'), '{}')
    into uids, tgs from player_links where player_id = pid;
  select public.name_key(anon_name) into an from players where id = pid;
  update players set name = null, name_changed_at = null, deleted_at = now() where id = pid;
  update players set name = null where merged_into = pid;
  update seasons set nickname = null, tg_name = null, tg_user_id = null where player_id = pid;
  update daily_results set nickname = an, tg_name = null, tg_user_id = null where player_id = pid;   -- nickname у основній базі NOT NULL, 2–24
  update trophies set tg_name = null, tg_user_id = null where player_id = pid;
  update challenges set name = an where player_id = pid;
  update challenge_results set name = an where player_id = pid;
  update f5_players set name = an where player_id = pid;
  update league_results set name = an where player_id = pid or tg_user_id = any(tgs);
  delete from league_members where player_id = pid or tg_user_id = any(tgs);
  delete from player_links where player_id = pid;
  delete from user_state where user_id = any(uids);
  begin
    delete from auth.users where id = any(uids);
  exception when others then raise notice 'auth.users: %', sqlerrm;   -- немає прав — вхід лишиться, але він уже ні до кого не прив'язаний
  end;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.delete_player(uuid, text) from public;
grant execute on function public.delete_player(uuid, text) to anon, authenticated;

-- службові — не для браузера
revoke execute on function public.gen_public_id() from public, anon, authenticated;

-- 0.58: епоха вільної гри (сайт уже надсилає її; сервер пише й перевіряє, щойно колонка з'явиться)
alter table public.seasons add column if not exists era text;

-- результат запуску: чиї імена переписано (повторний запуск — порожньо)
select was as "було", became as "стало" from v059_renames order by 2;
