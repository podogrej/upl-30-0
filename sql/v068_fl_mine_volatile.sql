-- 0.68: fl_mine was declared stable, so PostgREST
-- runs it in a read-only transaction, while device_check inside does SELECT ... FOR UPDATE / INSERT ->
-- "cannot execute SELECT FOR UPDATE in a read-only transaction". The client caught the error and showed an empty league list
-- (player page and friend leagues). Fix: volatile, like every RPC that calls device_check.
-- Idempotent; safe for the previous client (same body and parameters).
alter function public.fl_mine(uuid, text) volatile;
