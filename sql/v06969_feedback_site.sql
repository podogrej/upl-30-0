-- 0.69.69 (власник 04.10: «відгук — у підвалі, як у 38-0»): відгуки з форми на сайті потрапляють у ту саму таблицю feedback (source = site; порожнє — бот).
-- Пише лише сервер (api/err.js ключем сервера); anon і authenticated, як і раніше, не мають доступу.
-- Лише додаємо колонки; можна запускати повторно; попередня версія сайту (бот) пише без них і далі працює.
alter table public.feedback add column if not exists source text;    -- 'site' — форма в підвалі; порожнє — особисті з ботом
alter table public.feedback add column if not exists contact text;   -- пошта або @нік, який гравець сам вписав, щоб йому відповіли
alter table public.feedback add column if not exists version text;   -- версія сайту
alter table public.feedback add column if not exists player text;    -- публічний id гравця, якщо увійшов
alter table public.feedback add column if not exists screen text;    -- екран, з якого написали
alter table public.feedback add column if not exists ua text;        -- браузер / пристрій
