-- 0.70: opt-in evening notifications in the bot (table tg_notify, api/_notify.js) and Telegram group leagues in "My leagues" (tg_leagues_mine).
-- tg_notify is written only by the server (service key): /notify and the on/off buttons in the bot; anon and authenticated have no access.
-- Additive and idempotent. Run on BOTH DBs.
create table if not exists public.tg_notify (
  tg_user_id bigint primary key,                 -- Telegram user id (private chat id is the same)
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
alter table public.tg_notify enable row level security;   -- no policies
revoke all on public.tg_notify from anon, authenticated;

-- 0.70: "My leagues" on the player page also lists the player's Telegram group leagues (league_members by player or by linked Telegram id).
create or replace function public.tg_leagues_mine(p_device uuid, p_secret text) returns json language plpgsql volatile security definer set search_path = public as $$
declare pid uuid; res json;
begin
  pid := public.device_check(p_device, p_secret);
  select coalesce(json_agg(x order by x.played_today desc, x.title), '[]'::json) into res from (
    select g.chat_id, g.title,
           (select count(*) from league_members mm where mm.chat_id = g.chat_id) as members,
           (select count(*) from league_results r where r.chat_id = g.chat_id and r.day = (now() at time zone 'Europe/Kyiv')::date) as played_today
      from leagues g
     where exists (select 1 from league_members m where m.chat_id = g.chat_id
                     and (m.player_id = pid or m.tg_user_id::text in (select key from player_links where kind = 'tg' and player_id = pid)))
  ) x;
  return res;
end $$;
revoke execute on function public.tg_leagues_mine(uuid, text) from public;
grant execute on function public.tg_leagues_mine(uuid, text) to anon, authenticated;
