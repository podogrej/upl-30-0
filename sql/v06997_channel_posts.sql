-- 0.69.97: post queue for the Telegram channel about UPL history. The bot @upl30_bot is a channel admin.
-- Posts arrive as drafts (a separate Claude session via the Supabase connector, or server autoposts) or already approved
-- (admin /post command in the bot); the admin approves drafts with buttons in private chat; the server publishes once publish_at is reached (api/_channel.js).
-- Read/written only by the server (service key) and the admin via Supabase; anon and authenticated have no access (new tables: no anon writes).
-- Additive only; idempotent; safe for the previous client. Run on BOTH DBs (test and main).
create table if not exists public.channel_posts (
  id bigserial primary key,
  text text not null,                       -- Telegram HTML markup (<b>, <i>, <a href>, ...); visible text <= 4096, with an image <= 1024
  image_url text,                           -- optional: image URL (https://...) or a Telegram image file_id
  publish_at timestamptz not null,          -- when to publish (entered in Kyiv time, stored as a timestamp)
  status text not null default 'draft',     -- draft -> approved -> published; or skipped / failed
  source text not null default 'chat',      -- who added it: chat (Claude session), owner (admin via the bot), auto (server)
  created_at timestamptz not null default now(),
  published_at timestamptz,
  tg_message_id bigint,
  error text,
  notified_at timestamptz                   -- when the draft was sent to the admin for approval (to avoid sending twice)
);
alter table public.channel_posts add column if not exists notified_at timestamptz;
do $$ begin
  alter table public.channel_posts add constraint channel_posts_status_chk check (status in ('draft','approved','published','skipped','failed'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.channel_posts add constraint channel_posts_source_chk check (source in ('chat','owner','auto'));
exception when duplicate_object then null; end $$;
-- visible text length (HTML tags stripped), as Telegram counts it: 4096 for a plain post, 1024 for an image caption
do $$ begin
  alter table public.channel_posts add constraint channel_posts_len_chk check (
    char_length(regexp_replace(text, '<[^>]+>', '', 'g')) <= case when image_url is null or image_url = '' then 4096 else 1024 end);
exception when duplicate_object then null; end $$;
alter table public.channel_posts enable row level security;   -- no policies
revoke all on public.channel_posts from anon, authenticated;
revoke all on sequence public.channel_posts_id_seq from anon, authenticated;
create index if not exists channel_posts_due on public.channel_posts (status, publish_at);
