-- v0.59: player page, player name stored in one place, Latin-only names (DECISIONS items 2, 12; audit V5)
-- Run on the test DB first (upl-30-0-test), then on the main DB.
-- Output: an old -> new table of names rewritten to Latin (empty on re-run).
-- Idempotent (also where an earlier revision of this file already ran). After 0.60, re-running this file
-- restores the 0.59 functions (set_player_name, player_json, delete_player, player_profile): then run sql/v060_one_player.sql right after. 0.58 clients
-- keep working (player_json only gained fields; the server transliterates a Cyrillic first name from Telegram).
-- No new anon/authenticated write policies: name changes and deletion go only through RPCs that check the device secret (like set_player_name).
--
-- Contents:
--  1. players.name_changed_at (at most one change per 30 days), players.public_id: short public number
--     for the player page link (?u=...); device_id and player uuid are never exposed in links.
--  2. name_key(text): uniqueness key (lowercase, collapsed spaces); name_translit(text): any name -> Latin
--     (official Ukrainian KMU 2010 transliteration, e.g. shcherbak, yevhen; diacritics stripped: andre).
--  3. name_problem / name_clean / name_blocked: rules: 3-20 chars, only a-z, digits, '_' and '.',
--     at least one letter, alphanumeric at both ends, no profanity (data/names/blocklist.txt; copies here, in v059_name_conflicts.sql
--     and in src/account.js are checked by tools/tests/player_page.js). name_free: first free name from a base (andrii, andrii2, andrii3...).
--  4. set_player_name (same signature): rules above, case-insensitive uniqueness (error name_taken),
--     at most one change per 30 days (error name_wait:<date>). The first name (from anonymous) has no wait.
--     set_player_auto_name: first name from Telegram/Google: transliterated, numbered if taken (andrii7), stays anonymous on failure.
--  5. One-off migration: live players whose name breaks the rules (Cyrillic, spaces, uppercase, diacritics) or duplicates another's
--     get a Latin version (numbered if taken) and name_changed_at = null, so they can rename once without waiting.
--     Anonymous names become "silent_owl". Then the unique name index is created.
--  6. anon_name(): new anonymous names like "silent_owl"; player_json also returns public_id and name change date.
--  7. merge_players: mark the merged player first, then move the name (otherwise the unique index would block the merge).
--  8. game_stats / trophy_stats: "players" are counted by player_id, not by device.
--  9. player_profile(uuid), player_profile_pub(public_id): public numbers for the player page (no devices, no season history).
-- 10. delete_player(device, secret): account deletion (DECISIONS item 12): personal data is erased, results stay under an anonymous name.

-- 1. new player columns
alter table public.players add column if not exists name_changed_at timestamptz;
alter table public.players add column if not exists public_id text;

create or replace function public.gen_public_id() returns text language sql volatile as $$
  select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 8);
$$;
update public.players set public_id = public.gen_public_id() where public_id is null;
alter table public.players alter column public_id set default public.gen_public_id();
create unique index if not exists players_public_id_uq on public.players (public_id);

