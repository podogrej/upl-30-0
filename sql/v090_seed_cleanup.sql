-- 0.90 (owner decision 12.10): daily cleanup of old rows that nothing reads any more. Called by api/cron.js (rpc/cleanup_old_rows), service_role only.
--  - season_seeds: never used (used_by is null), not a daily-challenge attempt (vd_day is null), older than 2 days.
--    Why 2 days is enough: a season in progress, a chat-league attempt (an issued and unsaved seed IS the attempt; the league day is one Kyiv day
--    and api/_league.js dayBest reads only seeds of that day) and a late save all happen within hours. Daily-challenge attempts (vd_day) are
--    never touched. seasons.seed_id / vd_results.seed_id have no foreign key to this table, so no season loses a row.
--    A season saved more than 2 days after its seed was issued can no longer be verified (seed not found -> verified = false).
--  - tg_logins: bot login tokens live 10 minutes (api/auth.js); rows older than 2 days are dead and hold Telegram ids and names.
-- Each run deletes at most 20000 rows per table (the first run after the rollout may need a second call). Returns the counts.
create index if not exists season_seeds_cleanup_idx on public.season_seeds (created_at) where used_by is null and vd_day is null;
create index if not exists tg_logins_created_idx on public.tg_logins (created_at);
create or replace function public.cleanup_old_rows() returns jsonb
language plpgsql security definer set search_path = public as $$
declare n_seeds bigint; n_logins bigint;
begin
  delete from public.season_seeds where id in (
    select id from public.season_seeds
     where used_by is null and vd_day is null and created_at < now() - interval '2 days'
     limit 20000);
  get diagnostics n_seeds = row_count;
  delete from public.tg_logins where token in (
    select token from public.tg_logins where created_at < now() - interval '2 days' limit 20000);
  get diagnostics n_logins = row_count;
  return jsonb_build_object('season_seeds', n_seeds, 'tg_logins', n_logins);
end $$;
revoke execute on function public.cleanup_old_rows() from public, anon, authenticated;
grant execute on function public.cleanup_old_rows() to service_role;
