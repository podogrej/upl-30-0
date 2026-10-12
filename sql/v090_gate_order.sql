-- 0.90 (review 12.10): api_gate counts the device limit only after the device secret is checked.
-- Before: the device counter was incremented before the secret check, so anyone who knew a device_id could send requests with a wrong
-- secret and push the real device into 429 (up to the per-minute limit). Now: IP counter -> secret check -> device counter (only if the secret is OK
-- or no secret is sent). The IP counter still runs first, so guessing secrets stays limited per IP. Same arguments, same answer shape
-- {"rate": bool, "player": uuid|null, "err": null|"secret"|"device"}; the only visible change: a wrong secret answers err = 'secret' even when the
-- device counter is full (and does not count against the device). create or replace: safe to run repeatedly, the deployed site keeps working.
create or replace function public.api_gate(p_name text, p_ip text, p_device uuid, p_secret text, p_limit int, p_ip_limit int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if not public.rate_hit(p_name || ':ip:' || coalesce(p_ip, 'unknown'), p_ip_limit) then
    return jsonb_build_object('rate', false, 'player', null, 'err', null);
  end if;
  if p_secret is not null and p_device is not null then
    begin
      pid := public.device_check(p_device, p_secret);
    exception
      when sqlstate '28000' then return jsonb_build_object('rate', true, 'player', null, 'err', 'secret');
      when sqlstate '22023' then return jsonb_build_object('rate', true, 'player', null, 'err', 'device');
    end;
  end if;
  if p_device is not null and not public.rate_hit(p_name || ':d:' || lower(p_device::text), p_limit) then
    return jsonb_build_object('rate', false, 'player', null, 'err', null);
  end if;
  return jsonb_build_object('rate', true, 'player', pid, 'err', null);
end $$;
revoke execute on function public.api_gate(text, text, uuid, text, int, int) from public, anon, authenticated;
grant execute on function public.api_gate(text, text, uuid, text, int, int) to service_role;
