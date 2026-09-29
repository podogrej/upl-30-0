-- 0.48: публічне сховище для карток сезону (кнопка «Поділитися карткою» в Telegram)
-- Виконувати в обох базах: спершу тестовій (upl-30-0-test), потім основній. Повторний запуск безпечний.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cards', 'cards', true, 2097152, array['image/jpeg','image/png'])
on conflict (id) do nothing;
