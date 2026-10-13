-- 0.90.3 traffic sources: where players come from (UTM / referrer / direct) and whether they played.
-- One row per device and event; the first source of a device is kept on every event (first touch wins).
-- Written only by the server (/api/err {traffic}); no access for anon/authenticated. Safe to run repeatedly.
create table if not exists public.traffic_events (
  id bigserial primary key,
  anon_id uuid not null,                 -- device id of the site (upl30_device), no personal data
  event text not null check (event in ('visit', 'season_start', 'season_finish')),
  utm_source text, utm_medium text, utm_campaign text,
  referrer text,                         -- hostname only; 'direct' when there was none
  created_at timestamptz not null default now()
);
create unique index if not exists traffic_events_once on public.traffic_events (anon_id, event);
create index if not exists traffic_events_at on public.traffic_events (created_at);
alter table public.traffic_events enable row level security;
revoke all on public.traffic_events from anon, authenticated;
revoke all on sequence public.traffic_events_id_seq from anon, authenticated;

-- report: per source, how many devices visited, started and finished a season
create or replace view public.traffic_funnel with (security_invoker = true) as
select coalesce(v.utm_source, v.referrer, 'direct') as source,
       v.utm_medium, v.utm_campaign,
       count(*) as visitors,
       count(*) filter (where exists (select 1 from traffic_events s where s.anon_id = v.anon_id and s.event = 'season_start')) as started,
       count(*) filter (where exists (select 1 from traffic_events f where f.anon_id = v.anon_id and f.event = 'season_finish')) as finished,
       min(v.created_at) as first_at, max(v.created_at) as last_at
  from traffic_events v
 where v.event = 'visit'
 group by 1, 2, 3;
revoke all on public.traffic_funnel from anon, authenticated;
