-- Vínculo reserva ↔ partido de Master (espejo de is_challenge/challenge_id)
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "is_master" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "master_match_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_master_match_id_fkey"
    FOREIGN KEY ("master_match_id") REFERENCES "master_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
