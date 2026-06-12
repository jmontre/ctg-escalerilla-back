-- Índices de consulta (espejo de los @@index del schema)
CREATE INDEX IF NOT EXISTS "challenges_status_idx" ON "challenges"("status");
CREATE INDEX IF NOT EXISTS "challenges_challenger_id_idx" ON "challenges"("challenger_id");
CREATE INDEX IF NOT EXISTS "challenges_challenged_id_idx" ON "challenges"("challenged_id");
CREATE INDEX IF NOT EXISTS "reservations_date_idx" ON "reservations"("date");
CREATE INDEX IF NOT EXISTS "reservations_player_id_status_idx" ON "reservations"("player_id", "status");
CREATE INDEX IF NOT EXISTS "reservations_challenge_id_idx" ON "reservations"("challenge_id");
CREATE INDEX IF NOT EXISTS "ranking_history_player_id_idx" ON "ranking_history"("player_id");

-- Anti doble-booking: única reserva activa por cancha/fecha/horario.
-- NO representable en schema.prisma (índice parcial) — excepción documentada en CLAUDE.md.
-- PRE-DEPLOY: verificar que no existan duplicados activos o este CREATE falla:
--   SELECT court_id, date, time_slot, COUNT(*) FROM reservations
--   WHERE status = 'active' GROUP BY 1,2,3 HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_active_slot_uniq"
  ON "reservations"("court_id", "date", "time_slot")
  WHERE "status" = 'active';
