-- 30-0 УПЛ · v0.29 · захист таблиць: seed видає сервер, сервер перевіряє сезони
-- Вставити цілком у Supabase → SQL Editor → Run

create extension if not exists pgcrypto;

-- видані seed (доступ лише серверу: політик для anon немає)
create table if not exists public.season_seeds (
  id         uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  device_id  uuid not null,
  xi_hash    text not null,
  seed       bigint not null,
  day        date not null,
  daily      boolean not null default false,
  official   boolean not null default false,
  formation  text, mode text, format text, year int,
  used_by    bigint
);
create index if not exists season_seeds_daily_idx on public.season_seeds (device_id, day) where daily;
alter table public.season_seeds enable row level security;

alter table public.seasons       add column if not exists seed_id     uuid;
alter table public.seasons       add column if not exists verified    boolean;
alter table public.seasons       add column if not exists verify_note text;
alter table public.daily_results add column if not exists verified    boolean;
create index if not exists seasons_verified_top_idx on public.seasons (format, verified, pts desc) where verified;

-- позначку «перевірено» може ставити лише сервер; браузер не підробить
create or replace function public.strip_verified() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    if tg_op = 'UPDATE' then
      new.verified := old.verified;
      if tg_table_name = 'seasons' then new.verify_note := old.verify_note; end if;
    else
      new.verified := null;
      if tg_table_name = 'seasons' then new.verify_note := null; end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists seasons_strip_verified on public.seasons;
create trigger seasons_strip_verified before insert or update on public.seasons for each row execute function public.strip_verified();
drop trigger if exists daily_strip_verified on public.daily_results;
create trigger daily_strip_verified before insert or update on public.daily_results for each row execute function public.strip_verified();
