-- 0.69.5: feedback that players send to the bot in private chat.
-- Written only by the server (api/bot.js with the service key); anon and authenticated can neither read nor write (new tables: no anon writes).
-- Idempotent; safe for the previous client.
create table if not exists public.feedback (
  id bigserial primary key,
  at timestamptz not null default now(),
  tg_user_id bigint,          -- author's Telegram id
  name text,                  -- Telegram display name
  username text,              -- Telegram @username, if any
  kind text,                  -- text / photo / voice / video / document / sticker / other
  text text,                  -- text or media caption
  file_id text,               -- Telegram file_id (screenshot, voice), if any
  forwarded boolean not null default false   -- forwarded to the admin in Telegram
);
alter table public.feedback enable row level security;   -- no policies
revoke all on public.feedback from anon, authenticated;
create index if not exists feedback_at on public.feedback (at desc);
create index if not exists feedback_user on public.feedback (tg_user_id, at desc);
