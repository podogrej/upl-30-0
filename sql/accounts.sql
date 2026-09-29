-- 30-0 УПЛ · v0.20 · необов'язкові акаунти (Google / Telegram)
-- Вставити цілком у Supabase → SQL Editor → Run

-- стан гравця (трофеї, серія, рекорди, нік) — один рядок на акаунт
create table if not exists public.user_state (
  user_id    uuid primary key references auth.users on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.user_state enable row level security;
drop policy if exists "own state" on public.user_state;
create policy "own state" on public.user_state for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- прив'язка результатів до акаунта
alter table public.seasons       add column if not exists user_id uuid;
alter table public.daily_results add column if not exists user_id uuid;
alter table public.trophies      add column if not exists user_id uuid;
create index if not exists seasons_user_idx on public.seasons (user_id, created_at desc);
create unique index if not exists daily_one_per_user on public.daily_results (day, user_id) where user_id is not null;

-- user_id ставить сервер, а не браузер: підробити чужий неможливо
create or replace function public.set_user_id() returns trigger language plpgsql security definer set search_path = public as $$
begin new.user_id := auth.uid(); return new; end $$;
drop trigger if exists seasons_uid on public.seasons;
create trigger seasons_uid before insert on public.seasons for each row execute function public.set_user_id();
drop trigger if exists daily_uid on public.daily_results;
create trigger daily_uid before insert on public.daily_results for each row execute function public.set_user_id();
drop trigger if exists trophies_uid on public.trophies;
create trigger trophies_uid before insert on public.trophies for each row execute function public.set_user_id();

-- ті самі права для тих, хто увійшов (раніше були лише для анонімних)
drop policy if exists "seasons read auth" on public.seasons;
create policy "seasons read auth" on public.seasons for select to authenticated using (true);
drop policy if exists "seasons insert auth" on public.seasons;
create policy "seasons insert auth" on public.seasons for insert to authenticated
  with check (w + d + l = 30 and pts = w * 3 + d and place between 1 and 16);
drop policy if exists "seasons nick auth" on public.seasons;
create policy "seasons nick auth" on public.seasons for update to authenticated using (user_id is null or user_id = auth.uid());
grant update (nickname) on public.seasons to authenticated;

drop policy if exists "daily read auth" on public.daily_results;
create policy "daily read auth" on public.daily_results for select to authenticated using (true);
drop policy if exists "daily insert auth" on public.daily_results;
create policy "daily insert auth" on public.daily_results for insert to authenticated
  with check (day between (now() at time zone 'Europe/Kyiv')::date - 1 and (now() at time zone 'Europe/Kyiv')::date);

drop policy if exists "trophies read auth" on public.trophies;
create policy "trophies read auth" on public.trophies for select to authenticated using (true);
drop policy if exists "trophies insert auth" on public.trophies;
create policy "trophies insert auth" on public.trophies for insert to authenticated with check (length(trophy) <= 24);

-- після входу: усе, що зіграно з цього пристрою до входу, переходить в акаунт
create or replace function public.claim_device(p_device uuid) returns void language sql security definer set search_path = public as $$
  update seasons       set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update daily_results set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
  update trophies      set user_id = auth.uid() where device_id = p_device and user_id is null and auth.uid() is not null;
$$;
revoke execute on function public.claim_device(uuid) from anon;
grant execute on function public.claim_device(uuid) to authenticated;

-- «є в X% гравців»: гравець = акаунт або пристрій без акаунта
create or replace function public.trophy_stats()
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'players', (select count(distinct coalesce(user_id::text, device_id::text)) from seasons where not practice),
    't', coalesce((select json_object_agg(trophy, n) from (select trophy, count(distinct coalesce(user_id::text, device_id::text)) n from trophies group by trophy) x), '{}'::json)
  );
$$;
grant execute on function public.trophy_stats() to anon, authenticated;
grant execute on function public.game_stats() to authenticated;
