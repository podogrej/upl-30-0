-- 30-0 УПЛ · v0.55 · резервні копії бази й обмеження частоти запитів
-- Запускати: спершу тестова база (upl-30-0-test), потім основна. Supabase → SQL Editor → вставити цілком → Run.
-- Повторний запуск нічого не ламає. Сайт 0.54, ще відкритий у гравців, працює як раніше (тут лише нове).
--
-- Що тут:
--  1. Приватне сховище «backups» — сюди щоночі кладе файл YYYY-MM-DD.json.gz сервер (api/backup.js, Vercel Cron).
--     Жодних політик для anon/authenticated: прочитати чи побачити список файлів може лише сервер (service_role)
--     і власник у панелі Supabase (Storage → backups → файл → Download).
--  2. rate_hits + rate_hit(p_key, p_limit) — лічильник запитів за хвилину для /api/seed, /api/save, /api/verify, /api/card, /api/auth.
--     Викликати може лише сервер (service_role). Старі хвилини прибирає сама функція (рядки старші за 10 хвилин).

-- 1. приватне сховище для резервних копій (ліміт файлу 50 МБ — максимум безкоштовного тарифу Supabase)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('backups', 'backups', false, 52428800, array['application/gzip'])
on conflict (id) do update set public = false;

-- 2. обмеження частоти: один рядок на (ключ, хвилину). Ключ — «seed:d:<device_id>», «verify:ip:<адреса>» тощо
create table if not exists public.rate_hits (
  key text not null,
  minute timestamptz not null,
  n int not null default 0,
  primary key (key, minute)
);
alter table public.rate_hits enable row level security;   -- політик немає: anon/authenticated не читають і не пишуть
revoke all on public.rate_hits from anon, authenticated;

-- +1 до лічильника цієї хвилини; true — ще в межах ліміту, false — забагато (сервер відповідає 429)
create or replace function public.rate_hit(p_key text, p_limit int) returns boolean language plpgsql security definer set search_path = public as $$
declare c int;
begin
  if p_key is null or length(p_key) > 120 or p_limit is null then return true; end if;
  insert into rate_hits as h (key, minute, n) values (p_key, date_trunc('minute', now()), 1)
    on conflict (key, minute) do update set n = h.n + 1
    returning h.n into c;
  if random() < 0.02 then delete from rate_hits where minute < now() - interval '10 minutes'; end if;
  return c <= p_limit;
end $$;
revoke execute on function public.rate_hit(text, int) from public, anon, authenticated;
grant execute on function public.rate_hit(text, int) to service_role;
