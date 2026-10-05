-- v0.55: database backups and request rate limiting
-- Run on the test DB first (upl-30-0-test), then on the main DB.
-- Idempotent. Additive only, so the previous client (0.54) keeps working.
--
-- Contents:
--  1. Private storage bucket "backups": the server (api/backup.js, Vercel Cron) uploads YYYY-MM-DD.json.gz nightly.
--     No anon/authenticated policies: only the server (service_role) and the Supabase dashboard
--     (Storage -> backups -> file -> Download) can list or read files.
--  2. rate_hits + rate_hit(p_key, p_limit): per-minute request counter for /api/seed, /api/save, /api/verify, /api/card, /api/auth.
--     service_role only. The function itself prunes rows older than 10 minutes.

-- 1. private bucket for backups (50 MB file limit, the Supabase free-tier maximum)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/gzip'])
on conflict (id) do update set public = false;

-- 2. rate limiting: one row per (key, minute). Key looks like "seed:d:<device_id>", "verify:ip:<address>", etc.
create table if not exists public.rate_hits (
  key text not null,
  minute timestamptz not null,
  n int not null default 0,
  primary key (key, minute)
);
alter table public.rate_hits enable row level security;   -- no policies: anon/authenticated can neither read nor write
revoke all on public.rate_hits from anon, authenticated;

-- increments this minute's counter; true = within limit, false = too many (server responds 429)
create or replace function public.rate_hit(p_key text, p_limit int) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if p_key is null or length(p_key) > 120 or p_limit is null then return true; end if;
  insert into rate_hits as h (key, minute, n) values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, minute) do update set n = h.n + 1
    returning h.n into c;
  if random() < 0.02 then delete from rate_hits where minute < now() - interval '10 minutes'; end if;
  return c <= p_limit;
end $$;
revoke execute on function public.rate_hit(text, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int) to service_role;
