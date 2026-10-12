-- 0.90 (review 12.10, N-7): close anonymous writes to the old online 5x5 tables f5_rooms / f5_players / f5_picks.
-- Since 0.70 the site does not touch these tables (5x5 is local or a friends league through the server: fl_*), but the policy
-- "f5 rooms update" (using true) still lets anyone change any room, and insert policies let anyone add rows.
-- Step 1 of 2: drop every INSERT / UPDATE / DELETE policy for anon / authenticated (whatever its name in this database) and revoke the grants.
--   READ policies stay (nothing is dropped, DECISIONS item 13). Security definer functions (merge, delete_player, device checks)
--   run as the table owner and are not affected; the server (service_role) keeps full access.
-- Step 2 (later, a separate file, only if the check below shows no use): drop the read policies as well (f5_players.device_id is readable now).
-- Safe to run repeatedly. Test DB first, then main.
do $$
declare r record;
begin
  for r in select schemaname, tablename, policyname, cmd from pg_policies
            where schemaname = 'public' and tablename in ('f5_rooms', 'f5_players', 'f5_picks') and cmd in ('INSERT', 'UPDATE', 'DELETE') loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
  for r in select tablename, policyname from pg_policies
            where schemaname = 'public' and tablename in ('f5_rooms', 'f5_players', 'f5_picks') and cmd = 'ALL' loop
    raise notice 'f5: policy % on % is FOR ALL: it also allows writes, review it by hand', r.policyname, r.tablename;
  end loop;
end $$;
revoke insert, update, delete, truncate on public.f5_rooms, public.f5_players, public.f5_picks from anon, authenticated;
grant select, insert, update, delete on public.f5_rooms, public.f5_players, public.f5_picks to service_role;
