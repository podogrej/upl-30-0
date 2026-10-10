-- Step 2 of 0.87 "Data protection" (DECISIONS item 13): NOT part of 0.87. Run only when no 0.86 tab can be open any more
-- (at least 7 days after 0.87 reached production) and after sql/v087_data_protection.sql has been applied.
-- Removes direct anon/authenticated reads of tables with personal data (device_id, tg_user_id, tg_name, user_id, seed, chat_id, created_by).
-- Since 0.87 the site reads them only through seasons_pub, challenges_pub, challenge_results_pub, my_seasons and security definer RPCs;
-- the server uses the service key. Only grants are revoked (policies stay): undo = grant select on <table> to anon, authenticated.
do $$ begin
  if to_regclass('public.seasons_pub') is null or to_regclass('public.challenges_pub') is null or to_regclass('public.challenge_results_pub') is null
     or to_regprocedure('public.my_seasons(uuid, text)') is null then
    raise exception 'sql/v087_data_protection.sql is not applied yet';
  end if;
end $$;
revoke select on public.seasons, public.daily_results, public.trophies, public.leagues, public.league_results, public.league_members,
                 public.players, public.challenges, public.challenge_results from anon, authenticated;

-- check: expected no rows
select table_name, grantee from information_schema.role_table_grants
 where table_schema = 'public' and grantee in ('anon', 'authenticated') and privilege_type = 'SELECT'
   and table_name in ('seasons', 'daily_results', 'trophies', 'leagues', 'league_results', 'league_members', 'players', 'challenges', 'challenge_results');
