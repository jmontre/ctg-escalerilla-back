-- Doble confirmación de resultados en el Master (mismo patrón que challenges)
ALTER TABLE "master_matches" ADD COLUMN IF NOT EXISTS "player1_result" JSONB;
ALTER TABLE "master_matches" ADD COLUMN IF NOT EXISTS "player2_result" JSONB;
