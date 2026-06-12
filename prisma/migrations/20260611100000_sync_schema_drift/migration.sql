-- Sincroniza el historial de migraciones con el estado real de la DB
-- (objetos creados históricamente con `prisma db push` / SQL manual).
-- Idempotente: en prod/staging cada statement es un no-op.

-- ── users ─────────────────────────────────────────────────────────────────────
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "admin_role" TEXT;

-- ── players ───────────────────────────────────────────────────────────────────
-- El init creó position como NOT NULL UNIQUE; el modelo actual es nullable sin unique.
ALTER TABLE "players" ALTER COLUMN "position" DROP NOT NULL;
DROP INDEX IF EXISTS "players_position_key";

ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "member_type" TEXT NOT NULL DEFAULT 'socio';
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "parent_id" TEXT;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "has_debt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "extra_high_demand_slots" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "school_names" TEXT[] DEFAULT ARRAY[]::TEXT[];

DO $$ BEGIN
  ALTER TABLE "players" ADD CONSTRAINT "players_parent_id_fkey"
    FOREIGN KEY ("parent_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── master_seasons ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "master_seasons" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "round_robin_start" TIMESTAMP(3),
    "round_robin_end" TIMESTAMP(3),
    "final_date" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_seasons_pkey" PRIMARY KEY ("id")
);

-- ── master_groups ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "master_groups" (
    "id" TEXT NOT NULL,
    "season_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_groups_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "master_groups" ADD CONSTRAINT "master_groups_season_id_fkey"
    FOREIGN KEY ("season_id") REFERENCES "master_seasons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── master_group_players ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "master_group_players" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "losses" INTEGER NOT NULL DEFAULT 0,
    "sets_won" INTEGER NOT NULL DEFAULT 0,
    "sets_lost" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_group_players_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "master_group_players_group_id_player_id_key"
  ON "master_group_players"("group_id", "player_id");

DO $$ BEGIN
  ALTER TABLE "master_group_players" ADD CONSTRAINT "master_group_players_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "master_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "master_group_players" ADD CONSTRAINT "master_group_players_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── master_matches ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "master_matches" (
    "id" TEXT NOT NULL,
    "group_id" TEXT,
    "season_id" TEXT NOT NULL,
    "round" TEXT NOT NULL,
    "player1_id" TEXT NOT NULL,
    "player2_id" TEXT NOT NULL,
    "winner_id" TEXT,
    "score" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "scheduled_date" TIMESTAMP(3),
    "played_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "master_matches_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "master_matches" ADD CONSTRAINT "master_matches_group_id_fkey"
    FOREIGN KEY ("group_id") REFERENCES "master_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "master_matches" ADD CONSTRAINT "master_matches_player1_id_fkey"
    FOREIGN KEY ("player1_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "master_matches" ADD CONSTRAINT "master_matches_player2_id_fkey"
    FOREIGN KEY ("player2_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "master_matches" ADD CONSTRAINT "master_matches_winner_id_fkey"
    FOREIGN KEY ("winner_id") REFERENCES "players"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── courts ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "courts" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "courts_pkey" PRIMARY KEY ("id")
);

-- ── reservations ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "reservations" (
    "id" TEXT NOT NULL,
    "player_id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time_slot" TEXT NOT NULL,
    "is_high_demand" BOOLEAN NOT NULL DEFAULT false,
    "has_guest" BOOLEAN NOT NULL DEFAULT false,
    "guest_name" TEXT,
    "guest_paid" BOOLEAN NOT NULL DEFAULT false,
    "guest_fee" INTEGER NOT NULL DEFAULT 0,
    "partner_name" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "cancelled_at" TIMESTAMP(3),
    "cancel_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_challenge" BOOLEAN NOT NULL DEFAULT false,
    "challenge_id" TEXT,
    "school_name" TEXT,
    CONSTRAINT "reservations_pkey" PRIMARY KEY ("id")
);

-- Por si la tabla ya existía sin las columnas más nuevas (drift incremental)
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "partner_name" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "is_challenge" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "challenge_id" TEXT;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "school_name" TEXT;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_player_id_fkey"
    FOREIGN KEY ("player_id") REFERENCES "players"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_court_id_fkey"
    FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── system_config ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "system_config_key_key" ON "system_config"("key");

-- ── court_blocks ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "court_blocks" (
    "id" TEXT NOT NULL,
    "court_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "time_slot" TEXT,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "court_blocks_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "court_blocks" ADD CONSTRAINT "court_blocks_court_id_fkey"
    FOREIGN KEY ("court_id") REFERENCES "courts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
