-- 0.69.97: post queue for the public Telegram channel @upl_nostalgia (bot @upl30_bot is a channel admin), code in api/_channel.js.
-- Flow: draft -> pending_approval (preview sent to the admin) -> published (Publish button) | rejected | failed (Telegram error, retry).
-- Read/written only by the server (service key) and the admin via Supabase; anon and authenticated have no access.
-- Additive and idempotent; works on top of a table that was created by hand (id, text, image_url, publish_at, status, source, created_at). Run on BOTH DBs.
create table if not exists public.channel_posts (
  id bigint generated always as identity primary key,
  text text not null,                       -- Telegram HTML markup (<b>, <i>, <a href>, ...); visible text <= 4096, with an image <= 1024
  image_url text,                           -- optional: image URL (https://...) or a Telegram image file_id
  publish_at timestamptz not null,          -- when the draft is shown to the admin for approval
  status text not null default 'draft',
  source text not null default 'chat',      -- chat (Claude session via Supabase), owner (/post in the bot), auto (server)
  created_at timestamptz not null default now()
);
alter table public.channel_posts add column if not exists published_at timestamptz;
alter table public.channel_posts add column if not exists tg_message_id bigint;   -- message_id of the post in the channel
alter table public.channel_posts add column if not exists error text;             -- last Telegram error (status failed)
-- status list (re-created so a re-run also widens an older list from earlier test runs)
-- statuses from the earlier test-DB version (approved, skipped) mapped to the current ones, so the new check passes on re-run
update public.channel_posts set status = case status when 'approved' then 'pending_approval' else 'rejected' end where status in ('approved', 'skipped');
alter table public.channel_posts drop constraint if exists channel_posts_status_chk;
alter table public.channel_posts add constraint channel_posts_status_chk check (status in ('draft','pending_approval','published','rejected','failed'));
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
