-- 30-0 УПЛ · v0.59 · ЛИШЕ ЧИТАННЯ: чиї імена sql/v059_player_page.sql перепише латиницею (DECISIONS п. 2). Нічого не змінює.
-- Можна запускати ДО v059_player_page.sql: Supabase → SQL Editor → вставити цілком → Run. Після v059 — порожньо.
-- Результат — одна таблиця:
--   problem = «збіг»     — кілька живих гравців з тим самим іменем без урахування регістру («Вітя» і «вітя»): старший лишає ім'я
--                           (якщо воно за правилами), молодший отримує номер (vitia2);
--   «довжина» — не 3–20 символів; «символи» — щось, крім a-z, цифр, «_» і «.» (кирилиця, пробіл, великі літери, «é»);
--   «краї» — починається чи закінчується не літерою або цифрою; «мат».
-- Нове ім'я (транслітерація КМУ 2010: вітя → vitia, андрій ш → andrii_sh, andré → andre) покаже сам v059_player_page.sql — таблицею «було → стало».
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
