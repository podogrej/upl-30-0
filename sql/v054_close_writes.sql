-- 30-0 УПЛ · v0.54 · КРОК 2 з 2: закрити прямий запис результатів із браузера (аудит 30.09: К5, К7, К8)
-- ЗАПУСКАТИ НЕ РАНІШЕ, НІЖ сайт 0.53 пробув у проді 7 днів (кеш браузерів і Telegram Mini App встиг оновитися),
-- і лише після v053_writes.sql. Спершу тестова база (upl-30-0-test), потім основна. Повторний запуск нічого не ламає.
-- Після нього сайт 0.52 і старіші не зможуть записати сезон, трофей, результат дня чи виклик — лише 0.53+ через сервер (/api/save).
--
-- Що тут:
--  • позначка 'v054' → legacy_writes_open() = false: /api/seed без секрету пристрою більше не видає seed (К5);
--  • прибираємо політики вставки anon/authenticated для seasons, trophies, daily_results, challenges, challenge_results
--    (у основній базі політика дня для anon зветься "insert today", у файлах — "daily insert": прибираємо обидві назви);
--  • К8: ніхто, крім сервера, не змінює nickname у seasons (політики "seasons nick"/"seasons nick auth" і право update);
--  • К7: claim_device більше не викликається ніким (сайт перестав її викликати в 0.53).
-- Політики ЧИТАННЯ ("seasons read", "daily read"/"read all", "trophies read", "chal read" тощо) лишаються.
-- Таблиці, колонки й функції не видаляються (правило 13): лише політики й права.

insert into public.app_marks (key) values ('v054') on conflict (key) do nothing;

-- seasons
drop policy if exists "seasons insert" on public.seasons;
drop policy if exists "seasons insert auth" on public.seasons;
drop policy if exists "seasons nick" on public.seasons;
drop policy if exists "seasons nick auth" on public.seasons;
revoke insert, update on public.seasons from anon, authenticated;
revoke update (nickname) on public.seasons from anon, authenticated;

-- daily_results (обидва варіанти назв)
drop policy if exists "daily insert" on public.daily_results;
drop policy if exists "insert today" on public.daily_results;
drop policy if exists "daily insert auth" on public.daily_results;
revoke insert, update on public.daily_results from anon, authenticated;

-- trophies
drop policy if exists "trophies insert" on public.trophies;
drop policy if exists "trophies insert auth" on public.trophies;
revoke insert, update on public.trophies from anon, authenticated;

-- виклики другу
drop policy if exists "chal insert" on public.challenges;
drop policy if exists "chal res insert" on public.challenge_results;
revoke insert, update on public.challenges from anon, authenticated;
revoke insert, update on public.challenge_results from anon, authenticated;

-- К7
revoke execute on function public.claim_device(uuid) from public, anon, authenticated;

-- сервер (service_role) пише далі
grant select, insert, update on public.seasons, public.daily_results, public.trophies, public.challenges, public.challenge_results to service_role;
