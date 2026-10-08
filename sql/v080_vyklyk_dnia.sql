-- 0.80: «Виклик дня» attempts (table vd_results; challenge_results is taken by «Виклик другу»). Additive only and idempotent; written by the server only.
create table if not exists public.vd_results (
  id bigserial primary key,
  day date not null,                    -- challenge day (Kyiv)
  device_id uuid not null,
  player_id uuid,
  attempt smallint not null check (attempt between 1 and 5),
  gate_ok boolean not null,             -- required condition met
  score smallint not null check (score between 0 and 11),
  season_id bigint,                     -- played season (null when the attempt burned without a season)
  seed_id uuid,
  xi jsonb,
  late boolean not null default false,  -- played after its day (archive), not counted in streaks
  created_at timestamptz not null default now(),
  unique (day, device_id, attempt)
);
create index if not exists vd_results_player_idx on public.vd_results (player_id, day);

alter table public.vd_results enable row level security;
-- no anon/authenticated policies: reads go through the server or RPC below
revoke all on public.vd_results from anon, authenticated;

-- Own attempts for one device (best per day for the archive grid)
create or replace function public.vd_mine(p_device uuid, p_from date default null)
returns table(c_day date, best smallint, attempts int, gate_any boolean)
language sql stable security definer set search_path = public as $$
  select r.day, (max(r.score) filter (where r.gate_ok))::smallint, count(*)::int, bool_or(r.gate_ok)
  from public.vd_results r
  where r.device_id = p_device and (p_from is null or r.day >= p_from)
  group by r.day
$$;
revoke execute on function public.vd_mine(uuid, date) from public, anon, authenticated;

-- Challenge attempt seeds: which challenge day and attempt a seed belongs to (null for other modes)
alter table public.season_seeds add column if not exists vd_day date;
alter table public.season_seeds add column if not exists vd_attempt smallint;
create unique index if not exists season_seeds_vd_uq on public.season_seeds (device_id, vd_day, vd_attempt) where vd_day is not null;
