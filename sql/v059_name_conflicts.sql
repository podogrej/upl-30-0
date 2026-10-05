-- v0.59, READ ONLY: whose names sql/v059_player_page.sql will rewrite in Latin (DECISIONS item 2). Changes nothing.
-- Can be run BEFORE v059_player_page.sql. Returns nothing after v059 has run.
-- Output is a single table:
--   problem = duplicate: several live players with the same case-insensitive name; the oldest keeps the name
--                     (if it is valid), the younger ones get a number suffix (vitia2);
--   length: not 3-20 chars; chars: anything other than a-z, digits, '_' and '.' (Cyrillic, space, uppercase, accents);
--   edges: starts or ends with a non-alphanumeric char; profanity. (Labels in the output are Ukrainian.)
-- The new name (KMU 2010 transliteration, plus accent stripping) is shown by v059_player_page.sql itself as an old -> new table.
with k as (
  select p.id, p.name, p.created_at,
         btrim(regexp_replace(translate(lower(p.name), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЫЭЪЁ’ʼ`‘', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэъё' || repeat(chr(39), 4)), '\s+', ' ', 'g')) as key
    from public.players p
   where p.name is not null and p.merged_into is null and p.deleted_at is null
), dup as (
  select key from k group by key having count(*) > 1
), bad as (
  select k.*, case
      when char_length(k.name) not between 3 and 20 then 'довжина'
      when k.name !~ '^[a-z0-9._]+$' or k.name !~ '[a-z]' then 'символи'
      when k.name !~ '^[a-z0-9].*[a-z0-9]$' then 'краї'
      when exists (select 1 from unnest(array[
        '^hui','^huy','khui','khuy','xui','xuy','pizd','pyzd','blyad','bliad','blyat','bliat','ebat','yeban','ieban','yobany',
        'mudak','mudil','zalup','gandon','pidor','pidar','shliukh','shlyukh','suchar',
        'fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','asshole'
      ]) b where case when left(b, 1) = '^' then ('_' || k.name) ~ ('[_.0-9]' || substr(b, 2))
                      else position(b in regexp_replace(k.name, '[_.]', '', 'g')) > 0 end) then 'мат'
    end as problem
    from k
)
select x.problem, x.name as "ім'я зараз", x.id as player_id, x.created_at::date as "гравець з",
       (select count(*) from public.seasons s where s.player_id = x.id) as "сезонів",
       exists (select 1 from public.player_links l where l.player_id = x.id and l.kind in ('auth', 'tg')) as "є вхід"
  from (select 'збіг' as problem, k.id, k.name, k.created_at from k join dup using (key)
        union all
        select problem, id, name, created_at from bad where problem is not null) x
 order by 1, 2, 4;
