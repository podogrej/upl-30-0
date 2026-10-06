-- v0.54, step 2 of 2: close direct browser writes of results (audit K5, K7, K8).
-- Run only after the 0.53 site has been in production for 7 days (browser and Telegram Mini App caches refreshed),
-- and only after v053_writes.sql. Test DB first (upl-30-0-test), then main. Idempotent.
-- Afterwards clients 0.52 and older cannot write seasons, trophies, daily results or challenges; only 0.53+ via the server (/api/save).
--
-- Contents:
--  - mark 'v054' -> legacy_writes_open() = false: /api/seed no longer issues a seed without a device secret (K5);
--  - drop anon/authenticated insert policies on seasons, trophies, daily_results, challenges, challenge_results
--    (in the main DB the anon daily policy is named "insert today", in the files "daily insert": both names are dropped);
--  - K8: only the server may change nickname in seasons (policies "seasons nick"/"seasons nick auth" and the update grant);
--  - K7: claim_device is no longer callable (the client stopped calling it in 0.53).
-- READ policies ("seasons read", "daily read"/"read all", "trophies read", "chal read", etc.) are kept.
-- No tables, columns or functions are dropped (rule 13): only policies and grants.

insert into public.app_marks (key) values ('v054') on conflict (key) do nothing;

-- seasons
drop policy if exists "seasons insert" on public.seasons;
drop policy if exists "seasons insert auth" on public.seasons;
drop policy if exists "seasons nick" on public.seasons;
drop policy if exists "seasons nick auth" on public.seasons;
revoke insert, update on public.seasons from anon, authenticated;
revoke update (nickname) on public.seasons from anon, authenticated;

-- daily_results (both policy name variants)
drop policy if exists "daily insert" on public.daily_results;
drop policy if exists "insert today" on public.daily_results;
drop policy if exists "daily insert auth" on public.daily_results;
revoke insert, update on public.daily_results from anon, authenticated;

-- trophies
drop policy if exists "trophies insert" on public.trophies;
drop policy if exists "trophies insert auth" on public.trophies;
revoke insert, update on public.trophies from anon, authenticated;

-- friend challenges
drop policy if exists "chal insert" on public.challenges;
drop policy if exists "chal res insert" on public.challenge_results;
revoke insert, update on public.challenges from anon, authenticated;
revoke insert, update on public.challenge_results from anon, authenticated;

-- K7
revoke execute on function public.claim_device(uuid) from public, anon, authenticated;

-- the server (service_role) keeps writing
grant select, insert, update on public.seasons, public.daily_results, public.trophies, public.challenges, public.challenge_results to service_role;
