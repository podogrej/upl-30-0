-- 0.89: daily challenge attempts are limited per player (all his devices), not per device. Additive only and idempotent.
-- The server (api/_vd.js) reads the player's devices from player_links and counts attempts across them; this file adds the
-- owner of an attempt seed and a unique key that stops two devices of one player from taking the same attempt number at once.
-- Rows without player_id (issued before 0.89) are not covered by the key; the server counts them through their device.
alter table public.season_seeds add column if not exists player_id uuid;
create unique index if not exists season_seeds_vd_player_uq on public.season_seeds (player_id, vd_day, vd_attempt)
  where vd_day is not null and player_id is not null;
