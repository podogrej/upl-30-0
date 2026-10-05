-- 0.69.97 (власник 05.10): черга постів для Telegram-каналу про історію УПЛ. Бот @upl30_bot — адмін каналу.
-- Пости потрапляють сюди чернетками (окрема сесія Claude через коннектор Supabase, або автопости сервера) чи одразу схваленими
-- (власник командою /post у боті); власник схвалює кнопками в особистих; сервер публікує, коли настав publish_at (api/_channel.js).
-- Пише й читає лише сервер (ключ сервера) і власник через Supabase; anon і authenticated доступу не мають (DECISIONS: нові таблиці — без запису для anon).
-- Лише додаємо; можна запускати повторно; попередню версію сайту не ламає. Запускати в ОБОХ базах (тестовій і основній).
create table if not exists public.channel_posts (
  id bigserial primary key,
  text text not null,                       -- HTML-розмітка Telegram (<b>, <i>, <a href>, …); видимого тексту ≤ 4096, з картинкою ≤ 1024
  image_url text,                           -- необов'язково: адреса картинки (https://…) або file_id картинки з Telegram
  publish_at timestamptz not null,          -- коли вийти (вводять за Києвом, зберігається як момент часу)
  status text not null default 'draft',     -- draft → approved → published; або skipped / failed
  source text not null default 'chat',      -- хто додав: chat (сесія Claude), owner (власник через бота), auto (сервер)
  created_at timestamptz not null default now(),
  published_at timestamptz,
  tg_message_id bigint,
  error text,
  notified_at timestamptz                   -- коли чернетку надіслано власнику на схвалення (щоб не надсилати двічі)
);
alter table public.channel_posts add column if not exists notified_at timestamptz;
do $$ begin
  alter table public.channel_posts add constraint channel_posts_status_chk check (status in ('draft','approved','published','skipped','failed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.channel_posts add constraint channel_posts_source_chk check (source in ('chat','owner','auto'));
exception when duplicate_object then null; end $$;
-- довжина видимого тексту (без HTML-тегів), як рахує Telegram: 4096 для звичайного поста, 1024 — підпис до картинки
do $$ begin
  alter table public.channel_posts add constraint channel_posts_len_chk check (
    char_length(regexp_replace(text, '<[^>]+>', '', 'g')) <= case when image_url is null or image_url = '' then 4096 else 1024 end);
exception when duplicate_object then null; end $$;
alter table public.channel_posts enable row level security;   -- політик немає
revoke all on public.channel_posts from anon, authenticated;
revoke all on sequence public.channel_posts_id_seq from anon, authenticated;
create index if not exists channel_posts_due on public.channel_posts (status, publish_at);
