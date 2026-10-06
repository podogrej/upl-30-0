-- 0.71.1: eras are decades (d1990 = seasons 1992/93-1999/00, d2000 = 2000/01-2009/10, d2010, d2020 = 2020/21+).
-- fl_create / fl_create5 accept the new keys; legacy keys (y2000 / y2010 / y2015) stay valid for the previous site version.
-- Re-runnable: only create or replace of the two functions, same signatures and grants. Run on test and main DB.

create or replace function public.fl_create(p_device uuid, p_secret text, p_name text, p_days int, p_tries int, p_take text, p_scoring text,
                                            p_rerolls int, p_ratings text, p_era text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); code text; k int := 0;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  if char_length(nm) not between 2 and 40 or p_days not in (1, 3, 7) or p_tries not in (1, 3) or p_take not in ('best', 'last')
     or p_scoring not in ('place', 'sum') or p_rerolls not in (0, 1, 3) or p_ratings not in ('show', 'memory')
     or p_era not in ('all', 'd1990', 'd2000', 'd2010', 'd2020', 'y2000', 'y2010', 'y2015') then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  if (select count(*) from fl_leagues where owner = pid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'fl_many' using errcode = '22023';   -- at most 20 leagues per player per day
  end if;
  loop
    code := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from fl_leagues where id = code);
    k := k + 1; if k > 20 then raise exception 'fl_code'; end if;
  end loop;
  insert into fl_leagues (id, owner, name, start_day, days, tries, take, scoring, rerolls, ratings, era)
    values (code, pid, nm, public.fl_today(), p_days, p_tries, p_take, p_scoring, p_rerolls, p_ratings, p_era);
  insert into fl_members (league_id, player_id) values (code, pid);
  return public.fl_get(code);
end $$;
revoke execute on function public.fl_create(uuid, text, text, int, int, text, text, int, text, text) from public, anon;
grant execute on function public.fl_create(uuid, text, text, int, int, text, text, int, text, text) to authenticated;

create or replace function public.fl_create5(p_device uuid, p_secret text, p_name text, p_hours int, p_rerolls int, p_ratings text, p_era text) returns json
language plpgsql security definer set search_path = public as $$
declare pid uuid; acc uuid; nm text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g')); code text; k int := 0;
begin
  if auth.uid() is null then raise exception 'login?' using errcode = '28000'; end if;
  pid := public.device_check(p_device, p_secret);
  acc := public.player_for_auth(auth.uid());
  if acc is null or acc <> pid then raise exception 'login?' using errcode = '28000'; end if;
  if char_length(nm) not between 2 and 40 or p_hours not in (1, 3, 24) or p_rerolls not in (0, 1, 3) or p_ratings not in ('show', 'memory')
     or p_era not in ('all', 'd1990', 'd2000', 'd2010', 'd2020', 'y2000', 'y2010', 'y2015') then
    raise exception 'fl_bad' using errcode = '22023';
  end if;
  if (select count(*) from fl_leagues where owner = pid and created_at > now() - interval '1 day') >= 20 then
    raise exception 'fl_many' using errcode = '22023';
  end if;
  loop
    code := (select string_agg(substr('abcdefghjkmnpqrstuvwxyz23456789', 1 + floor(random() * 31)::int, 1), '') from generate_series(1, 6));
    exit when not exists (select 1 from fl_leagues where id = code);
    k := k + 1; if k > 20 then raise exception 'fl_code'; end if;
  end loop;
  -- days/tries/take/scoring do not apply to 5x5; just fill the required columns
  insert into fl_leagues (id, owner, name, fmt, start_day, days, tries, take, scoring, rerolls, ratings, era, deadline)
    values (code, pid, nm, '5', public.fl_today(), 1, 1, 'best', 'place', p_rerolls, p_ratings, p_era, now() + make_interval(hours => p_hours));
  insert into fl_members (league_id, player_id) values (code, pid);
  return public.fl_get(code);
end $$;
revoke execute on function public.fl_create5(uuid, text, text, int, int, text, text) from public, anon;
grant execute on function public.fl_create5(uuid, text, text, int, int, text, text) to authenticated;
