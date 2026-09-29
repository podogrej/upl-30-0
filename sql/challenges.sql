-- 30-0 УПЛ · v0.28 · виклики «побий мій результат» + тижневий підсумок ліг
-- Вставити цілком у Supabase → SQL Editor → Run

create table if not exists public.challenges (
  id         text primary key,
  created_at timestamptz not null default now(),
  device_id  uuid,
  user_id    uuid,
  name       text,
  seed       bigint not null,
  formation  text not null,
  year       int not null,
  mode       text not null,
  w int, d int, l int, pts int, place int, gf int, ga int
);
create table if not exists public.challenge_results (
  challenge_id text not null references public.challenges(id) on delete cascade,
  device_id    uuid not null,
  user_id      uuid,
  name         text,
  w int, d int, l int, pts int, place int, gf int, ga int,
  created_at   timestamptz not null default now(),
  primary key (challenge_id, device_id)
);
alter table public.challenges        enable row level security;
alter table public.challenge_results enable row level security;
drop policy if exists "chal read" on public.challenges;
create policy "chal read" on public.challenges for select to anon, authenticated using (true);
drop policy if exists "chal insert" on public.challenges;
create policy "chal insert" on public.challenges for insert to anon, authenticated
  with check (length(id) between 6 and 12 and w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop policy if exists "chal res read" on public.challenge_results;
create policy "chal res read" on public.challenge_results for select to anon, authenticated using (true);
drop policy if exists "chal res insert" on public.challenge_results;
create policy "chal res insert" on public.challenge_results for insert to anon, authenticated
  with check (w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop trigger if exists chal_uid on public.challenges;
create trigger chal_uid before insert on public.challenges for each row execute function public.set_user_id();
drop trigger if exists chal_res_uid on public.challenge_results;
create trigger chal_res_uid before insert on public.challenge_results for each row execute function public.set_user_id();

-- тижневий підсумок ліг: позначка «вже надіслано»
alter table public.league_boards add column if not exists weekly_sent boolean not null default false;
