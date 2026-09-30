# Восстановление из резервной копии — план (делает Claude)

Копии кладёт `api/backup.js` (Vercel Cron, раз в сутки) в приватное хранилище Supabase `backups`: `ГГГГ-ММ-ДД.json.gz`.
Формат: gzip → JSON `{made, source, day, tables: {имя_таблицы: [строки…]}, counts: {имя_таблицы: число | null}}`. `null` — таблицы не было в базе. `season_seeds` — только за последние 30 дней.

## Что делает владелец
1. Пишет Claude, что случилось и на какую дату нужна копия.
2. Скачивает файл: supabase.com → основной проект → **Storage** → **backups** → файл → **Download** — и прикрепляет в чат (или Claude берёт его сам, если ему дали доступ только на чтение к хранилищу — ключ не пересылать).

## Что делает Claude
1. Сначала — **никогда не в основную базу**: поднимает базу с нуля в тестовой (`upl-30-0-test`) или в локальном Postgres (`tools/tests/setup.sh`, `KEEP=1`), схема — `new_db_part_A.sql` + `v039_part_B.sql` + все SQL после 0.39.
2. Пишет одноразовый скрипт: читает файл, по таблицам делает `insert … on conflict do nothing` (или `upsert` по первичному ключу) в порядке зависимостей:
   `players` → `player_links` → `app_marks` → `seasons` → `daily_results` → `trophies` → `challenges` → `challenge_results` → `leagues` → `league_members` → `league_results` → `league_boards` → `season_seeds` → `user_state` → `f5_rooms` → `f5_players` → `f5_picks`.
   Колонки `generated always` (`seasons.id`, `daily_results.id`, `seasons.gd`) — через `overriding system value` или без колонки; после вставки — `setval` для последовательностей. Триггеры `player_id` на время вставки отключить (`session_replication_role = replica`), чтобы не переписали игроков.
   `user_state.user_id` ссылается на `auth.users` — строки без пользователя пропускаются (аккаунты Supabase Auth копия не содержит).
3. Сверяет `counts` с числом строк и показывает владельцу страницы игры на тестовом сайте.
4. Для основной базы: частичное восстановление (например, одной таблицы или одного игрока) — отдельным SQL-файлом, который владелец запускает сам по правилам CLAUDE.md; полная замена — только по решению владельца.
