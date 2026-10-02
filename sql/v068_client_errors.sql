-- 0.68 (власник 02.10: «перед розсилкою на багато людей — щоб бачити помилки гравців»): помилки JavaScript з пристроїв гравців.
-- Пише лише сервер (/api/err ключем сервера); anon і authenticated не читають і не пишуть (DECISIONS: нові таблиці — без запису для anon).
-- Записи старші за 30 днів стирає щоденна копія (/api/backup). Можна запускати повторно; попередню версію сайту не ламає.
create table if not exists public.client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  version text,          -- версія гри з підвалу
  msg text not null,     -- текст помилки
  src text, line int, col int, stack text,
  screen text,           -- екран гри (home, draft, result…)
  url text,              -- шлях і початок параметрів
  ua text,               -- браузер / пристрій
  tg text,               -- Telegram: платформа й версія, якщо відкрито в Telegram
  player text,           -- публічний id гравця (як у посиланні на сторінку), якщо відомий
  n int not null default 1   -- скільки разів поспіль ця помилка була на сторінці
);
alter table public.client_errors enable row level security;   -- політик немає: anon/authenticated не бачать і не пишуть
revoke all on public.client_errors from anon, authenticated;
create index if not exists client_errors_at on public.client_errors (at desc);
