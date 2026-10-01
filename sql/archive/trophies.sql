-- НЕ ЗАПУСКАТИ (архів, 0.67). Старий SQL: відкриває пряму запис для anon і зламає крок 2 (v054_close_writes). Для нової бази — README, розділ sql/.
-- 30-0 УПЛ · v0.19 · трофеї: хто який трофей відкрив (для «є в X% гравців»)
-- Вставити цілком у Supabase → SQL Editor → Run

alter table public.seasons add column if not exists golden boolean;

create table if not exists public.trophies (
  device_id  uuid not null,
  trophy     text not null,
  tg_user_id bigint,
  tg_name    text,
  created_at timestamptz not null default now(),
  primary key (device_id, trophy)
);

alter table public.trophies enable row level security;
drop policy if exists "trophies read" on public.trophies;
create policy "trophies read" on public.trophies for select to anon using (true);
drop policy if exists "trophies insert" on public.trophies;
create policy "trophies insert" on public.trophies for insert to anon with check (length(trophy) <= 24);

-- скільки гравців відкрили кожен трофей
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct device_id) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(*) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon;
