-- 0.69.69: feedback from the site footer form goes into the same feedback table (source = site; empty = bot).
-- Written only by the server (api/err.js with the service key); anon and authenticated still have no access.
-- Additive columns only; idempotent; the previous client (bot) writes without them and keeps working.
alter table public.feedback add column if not exists source text;    -- 'site' = footer form; empty = private chat with the bot
alter table public.feedback add column if not exists contact text;   -- email or @username the player entered for a reply
alter table public.feedback add column if not exists version text;   -- site version
alter table public.feedback add column if not exists player text;    -- player's public id, if signed in
alter table public.feedback add column if not exists screen text;    -- screen the feedback was sent from
alter table public.feedback add column if not exists ua text;        -- browser / device
