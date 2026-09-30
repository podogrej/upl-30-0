-- 30-0 УПЛ · v0.59 · ЛИШЕ ЧИТАННЯ: які імена гравців не пройдуть нові правила (DECISIONS п. 2). Нічого не змінює.
-- Запускати ДО sql/v059_player_page.sql (і можна будь-коли після): Supabase → SQL Editor → вставити цілком → Run.
-- Результат — одна таблиця:
--   problem = «збіг»     — кілька живих гравців з тим самим іменем без урахування регістру («Вітя» і «вітя»).
--                           Поки такі є, унікальний індекс імен не створюється (set_player_name однаково не дасть узяти зайняте ім'я).
--   problem = «довжина»  — не 3–20 символів;  «символи» — щось, крім a-z, а-я, і, ї, є, ґ, цифр, пробілу, _ ' -;  «мат».
-- Старі імена з «довжиною»/«символами» лишаються як є (показуються в нижньому регістрі); правила діють лише на нові зміни імені.
-- Що робити зі збігами (DECISIONS п. 2: «вітя», «вітя 2») — вирішуємо разом: надішли цю таблицю (знімок) у чат.
with k as (
  select p.id, p.name, p.created_at,
         btrim(regexp_replace(translate(lower(p.name), 'АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯЫЭЪЁ’ʼ`‘', 'абвгґдеєжзиіїйклмнопрстуфхцчшщьюяыэъё' || repeat(chr(39), 4)), '\s+', ' ', 'g')) as key
    from public.players p
   where p.name is not null and p.merged_into is null and p.deleted_at is null
), dup as (
  select key from k group by key having count(*) > 1
), bad as (
  select k.*, case
      when char_length(k.key) not between 3 and 20 then 'довжина'
      when k.key !~ '^[a-z0-9а-яіїєґ _''-]+$' or k.key !~ '[a-zа-яіїєґ]' then 'символи'
      when exists (select 1 from unnest(array[
        'хуй','хуя','хує','хуе','хуї','пизд','пізд','блят','бляд','ебат','ебан','ебал','єбат','єбан','єбал','їбат','їбан','заїб','уеб',
        'мудак','мудил','залуп','гандон','підор','пидор','підар','пидар','шлюх','сучар',
        'fuck','shit','cunt','bitch','nigger','nigga','faggot','whore','pussy','asshole'
      ]) b where position(b in regexp_replace(k.key, '[ _''-]', '', 'g')) > 0) then 'мат'
    end as problem
    from k
)
select x.problem, x.key as "ім'я (як показується)", x.name as "у базі", x.id as player_id, x.created_at::date as "гравець з",
       (select count(*) from public.seasons s where s.player_id = x.id) as "сезонів",
       (select max(s.created_at)::date from public.seasons s where s.player_id = x.id) as "останній сезон",
       exists (select 1 from public.player_links l where l.player_id = x.id and l.kind in ('auth', 'tg')) as "є вхід"
  from (select 'збіг' as problem, k.id, k.name, k.created_at, k.key from k join dup using (key)
        union all
        select problem, id, name, created_at, key from bad where problem is not null) x
 order by 1, 2, 5;
