-- FK faltante: master_matches.season_id → master_seasons.id
-- Idempotente: no falla si ya existe.
DO $$ BEGIN
  ALTER TABLE "master_matches" ADD CONSTRAINT "master_matches_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "master_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