-- 2. name key (the unique index is built on it; do not change the body, or the index becomes stale): lowercase (Cyrillic too),
--    apostrophe variants normalized to ', spaces collapsed. For Latin names this is just lower().
create or replace function public.name_key(p text) returns text language sql immutable parallel safe as $$
  select btrim(regexp_replace(
    translate(lower(p), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЫЭЪЁ’ʼ`‘', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэъё' || repeat(chr(39), 4)),
    '\s+', ' ', 'g'));
$$;

-- transliteration (KMU 2010): word-initial ye/yi/y/yu/ya vs ie/i/i/iu/ia elsewhere; zgh; soft sign and apostrophe are dropped.
-- Russian-only letters map to y, e, (nothing), yo/io. Latin diacritics are stripped (andre). Space and hyphen -> '_',
-- other unusual chars are removed, '__'/'..' collapsed, '_'/'.' trimmed at the ends, cut to 20. The result may still fail the rules (too short); name_free checks that.
create or replace function public.name_translit(p text) returns text language plpgsql immutable parallel safe as $$
declare s text := public.name_key(coalesce(p, '')); r text := ''; c text; pv text := ''; w boolean; i int;
begin
  s := lower(replace(translate(s, 'ÀÁÂÃÄÅĀĂĄàáâãäåāăąÇĆČçćčĎĐďđÈÉÊËĒĖĘĚèéêëēėęěĞğÌÍÎÏĪİìíîïīıŁłÑŃŇñńňÒÓÔÕÖØŌòóôõöøōŘřŚŠŞśšşŤťÙÚÛÜŪŮùúûüūůÝŸýÿŹŻŽźżž',
                                  'AAAAAAAAAaaaaaaaaaCCCcccDDddEEEEEEEEeeeeeeeeGgIIIIIIiiiiiiLlNNNnnnOOOOOOOoooooooRrSSSsssTtUUUUUUuuuuuuYYyyZZZzzz'), 'ß', 'ss'));
  for i in 1 .. char_length(s) loop
    c := substr(s, i, 1);
    w := pv !~ '[a-z0-9а-яіїєґыэъё'']';   -- word start (an apostrophe does not split a word)
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

-- 3. profanity (data/names/blocklist.txt): a stem anywhere in the name without '_' and '.'; '^stem' only at a word start (start, '_', '.', digit)
create or replace function public.name_blocked(p text) returns boolean language sql immutable as $$
  select exists (select 1 from unnest(array[
    '^hui','^huy','khui','khuy','xui','xuy','pizd','pyzd','blyad','bliad','blyat','bliat','ebat','yeban','ieban','yobany',
    'mudak','mudil','zalup','gandon','pidor','pidar','shliukh','shlyukh','suchar',
    'fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','asshole'
  ]) b where case when left(b, 1) = '^' then ('_' || coalesce(p, '')) ~ ('[_.0-9]' || substr(b, 2))
                  else position(b in regexp_replace(coalesce(p, ''), '[_.]', '', 'g')) > 0 end);
$$;

-- what is wrong with a name (already lowercase, no spaces): null = OK; otherwise an error code
create or replace function public.name_problem(s text) returns text language sql immutable parallel safe as $$
  select case
    when s is null then null
    when char_length(s) not between 3 and 20 then 'name_len'
    when s !~ '^[a-z0-9._]+$' or s !~ '[a-z]' then 'name_chars'
    when s !~ '^[a-z0-9].*[a-z0-9]$' then 'name_edge'
    when public.name_blocked(s) then 'name_bad'
  end;
$$;

-- name normalized to the rules (lowercase, spaces -> '_'); empty -> null (back to anonymous). Errors: name_len, name_chars, name_edge, name_bad (code 22023)
create or replace function public.name_clean(p_name text) returns text language plpgsql immutable set search_path = public as $$
declare s text := nullif(regexp_replace(lower(btrim(coalesce(p_name, ''))), '\s+', '_', 'g'), ''); e text;
begin
  if s is null then return null; end if;
  e := public.name_problem(s);
  if e is not null then raise exception '%', e using errcode = '22023'; end if;
  return s;
end $$;

-- first free name from a base: andrii -> andrii2 -> andrii3... (base shortened to fit 20 if needed). Base fails the rules -> null.
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

-- 6. anonymous names like "silent_owl" (Latin, lowercase, '_' instead of space)
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

-- 4. automatic first name (from Telegram/Google or the name field): transliterated, numbered if taken. Only if there is no name yet;
--    does not start the 30-day timer. On failure (too short, profanity) the player stays anonymous.
create or replace function public.name_auto_set(p_player uuid, p_raw text) returns void language plpgsql security definer set search_path = public as $$
declare nm text; an text;
begin
  select public.name_key(anon_name) into an from players where id = p_player and name is null and deleted_at is null and merged_into is null;
  if not found then return; end if;
  nm := public.name_free(public.name_translit(p_raw), p_player);
  if nm is null or nm = an then return; end if;
  begin
    update players set name = nm where id = p_player and name is null;
  exception when unique_violation then null;   -- someone just took the same name: stay anonymous, retry next time
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

-- player name (chosen manually)
create or replace function public.set_player_name(p_device uuid, p_secret text, p_name text) returns json language plpgsql security definer set search_path = public as $$
declare pid uuid; nm text; cur players%rowtype;
begin
  pid := public.device_check(p_device, p_secret);
  select * into cur from players where id = pid for update;
  begin
    nm := public.name_clean(p_name);
  exception when sqlstate '22023' then
    -- 0.58 clients send the raw Telegram first name (Cyrillic): transliterate instead of failing
    if cur.name is null then perform public.name_auto_set(pid, p_name); return public.player_json(pid); end if;
    raise;
  end;
  -- same name with different case: just store lowercase, no 30-day timer
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
    -- first name (from anonymous, incl. automatic from Telegram/Google) does not start the timer; changing or clearing it does
    update players set name = nm, name_changed_at = case when cur.name is not null then now() else name_changed_at end where id = pid;
  exception when unique_violation then raise exception 'name_taken' using errcode = '23505';
  end;
  return public.player_json(pid);
end $$;
grant execute on function public.set_player_name(uuid, text, text) to anon, authenticated;

-- 7. merge: mark as merged first, then the name (the unique index covers only non-merged players)
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


-- 5. one-off name migration (Latin only). Idempotent: on re-run all names already follow the rules.
--    A live player whose name breaks the rules or duplicates an older player's name gets
--    a Latin version (numbered if taken: vitia2); on failure (too short, profanity) becomes anonymous again.
--    name_changed_at = null: the new name can be changed once without the 30-day wait. The change list is the run output (end of file).
create temp table if not exists v059_renames (player_id uuid, was text, became text);
delete from v059_renames;
do $$
declare r record; nm text; kept boolean;
begin
  for r in select id, name, created_at from public.players
            where name is not null and merged_into is null and deleted_at is null order by created_at, id loop
    -- since 0.60: a reserved name (name_reserved) is not rewritten on re-run
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
-- anonymous names: "Silent Owl" -> "silent_owl"
update public.players set anon_name = regexp_replace(lower(btrim(anon_name)), '\s+', '_', 'g')
 where anon_name is distinct from regexp_replace(lower(btrim(anon_name)), '\s+', '_', 'g');

-- case-insensitive name uniqueness (live players only). No duplicates remain after the migration.
create unique index if not exists players_name_uq on public.players (public.name_key(name)) where name is not null and merged_into is null and deleted_at is null;

-- 8. "players" counters by player_id (old rows without player_id fall back to device)
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
-- trophy rarity: how many players (player_id) hold each trophy and how many players played at all
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct coalesce(player_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(player_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon, authenticated;

-- 9. player page: public numbers only. Season history is visible only to the owner (the client loads it by its own player_id).
--    Seasons: not training and not flagged as forged by the server (verified = false); old unverified (null) ones count.
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

-- 10. account deletion (DECISIONS item 12): device owner only (secret). Personal data is erased: name, name copies and Telegram names in results,
--     Telegram id in seasons/daily results/trophies, device and sign-in links, account state (user_state), the sign-in itself (auth.users).
--     Results stay and are shown under the player's anonymous name. The device then becomes a new player.
--     Group league tables keep the Telegram id (part of the row key); the name there is replaced with the anonymous one.
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
  update daily_results set nickname = an, tg_name = null, tg_user_id = null where player_id = pid;   -- nickname is NOT NULL (2-24 chars) in the main DB
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
  exception when others then raise notice 'auth.users: %', sqlerrm;   -- no privileges: the sign-in stays but is no longer linked to anyone
  end;
  return json_build_object('ok', true);
end $$;
revoke execute on function public.delete_player(uuid, text) from public;
grant execute on function public.delete_player(uuid, text) to anon, authenticated;

-- internal, not for the browser
revoke execute on function public.gen_public_id() from public, anon, authenticated;

-- free-play epoch (the client already sends it; the server writes and checks it once the column exists)
alter table public.seasons add column if not exists era text;

-- run output: names that were rewritten (empty on re-run)
select was as "було", became as "стало" from v059_renames order by 2;
