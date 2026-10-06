-- v0.48: public storage bucket for season cards (Telegram card sharing)
-- Run on both DBs: test (upl-30-0-test) first, then main. Idempotent.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 2097152, array['image/jpeg','image/png'])
on conflict (id) do nothing;
