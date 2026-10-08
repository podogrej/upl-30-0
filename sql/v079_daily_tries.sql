-- 0.79: up to 3 official daily attempts per device and day, best counts.
-- Additive only and idempotent. The 0.53 index season_seeds_official_uq stays: attempt 1 keeps official=true,
-- attempts 2-3 are official=false rows numbered by daily_try.

-- 1. Attempt number of a daily seed (1..3); null for practice and non-daily seeds.
alter table public.season_seeds add column if not exists daily_try smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'season_seeds_daily_try_ck') then
    alter table public.season_seeds add constraint season_seeds_daily_try_ck check (daily_try is null or daily_try between 1 and 3);
  end if;
end $$;

-- 2. One seed per device, day and attempt number.
create unique index if not exists season_seeds_daily_try_uq on public.season_seeds (device_id, day, daily_try) where daily and daily_try is not null;

-- 3. Which attempt the day result came from (null = written by a client before 0.79).
alter table public.daily_results add column if not exists best_try smallint;
