-- 0.79: chat-league attempts of regular free play are seeds marked league=true (first 3 per Kyiv day count).
-- Additive only and idempotent; old clients never set it.
alter table public.season_seeds add column if not exists league boolean not null default false;

-- dayBest looks up a player's league seeds of one day
create index if not exists season_seeds_league_day_idx on public.season_seeds (device_id, day) where league;
