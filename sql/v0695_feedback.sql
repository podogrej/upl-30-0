-- 0.69.5 (власник 02.10: «хочу отримувати зворотний зв'язок від гравців через бота»): відгуки, які гравці пишуть боту в особисті.
-- Пише лише сервер (api/bot.js ключем сервера); anon і authenticated не читають і не пишуть (DECISIONS: нові таблиці — без запису для anon).
-- Можна запускати повторно; попередню версію сайту не ламає.
create table if not exists public.feedback (
  id bigserial primary key,
  at timestamptz not null default now(),
  tg_user_id bigint,          -- хто написав (Telegram id)
  name text,                  -- ім'я в Telegram
  username text,              -- @нік у Telegram, якщо є
  kind text,                  -- text / photo / voice / video / document / sticker / other
  text text,                  -- текст або підпис до скріна
  file_id text,               -- файл у Telegram (скрін, голос), якщо є
  forwarded boolean not null default false   -- переслано власнику в Telegram
);
alter table public.feedback enable row level security;   -- політик немає
revoke all on public.feedback from anon, authenticated;
create index if not exists feedback_at on public.feedback (at desc);
create index if not exists feedback_user on public.feedback (tg_user_id, at desc);
