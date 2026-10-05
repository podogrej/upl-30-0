-- 0.68: JavaScript errors reported from players' devices.
-- Written only by the server (/api/err with the service key); anon and authenticated can neither read nor write (new tables: no anon writes).
-- Rows older than 30 days are purged by the daily backup (/api/backup). Idempotent; safe for the previous client.
create table if not exists public.client_errors (
  id bigserial primary key,
  at timestamptz not null default now(),
  version text,          -- game version from the footer
  msg text not null,     -- error message
  src text, line int, col int, stack text,
  screen text,           -- game screen (home, draft, result...)
  url text,              -- path and start of the query string
  ua text,               -- browser / device
  tg text,               -- Telegram platform and version, if opened in Telegram
  player text,           -- player's public id (as in the player page link), if known
  n int not null default 1   -- how many times in a row this error occurred on the page
);
alter table public.client_errors enable row level security;   -- no policies: anon/authenticated can neither read nor write
revoke all on public.client_errors from anon, authenticated;
create index if not exists client_errors_at on public.client_errors (at desc);
