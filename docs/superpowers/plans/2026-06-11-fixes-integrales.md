# Fixes Integrales Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar el spec `docs/superpowers/specs/2026-06-11-fixes-integrales-design.md`: reparar el pipeline de migraciones y el Master, asegurar los endpoints, dar integridad transaccional a los datos y limpiar código muerto.

**Architecture:** Las migraciones nuevas son idempotentes (seguras sobre la DB prod con drift y sobre DBs vírgenes). La seguridad se implementa con dos guards globales (`APP_GUARD`) + decoradores `@Public()`/`@Admin()`, sin tocar la verificación manual existente en controllers. Las operaciones multi-paso pasan a `prisma.$transaction`. Las notificaciones salen del camino de la request con un helper fire-and-forget.

**Tech Stack:** NestJS 11, Prisma 5, PostgreSQL (Supabase), Jest 30, class-validator/class-transformer (nuevos).

**Reglas de contexto del repo:**
- Branch de trabajo: `dev`. NO tocar `main`.
- Commits SIN trailer de Claude (preferencia del usuario).
- `npm run build` tolera errores TS (`--noEmitOnError false`); para verificar de verdad usar `npx tsc -p tsconfig.build.json --noEmit`.
- Los tests corren con `npx jest <ruta>`.
- No se puede correr `prisma migrate dev` localmente (no hay `DIRECT_URL` en `.env.dev` y la DB es Supabase staging): las migraciones se escriben A MANO y se validan con docker si está disponible.

---

## Task 1: Schema Prisma — campos del Master e índices

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Agregar campos de resultado a MasterMatch**

En el modelo `MasterMatch`, después de la línea `score          String?`:

```prisma
  score          String?
  player1_result Json?
  player2_result Json?
```

- [ ] **Step 2: Agregar índices de consulta**

En el modelo `Challenge`, antes de `@@map("challenges")`:

```prisma
  @@index([status])
  @@index([challenger_id])
  @@index([challenged_id])
  @@map("challenges")
```

En el modelo `Reservation`, antes de `@@map("reservations")`:

```prisma
  @@index([date])
  @@index([player_id, status])
  @@index([challenge_id])
  @@map("reservations")
```

En el modelo `RankingHistory`, antes de `@@map("ranking_history")`:

```prisma
  @@index([player_id])
  @@map("ranking_history")
```

- [ ] **Step 3: Validar y regenerar el client**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` y `Generated Prisma Client`.

- [ ] **Step 4: Verificar que los tipos nuevos existen**

Run: `grep -c "player1_result" node_modules/.prisma/client/index.d.ts`
Expected: número > 0.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat: campos de resultado en master_matches e índices de consulta en schema"
```

---

## Task 2: Migración idempotente `sync_schema_drift`

Esta migración registra en el historial de Prisma todo lo que fue creado con `db push`/SQL manual. En prod/staging cada statement es no-op (guardas `IF NOT EXISTS` / `DO` blocks); en una DB virgen construye el estado real.

**Files:**
- Create: `prisma/migrations/20260611100000_sync_schema_drift/migration.sql`

- [ ] **Step 1: Crear el archivo con este contenido EXACTO**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add prisma/migrations/20260611100000_sync_schema_drift
git commit -m "feat: migración idempotente que sincroniza el drift del schema"
```

---

## Task 3: Migraciones `add_master_match_results` y `add_performance_indexes` + verificación

**Files:**
- Create: `prisma/migrations/20260611100001_add_master_match_results/migration.sql`
- Create: `prisma/migrations/20260611100002_add_performance_indexes/migration.sql`

- [ ] **Step 1: Crear `20260611100001_add_master_match_results/migration.sql`**

```sql
-- Doble confirmación de resultados en el Master (mismo patrón que challenges)
ALTER TABLE "master_matches" ADD COLUMN IF NOT EXISTS "player1_result" JSONB;
ALTER TABLE "master_matches" ADD COLUMN IF NOT EXISTS "player2_result" JSONB;
```

- [ ] **Step 2: Crear `20260611100002_add_performance_indexes/migration.sql`**

Los nombres coinciden con los defaults de Prisma para los `@@index` agregados en Task 1. El índice parcial final NO está en el schema (Prisma no soporta índices parciales) — es la protección anti doble-booking.

```sql
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
CREATE UNIQUE INDEX IF NOT EXISTS "reservations_active_slot_uniq"
  ON "reservations"("court_id", "date", "time_slot")
  WHERE "status" = 'active';
```

- [ ] **Step 3: Verificación con Postgres efímero (solo si docker está disponible)**

Run: `docker -v` — si no hay docker, saltar a Step 4.

```bash
docker run -d --name ctg-mig-test -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16
sleep 5
DATABASE_URL="postgresql://postgres:test@localhost:55432/postgres" \
DIRECT_URL="postgresql://postgres:test@localhost:55432/postgres" \
npx prisma migrate deploy
```

Expected: `10 migrations found`, todas aplicadas sin error.

```bash
DATABASE_URL="postgresql://postgres:test@localhost:55432/postgres" \
npx prisma migrate diff \
  --from-url "postgresql://postgres:test@localhost:55432/postgres" \
  --to-schema-datamodel prisma/schema.prisma --script
docker rm -f ctg-mig-test
```

Expected: el diff SOLO debe contener `DROP INDEX "reservations_active_slot_uniq"` (el índice parcial deliberadamente fuera del schema). Cualquier otro statement = la migración de drift está incompleta → corregirla antes de seguir.

- [ ] **Step 4: Commit**

```bash
git add prisma/migrations/20260611100001_add_master_match_results prisma/migrations/20260611100002_add_performance_indexes
git commit -m "feat: migraciones de resultados del master e índices (incl. anti doble-booking)"
```

---

## Task 4: Eliminar configs de deploy conflictivos y código muerto

**Files:**
- Delete: `railway.json`, `nixpacks.toml`, `Procfile`
- Delete: `src/auth/wordpress-auth.service.ts`, `src/auth/wordpress-auth.guard.ts`, `src/auth/wp-user.decorator.ts`
- Delete: directorio `node_modules 2/` (vacío, no versionado)

- [ ] **Step 1: Verificar que nada importa los archivos de WordPress**

Run: `grep -rn "wordpress-auth\|wp-user" src --include="*.ts" | grep -v "src/auth/wordpress-auth\|src/auth/wp-user"`
Expected: sin resultados.

- [ ] **Step 2: Eliminar archivos**

```bash
git rm railway.json nixpacks.toml Procfile
git rm src/auth/wordpress-auth.service.ts src/auth/wordpress-auth.guard.ts src/auth/wp-user.decorator.ts
rm -rf "node_modules 2"
```

- [ ] **Step 3: Verificar build**

Run: `npm run build`
Expected: compila y existe `dist/main.js`.

- [ ] **Step 4: Commit**

```bash
git commit -m "fix: restaurar migrate deploy eliminando configs que anulaban el CMD del Dockerfile

railway.json definía startCommand npm run start:prod, que Railway usa
por sobre el CMD del Dockerfile — por eso las migraciones no se
aplicaban desde marzo. Se elimina también nixpacks/Procfile y el código
muerto de auth WordPress."
```

---

## Task 5: Regenerar tipos y eliminar casts `as any` de Prisma

El client regenerado en Task 1 ya tiene todos los modelos/campos tipados. Eliminar los casts.

**Files:**
- Modify: `src/challenges/challenges.service.ts`
- Modify: `src/reservations/reservations.service.ts`
- Modify: `src/master/master.service.ts`
- Modify: `src/cron/challenges-cron.service.ts`

- [ ] **Step 1: challenges.service.ts**

Reemplazar TODAS las ocurrencias de `(this.prisma as any).reservation` por `this.prisma.reservation` (hay 5: `slotBusy`, `otherActive`, `updateMany` de reprogramación, `create` de reserva, `count` de cupos, y el `updateMany` de liberación en `processDoubleConfirmation`).

Además en `scheduleMatch`:
- `(player.children?.map((c:any) => c.id) || [])` → `(player.children?.map(c => c.id) || [])`
- `const extraSlots  = (player as any).extra_high_demand_slots ?? 0;` → `const extraSlots  = player.extra_high_demand_slots ?? 0;`

- [ ] **Step 2: reservations.service.ts**

- `(this.prisma as any).courtBlock` → `this.prisma.courtBlock` (4 ocurrencias: `getAvailability`, `getBlocks`, `setBlocks` ×2 —`deleteMany`/`createMany`—, `deleteBlock`).
- En `getAvailability`: `(existing as any).school_name` → `existing.school_name`, `(existing as any).partner_name` → `existing.partner_name`, `(existing as any).is_challenge` → `existing.is_challenge`, y `blocks.find((b: any) =>` → `blocks.find(b =>`.
- En `create`: `(player as any).member_type` → `player.member_type`.
- En `cancel`: `(reservation as any).challenge_id` → `reservation.challenge_id`, `(reservation as any).is_challenge` → `reservation.is_challenge`, `(reservation as any).is_high_demand` → `reservation.is_high_demand`.
- En `modify`: `(oldReservation as any).is_challenge` → `oldReservation.is_challenge`, `(player as any).member_type` → `player.member_type`.
- En `adminCancel`: `(reservation as any).challenge_id` → `reservation.challenge_id`, `(reservation as any).is_challenge` → `reservation.is_challenge`.
- En `getWeeklyUsageForPlayer` y `checkHighDemandLimit`: `(player as any).extra_high_demand_slots` → `player.extra_high_demand_slots` (el parámetro `player: any` puede quedar, no bloquea).

- [ ] **Step 3: master.service.ts**

- En `scheduleMatch`: `data: { scheduled_date: scheduledDate } as any` → `data: { scheduled_date: scheduledDate }`.
- En `submitPlayerResult`:
  - `data: updateData as any` → `data: updateData`.
  - `}) as any;` (fetch de `updated`) → `});` y donde se leen los resultados:

```ts
    const hasP1 = updated.player1_result !== null;
    const hasP2 = updated.player2_result !== null;
```

  (sin cambios de lógica; ahora compila tipado) y:

```ts
    const r1 = updated.player1_result as { winnerId: string; score: string };
    const r2 = updated.player2_result as { winnerId: string; score: string };
```

  - `data: { status: 'disputed' } as any` → `data: { status: 'disputed' }`.
  - Nota: `updated` puede ser null para el type-checker; tras el fetch agregar `if (!updated) throw new NotFoundException('Partido no encontrado');`.

- [ ] **Step 4: challenges-cron.service.ts**

- `(this.prisma.reservation as any).findMany` → `this.prisma.reservation.findMany`
- `(this.prisma.reservation as any).update` → `this.prisma.reservation.update`
- `(challenge as any).first_result_at` → `challenge.first_result_at`

- [ ] **Step 5: Verificar con el compilador estricto**

Run: `npx tsc -p tsconfig.build.json --noEmit`
Expected: exit 0 sin errores. Si aparecen errores en estos 4 archivos, corregirlos (NO agregar `as any` de vuelta). Errores en archivos NO tocados por esta task: anotarlos y continuar (quedan para fase 2).

- [ ] **Step 6: Correr tests existentes**

Run: `npx jest`
Expected: PASS (2 suites: app.controller, dates).

- [ ] **Step 7: Commit**

```bash
git add src/challenges/challenges.service.ts src/reservations/reservations.service.ts src/master/master.service.ts src/cron/challenges-cron.service.ts
git commit -m "refactor: eliminar casts as any de Prisma tras regenerar el client"
```

---

## Task 6: JWT_SECRET fail-fast centralizado

Hoy 4 módulos hacen `JwtModule.register({ secret: process.env.JWT_SECRET || 'ctg-secret-key-change-in-production' })`. Como `process.env` se evalúa en import-time (antes de que ConfigModule cargue `.env.dev`), en desarrollo SIEMPRE se usa el fallback inseguro.

**Files:**
- Create: `src/auth/jwt.config.ts`
- Modify: `src/auth/auth.module.ts`, `src/reservations/reservations.module.ts`, `src/players/players.module.ts`, `src/master/master.module.ts`

- [ ] **Step 1: Crear `src/auth/jwt.config.ts`**

```ts
import { ConfigService } from '@nestjs/config';
import { JwtModuleAsyncOptions } from '@nestjs/jwt';

/**
 * Configuración compartida de JWT. Falla al arrancar si JWT_SECRET no está
 * definido (antes existía un fallback hardcodeado inseguro).
 */
export const jwtModuleOptions: JwtModuleAsyncOptions = {
  inject: [ConfigService],
  useFactory: (config: ConfigService) => {
    const secret = config.get<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET no está definido. Configúralo en .env.dev / .env.production / variables de Railway.',
      );
    }
    return { secret, signOptions: { expiresIn: '7d' } };
  },
};
```

- [ ] **Step 2: Reemplazar en los 4 módulos**

En cada uno de `auth.module.ts`, `reservations.module.ts`, `players.module.ts`, `master.module.ts`, reemplazar el bloque:

```ts
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'ctg-secret-key-change-in-production',
      signOptions: { expiresIn: '7d' },
    }),
```

por:

```ts
    JwtModule.registerAsync(jwtModuleOptions),
```

agregando el import `import { jwtModuleOptions } from '../auth/jwt.config';` (en `auth.module.ts`: `'./jwt.config'`). Verificar primero el texto exacto de cada módulo con `grep -n "JWT_SECRET" src/**/*.module.ts` — si algún módulo usa otro fallback textual, aplicar el mismo reemplazo.

- [ ] **Step 3: Verificar build y arranque**

Run: `npx tsc -p tsconfig.build.json --noEmit && npm run build`
Expected: sin errores.

Run: `JWT_SECRET= timeout 20 npm run start:prod 2>&1 | head -20 || true` — con la var vacía y NODE_ENV sin setear carga `.env.dev`; para forzar el fail-fast: `NODE_ENV=production JWT_SECRET= timeout 20 node dist/main.js 2>&1 | head -5 || true`
Expected: error `JWT_SECRET no está definido` (no llega a levantar el server).

- [ ] **Step 4: Commit**

```bash
git add src/auth/jwt.config.ts src/auth/auth.module.ts src/reservations/reservations.module.ts src/players/players.module.ts src/master/master.module.ts
git commit -m "fix: JWT_SECRET obligatorio y centralizado, sin fallback inseguro"
```

---

## Task 7: Guards globales JWT + Admin (TDD)

**Files:**
- Create: `src/auth/public.decorator.ts`
- Create: `src/auth/admin.decorator.ts`
- Create: `src/auth/jwt-auth.guard.ts`
- Create: `src/auth/admin.guard.ts`
- Test: `src/auth/guards.spec.ts`
- Modify: `src/auth/auth.module.ts`, `src/auth/auth.controller.ts`
- Modify: `src/players/admin-players.controller.ts`, `src/challenges/admin-challenges.controller.ts`, `src/cron/cron.controller.ts`, `src/test/test.controller.ts`, `src/reservations/reservations.controller.ts`, `src/master/master.controller.ts`

- [ ] **Step 1: Escribir el test que falla — `src/auth/guards.spec.ts`**

```ts
import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';

function mockContext(headers: Record<string, string> = {}, user?: unknown): ExecutionContext {
  const request: any = { headers, user };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
    __request: request,
  } as unknown as ExecutionContext;
}

function reflectorReturning(value: boolean): Reflector {
  return { getAllAndOverride: jest.fn().mockReturnValue(value) } as unknown as Reflector;
}

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });

  it('deja pasar rutas @Public() sin token', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(true));
    expect(guard.canActivate(mockContext())).toBe(true);
  });

  it('rechaza sin header Authorization', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    expect(() => guard.canActivate(mockContext())).toThrow(UnauthorizedException);
  });

  it('rechaza token inválido', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    expect(() => guard.canActivate(mockContext({ authorization: 'Bearer basura' }))).toThrow(UnauthorizedException);
  });

  it('acepta token válido y adjunta el payload a request.user', () => {
    const guard = new JwtAuthGuard(jwtService, reflectorReturning(false));
    const token = jwtService.sign({ sub: 'u1', is_admin: false, admin_role: null });
    const ctx = mockContext({ authorization: `Bearer ${token}` });
    expect(guard.canActivate(ctx)).toBe(true);
    expect((ctx as any).__request.user.sub).toBe('u1');
  });
});

describe('AdminGuard', () => {
  it('deja pasar rutas sin @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(false));
    expect(guard.canActivate(mockContext({}, { sub: 'u1', is_admin: false }))).toBe(true);
  });

  it('rechaza no-admin en ruta @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(() => guard.canActivate(mockContext({}, { sub: 'u1', is_admin: false }))).toThrow(ForbiddenException);
  });

  it('rechaza si no hay user (ruta @Admin() y @Public() a la vez)', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(() => guard.canActivate(mockContext())).toThrow(ForbiddenException);
  });

  it('acepta admin en ruta @Admin()', () => {
    const guard = new AdminGuard(reflectorReturning(true));
    expect(guard.canActivate(mockContext({}, { sub: 'u1', is_admin: true }))).toBe(true);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/auth/guards.spec.ts`
Expected: FAIL — `Cannot find module './jwt-auth.guard'`.

- [ ] **Step 3: Crear decoradores y guards**

`src/auth/public.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
/** Marca una ruta como accesible sin JWT. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

`src/auth/admin.decorator.ts`:

```ts
import { SetMetadata } from '@nestjs/common';

export const IS_ADMIN_KEY = 'requiresAdmin';
/** Exige is_admin: true en el payload del JWT. */
export const Admin = () => SetMetadata(IS_ADMIN_KEY, true);
```

`src/auth/jwt-auth.guard.ts`:

```ts
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC_KEY } from './public.decorator';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const auth: string | undefined = request.headers?.authorization;
    if (!auth?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Token no proporcionado');
    }
    try {
      request.user = this.jwtService.verify(auth.slice(7));
      return true;
    } catch {
      throw new UnauthorizedException('Token inválido o expirado');
    }
  }
}
```

`src/auth/admin.guard.ts`:

```ts
import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { IS_ADMIN_KEY } from './admin.decorator';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiresAdmin = this.reflector.getAllAndOverride<boolean>(IS_ADMIN_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiresAdmin) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user?.is_admin) {
      throw new ForbiddenException('Requiere permisos de administrador');
    }
    return true;
  }
}
```

- [ ] **Step 4: Verificar que los tests pasan**

Run: `npx jest src/auth/guards.spec.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Registrar guards globales en AuthModule**

En `src/auth/auth.module.ts` (el orden del array define el orden de ejecución — JWT primero):

```ts
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { jwtModuleOptions } from './jwt.config';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, JwtModule.registerAsync(jwtModuleOptions)],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: AdminGuard },
  ],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 6: Marcar rutas públicas en `auth.controller.ts`**

Importar `import { Public } from './public.decorator';` y anteponer `@Public()` a los handlers de: `POST register`, `POST login`, `POST forgot-password`, `POST reset-password`. `GET /auth/me` queda protegido (ya exige token).

- [ ] **Step 7: Marcar rutas admin**

Importar `import { Admin } from '../auth/admin.decorator';` (ajustar path relativo) y aplicar:

- `@Admin()` a NIVEL DE CLASE en: `AdminPlayersController`, `AdminChallengesController`, `CronController`, `TestController` (en `TestController` el import es `'../auth/admin.decorator'`).
- `@Admin()` por handler en `ReservationsController`: `getBlocks`, `setBlocks`, `deleteBlock`, `setSeason` (POST season), `getStats`, `setLightConfig` (POST light-config), `getLightSummary`, `getAllReservations` (GET /), `getPlayerReservations` (GET player/:playerId), `adminCancel` (DELETE :id/admin). Quedan SIN `@Admin()` (solo JWT): `getCourts`, `getAvailability`, `getSeason`, `getLightConfig`, `getMyReservations`, `create`, `modify`, `cancel`.
- `@Admin()` por handler en `MasterController`: `generate` (POST generate), `submitResult` (POST matches/:id/result), `checkFinal` (POST :seasonId/check-final), `deleteSeason` (DELETE :id). Quedan solo-JWT: `findAll`, `findByCategory`, `scheduleMatch`, `submitPlayerResult`.

- [ ] **Step 8: Verificación completa**

Run: `npx tsc -p tsconfig.build.json --noEmit && npx jest`
Expected: compila sin errores, todos los tests PASS.

Smoke test manual (levantar `npm run start:dev` en background, esperar el arranque):

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/players            # esperado: 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/cron/run   # esperado: 401
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/auth/login -H 'Content-Type: application/json' -d '{"username":"x","password":"y"}'  # esperado: 401 (credenciales, no guard) — cualquier cosa distinta de 403/404 confirma que pasó el guard
```

Matar el server al terminar.

- [ ] **Step 9: Commit**

```bash
git add src/auth src/players/admin-players.controller.ts src/challenges/admin-challenges.controller.ts src/cron/cron.controller.ts src/test/test.controller.ts src/reservations/reservations.controller.ts src/master/master.controller.ts
git commit -m "feat: guards globales JWT y Admin — cierra endpoints admin/cron/test expuestos"
```

---

## Task 8: ValidationPipe global + DTOs validados (TDD)

**Files:**
- Modify: `package.json` (deps nuevas), `src/main.ts`
- Modify: `src/auth/dto/login.dto.ts`, `src/auth/dto/register.dto.ts`
- Create: `src/reservations/dto/create-reservation.dto.ts`
- Create: `src/players/dto/admin-player.dto.ts`
- Test: `src/auth/dto/dto-validation.spec.ts`
- Modify: `src/reservations/reservations.controller.ts`, `src/players/admin-players.controller.ts`

- [ ] **Step 1: Instalar dependencias**

Run: `npm install class-validator class-transformer`
Expected: agregadas a `dependencies` sin errores.

- [ ] **Step 2: Test que falla — `src/auth/dto/dto-validation.spec.ts`**

```ts
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('DTOs de auth', () => {
  it('LoginDto rechaza payload sin password', async () => {
    const dto = plainToInstance(LoginDto, { username: 'javier' });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'password')).toBe(true);
  });

  it('LoginDto acepta payload completo', async () => {
    const dto = plainToInstance(LoginDto, { username: 'javier', password: 'secreto' });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('RegisterDto rechaza email inválido y password corta', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'nuevo', email: 'no-es-email', password: '123', name: 'Nuevo',
    });
    const errors = await validate(dto);
    expect(errors.some(e => e.property === 'email')).toBe(true);
    expect(errors.some(e => e.property === 'password')).toBe(true);
  });
});
```

- [ ] **Step 3: Verificar que falla**

Run: `npx jest src/auth/dto/dto-validation.spec.ts`
Expected: FAIL (los DTOs no tienen decoradores → validate no encuentra errores).

- [ ] **Step 4: Decorar DTOs de auth**

`src/auth/dto/login.dto.ts`:

```ts
import { IsNotEmpty, IsString } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}
```

`src/auth/dto/register.dto.ts`:

```ts
import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
```

- [ ] **Step 5: Verificar que pasa**

Run: `npx jest src/auth/dto/dto-validation.spec.ts`
Expected: PASS.

- [ ] **Step 6: Pipe global en `main.ts`**

Después de crear la app (`const app = await NestFactory.create(...)`):

```ts
import { ValidationPipe } from '@nestjs/common';
// ...
app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
```

- [ ] **Step 7: DTO de reservas — `src/reservations/dto/create-reservation.dto.ts`**

```ts
import { IsBoolean, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

const SLOT_REGEX = /^\d{2}:\d{2}$/;
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export class CreateReservationDto {
  @IsString()
  @IsNotEmpty()
  court_id: string;

  @Matches(DATE_REGEX, { message: 'date debe ser YYYY-MM-DD' })
  date: string;

  @Matches(SLOT_REGEX, { message: 'time_slot debe ser HH:MM' })
  time_slot: string;

  @IsOptional()
  @IsBoolean()
  has_guest?: boolean;

  @IsOptional()
  @IsString()
  guest_name?: string;

  @IsOptional()
  @IsString()
  partner_name?: string;

  @IsOptional()
  @IsString()
  school_name?: string;
}
```

En `reservations.controller.ts`, los handlers `create` y `modify` cambian su `@Body()` de tipo inline a `@Body() body: CreateReservationDto` (mismo nombre de variable, las llamadas al service no cambian). Importar el DTO.

- [ ] **Step 8: DTOs admin de jugadores — `src/players/dto/admin-player.dto.ts`**

```ts
import {
  IsBoolean, IsEmail, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength,
} from 'class-validator';

const MEMBER_TYPES = ['socio', 'hijo_socio', 'profe'];
const ADMIN_ROLES = ['escalerilla', 'reservas', 'all'];

export class CreatePlayerDto {
  @IsString() @IsNotEmpty() username: string;
  @IsEmail() email: string;
  @IsString() @MinLength(6) password: string;
  @IsString() @IsNotEmpty() name: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(0) position?: number;
  @IsOptional() @IsIn(MEMBER_TYPES) member_type?: string;
  @IsOptional() @IsString() parent_id?: string;
  @IsOptional() @IsBoolean() has_debt?: boolean;
  @IsOptional() @IsIn(ADMIN_ROLES) admin_role?: string | null;
  @IsOptional() @IsString({ each: true }) school_names?: string[];
}

export class UpdatePlayerDto {
  @IsOptional() @IsString() @IsNotEmpty() name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsInt() @Min(0) position?: number | null;
  @IsOptional() @IsInt() @Min(0) wins?: number;
  @IsOptional() @IsInt() @Min(0) losses?: number;
  @IsOptional() @IsInt() @Min(0) total_matches?: number;
  @IsOptional() @IsString() immune_until?: string | null;
  @IsOptional() @IsString() vulnerable_until?: string | null;
  @IsOptional() @IsIn(MEMBER_TYPES) member_type?: string;
  @IsOptional() @IsString() parent_id?: string | null;
  @IsOptional() @IsBoolean() has_debt?: boolean;
  @IsOptional() @IsIn(ADMIN_ROLES) admin_role?: string | null;
  @IsOptional() @IsInt() @Min(0) extra_high_demand_slots?: number;
  @IsOptional() @IsString({ each: true }) school_names?: string[];
}
```

En `admin-players.controller.ts`: `createPlayer(@Body() data: CreatePlayerDto)` y `updatePlayer(..., @Body() data: UpdatePlayerDto)` reemplazando los tipos inline. Nota: `@IsOptional()` de class-validator también acepta `null`, que estos endpoints usan para "quitar" valores.

- [ ] **Step 9: Verificación completa**

Run: `npx tsc -p tsconfig.build.json --noEmit && npx jest`
Expected: sin errores, tests PASS.

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json src/main.ts src/auth/dto src/reservations/dto src/players/dto src/reservations/reservations.controller.ts src/players/admin-players.controller.ts
git commit -m "feat: ValidationPipe global y DTOs validados en auth, reservas y admin de jugadores"
```

---

## Task 9: `accept` atómico (TDD)

**Files:**
- Test: `src/challenges/challenges.service.spec.ts` (nuevo)
- Modify: `src/challenges/challenges.service.ts:57-84` (método `accept`)

- [ ] **Step 1: Test que falla — `src/challenges/challenges.service.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { ChallengesService } from './challenges.service';

jest.mock('../notifications/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn(), sendGroupMessage: jest.fn(), sendAcceptedNotification: jest.fn(), sendChallengeNotification: jest.fn() },
}));
jest.mock('../notifications/email.service', () => ({
  emailService: { sendAcceptedNotification: jest.fn(), sendChallengeNotification: jest.fn() },
}));

describe('ChallengesService.accept', () => {
  const basePlayers = {
    challenger: { id: 'p1', name: 'Uno', email: 'a@a.cl', phone: null },
    challenged: { id: 'p2', name: 'Dos', email: 'b@b.cl', phone: null },
  };

  function build(updateManyCount: number) {
    const future = new Date(Date.now() + 60 * 60 * 1000);
    const challenge = {
      id: 'c1', challenger_id: 'p1', challenged_id: 'p2',
      status: 'pending', accept_deadline: future, ...basePlayers,
    };
    const prisma: any = {
      challenge: {
        findUnique: jest.fn().mockResolvedValue(challenge),
        updateMany: jest.fn().mockResolvedValue({ count: updateManyCount }),
      },
    };
    const appLogger: any = { challengeAccepted: jest.fn() };
    const rules: any = {};
    return { service: new ChallengesService(prisma, rules, appLogger), prisma };
  }

  it('falla si otro proceso ya cambió el estado (claim count 0)', async () => {
    const { service } = build(0);
    await expect(service.accept('c1', 'p2')).rejects.toThrow(BadRequestException);
  });

  it('acepta cuando el claim gana (count 1)', async () => {
    const { service, prisma } = build(1);
    const result = await service.accept('c1', 'p2');
    expect(result.message).toContain('aceptado');
    expect(prisma.challenge.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', status: 'pending' },
      data: expect.objectContaining({ status: 'accepted' }),
    });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/challenges/challenges.service.spec.ts`
Expected: FAIL — el código actual usa `challenge.update` (no `updateMany`), el primer test no lanza por claim.

- [ ] **Step 3: Reescribir `accept` con claim atómico**

Reemplazar el cuerpo del método `accept` por:

```ts
  async accept(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.challenged_id !== playerId) throw new BadRequestException('Solo el desafiado puede aceptar');
    if (challenge.status !== 'pending') throw new BadRequestException('Este desafío ya no está pendiente');
    if (new Date() > challenge.accept_deadline) throw new BadRequestException('El plazo para aceptar ya expiró');

    // Claim atómico: solo avanza si sigue pending (doble click / colisión con cron)
    const claimed = await this.prisma.challenge.updateMany({
      where: { id: challengeId, status: 'pending' },
      data:  { status: 'accepted', accepted_at: new Date() },
    });
    if (claimed.count === 0) throw new BadRequestException('Este desafío ya no está pendiente');

    const updated = { ...challenge, status: 'accepted' as const, accepted_at: new Date() };
    try {
      if (updated.challenger.phone) { await whatsappService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.phone); await this.sleep(500); }
      await emailService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.email);
    } catch (e) { console.error('⚠️ Error notificaciones aceptación:', e); }
    this.appLogger.challengeAccepted(updated.challenger.name, updated.challenged.name);
    return { message: 'Desafío aceptado exitosamente', challenge: updated };
  }
```

(Nota: el bloque de notificaciones se vuelve async en Task 13; aquí solo cambia el claim.)

- [ ] **Step 4: Verificar que pasa**

Run: `npx jest src/challenges/challenges.service.spec.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/challenges/challenges.service.ts src/challenges/challenges.service.spec.ts
git commit -m "fix: aceptación de desafío atómica (claim con updateMany)"
```

---

## Task 10: `resolveChallenge` delega en ChallengeRulesService

**Files:**
- Modify: `src/challenges/admin-challenges.service.ts:1-88`

- [ ] **Step 1: Inyectar las reglas y reescribir `resolveChallenge`**

Reemplazar imports, constructor y el método completo:

```ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from './challenge-rules.service';

@Injectable()
export class AdminChallengesService {
  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService,
  ) {}

  async resolveChallenge(challengeId: string, winnerId: string, score: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { challenger: true, challenged: true },
    });
    if (!challenge) throw new NotFoundException('Desafío no encontrado');

    if (winnerId !== challenge.challenger_id && winnerId !== challenge.challenged_id) {
      throw new BadRequestException('El ganador debe ser uno de los jugadores del desafío');
    }
    const loserId = winnerId === challenge.challenger_id
      ? challenge.challenged_id
      : challenge.challenger_id;

    // Misma lógica que el flujo normal: corrimiento + historial + inmunidad/vulnerabilidad + stats
    await this.rules.processWin(challengeId, winnerId, loserId);
    await this.rules.applyPostMatchStatus(winnerId, loserId);
    await this.rules.updateStats(winnerId, loserId);

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status:      'completed',
        winner_id:   winnerId,
        final_score: score,
        resolved_at: new Date(),
        played_at:   challenge.played_at || new Date(),
      },
      include: { challenger: true, challenged: true },
    });

    // Liberar la reserva del desafío (igual que processDoubleConfirmation)
    await this.prisma.reservation.updateMany({
      where: { challenge_id: challengeId, status: 'active' },
      data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Partido completado' },
    });

    return updated;
  }
```

`cancelChallenge`, `forceDelete` y `extendDeadline` quedan tal cual. `ChallengeRulesService` ya es provider de `ChallengesModule` (verificar con `grep -n "providers" src/challenges/challenges.module.ts`), no requiere cambios de módulo.

Diferencias de comportamiento (deliberadas, alineadas con el flujo normal): si el ganador queda en posición #1 ya NO recibe inmunidad; se escribe `RankingHistory` para TODOS los jugadores desplazados (antes solo para el ganador); el corrimiento ahora también aplica si el ganador es el desafiado y estaba detrás (processWin lo resuelve genéricamente — antes solo se movía si era el challenger).

- [ ] **Step 2: Verificar**

Run: `npx tsc -p tsconfig.build.json --noEmit && npx jest`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add src/challenges/admin-challenges.service.ts
git commit -m "refactor: resolución admin de desafíos delega en ChallengeRulesService y libera la reserva"
```

---

## Task 11: Cupos de alta demanda del panel admin alineados (TDD)

**Files:**
- Test: `src/players/admin-players.service.spec.ts` (nuevo)
- Modify: `src/players/admin-players.service.ts:210-253` (método `getWeeklyHighDemandUsage`)

- [ ] **Step 1: Test que falla — `src/players/admin-players.service.spec.ts`**

```ts
import { AdminPlayersService } from './admin-players.service';
import { chileWeekBoundsFromStr, currentChileDate } from '../common/dates';

describe('AdminPlayersService.getWeeklyHighDemandUsage', () => {
  function build(player: any, usedCount: number) {
    const prisma: any = {
      player: { findUnique: jest.fn().mockResolvedValue(player) },
      reservation: { count: jest.fn().mockResolvedValue(usedCount) },
    };
    const appLogger: any = {};
    return { service: new AdminPlayersService(prisma, appLogger), prisma };
  }

  const socio = {
    id: 'p1',
    member_type: 'socio',
    extra_high_demand_slots: 1,
    children: [{ id: 'h1', name: 'Hijo' }],
  };

  it('incluye extra_high_demand_slots e hijos en el límite', async () => {
    const { service } = build(socio, 2);
    const result = await service.getWeeklyHighDemandUsage('p1');
    // 2 base + 1 hijo + 1 extra = 4
    expect(result.limit).toBe(4);
    expect(result.remaining).toBe(2);
  });

  it('usa la semana Chile y cuenta cancelaciones tardías', async () => {
    const { service, prisma } = build(socio, 0);
    await service.getWeeklyHighDemandUsage('p1');
    const where = prisma.reservation.count.mock.calls[0][0].where;
    const { weekStart, weekEnd } = chileWeekBoundsFromStr(currentChileDate());
    expect(where.date).toEqual({ gte: weekStart, lte: weekEnd });
    expect(where.player_id).toEqual({ in: ['p1', 'h1'] });
    expect(where.OR).toEqual([
      { status: 'active' },
      { status: 'cancelled', cancel_reason: 'Cancelación tardía - turno descontado' },
    ]);
  });

  it('hijo_socio tiene límite 1', async () => {
    const { service } = build({ id: 'h1', member_type: 'hijo_socio', extra_high_demand_slots: 0, children: [] }, 1);
    const result = await service.getWeeklyHighDemandUsage('h1');
    expect(result.limit).toBe(1);
    expect(result.remaining).toBe(0);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest src/players/admin-players.service.spec.ts`
Expected: FAIL (límite sin extra slots, semana en hora del servidor, sin filtro OR).

- [ ] **Step 3: Reescribir `getWeeklyHighDemandUsage`**

```ts
  /**
   * Cupos de alta demanda usados esta semana — misma lógica que el cobro real
   * (ReservationsService.checkHighDemandLimit): semana Chile, cancelaciones
   * tardías cuentan, extra_high_demand_slots amplía el límite.
   */
  async getWeeklyHighDemandUsage(playerId: string) {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr(currentChileDate());

    const player = await this.prisma.player.findUnique({
      where: { id: playerId },
      include: { children: { select: { id: true, name: true } } }
    });
    if (!player) throw new NotFoundException('Jugador no encontrado');

    const playerIds = [playerId, ...(player.children?.map(c => c.id) || [])];

    const used = await this.prisma.reservation.count({
      where: {
        player_id:      { in: playerIds },
        is_high_demand: true,
        date:           { gte: weekStart, lte: weekEnd },
        OR: [
          { status: 'active' },
          { status: 'cancelled', cancel_reason: 'Cancelación tardía - turno descontado' },
        ],
      }
    });

    const extraSlots = player.extra_high_demand_slots ?? 0;
    const limit = player.member_type === 'hijo_socio'
      ? 1
      : 2 + (player.children?.length || 0) + extraSlots;

    return {
      player_id:   playerId,
      member_type: player.member_type,
      used,
      limit,
      remaining:   Math.max(0, limit - used),
      week_start:  weekStart,
      week_end:    weekEnd,
    };
  }
```

Agregar el import: `import { chileWeekBoundsFromStr, currentChileDate } from '../common/dates';`

- [ ] **Step 4: Verificar que pasa**

Run: `npx jest src/players/admin-players.service.spec.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/players/admin-players.service.ts src/players/admin-players.service.spec.ts
git commit -m "fix: panel admin de cupos usa semana Chile, tardías y extra slots (consistente con el cobro)"
```

---

## Task 12: Transacciones y captura del unique parcial

**Files:**
- Modify: `src/challenges/challenge-rules.service.ts:210-287` (`processWin`)
- Modify: `src/cron/challenges-cron.service.ts:232-264` (`penalizeBothPlayers`)
- Modify: `src/challenges/challenges.service.ts` (`scheduleMatch`)
- Modify: `src/reservations/reservations.service.ts` (`create`, `modify`, `checkHighDemandLimit`)

- [ ] **Step 1: `processWin` transaccional**

Reemplazar desde el comentario `// Guardar historial ANTES de hacer cambios` hasta el final del método por:

```ts
    // Historial + corrimiento en UNA transacción (orden descendente: el
    // pivot 9999 libera la posición del ganador y cada update entra a un
    // hueco recién liberado).
    await this.prisma.$transaction([
      ...affectedPlayers.map(player =>
        this.prisma.rankingHistory.create({
          data: {
            player_id:    player.id,
            old_position: player.position,
            position:     player.position + 1,
            reason:       'challenge_lost',
          },
        }),
      ),
      this.prisma.rankingHistory.create({
        data: {
          player_id:    winner.id,
          old_position: oldWinnerPosition,
          position:     targetPosition,
          reason:       'challenge_won',
        },
      }),
      this.prisma.player.update({ where: { id: winner.id }, data: { position: 9999 } }),
      ...affectedPlayers.map(player =>
        this.prisma.player.update({
          where: { id: player.id },
          data:  { position: player.position + 1 },
        }),
      ),
      this.prisma.player.update({ where: { id: winner.id }, data: { position: targetPosition } }),
    ]);

    console.log(`✅ Corrimiento: ${winner.name} (${oldWinnerPosition} → ${targetPosition})`);
  }
```

- [ ] **Step 2: `penalizeBothPlayers` transaccional**

Reemplazar desde el primer `await this.prisma.rankingHistory.create` hasta el último `player.update` por:

```ts
    const ops = [
      this.prisma.rankingHistory.create({
        data: { player_id: challenger.id, old_position: challenger.position, position: challenger.position + 1, reason: 'penalty' }
      }),
    ];

    if (playerBelow) {
      ops.push(
        this.prisma.rankingHistory.create({
          data: { player_id: playerBelow.id, old_position: playerBelow.position, position: playerBelow.position - 1, reason: 'opponent_penalty' }
        }),
      );
    }

    ops.push(this.prisma.player.update({ where: { id: challenger.id }, data: { position: 9999 } }));
    if (playerBelow) {
      ops.push(this.prisma.player.update({ where: { id: playerBelow.id }, data: { position: challenger.position } }));
    }
    ops.push(this.prisma.player.update({ where: { id: challenger.id }, data: { position: challenger.position + 1 } }));

    await this.prisma.$transaction(ops);
```

(Tipar `ops` como `any[]` NO está permitido; usar `const ops: Prisma.PrismaPromise<unknown>[] = [...]` con `import { Prisma } from '@prisma/client';`.)

- [ ] **Step 3: `scheduleMatch` — swap de reserva atómico + P2002**

En `challenges.service.ts`, reemplazar el bloque "Cancelar reserva anterior" + "Crear nueva reserva" por:

```ts
      // Nombre del rival para partner_name
      const other = challenge.challenger_id === playerId ? challenge.challenged : challenge.challenger;

      // Cancelar reserva anterior de este desafío + crear la nueva, atómico.
      try {
        await this.prisma.$transaction([
          this.prisma.reservation.updateMany({
            where: { challenge_id: challengeId, status: 'active' },
            data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Fecha reprogramada' }
          }),
          this.prisma.reservation.create({
            data: {
              player_id:      playerId,
              court_id:       courtId,
              date:           dateChile,
              time_slot:      slot,
              is_high_demand: isHighDemand,
              has_guest:      false,
              partner_name:   other.name,
              is_challenge:   true,
              challenge_id:   challengeId,
              status:         'active',
            }
          }),
        ]);
      } catch (e: any) {
        // Índice parcial reservations_active_slot_uniq: carrera perdida
        if (e?.code === 'P2002') throw new BadRequestException('Ese horario ya está ocupado en esa cancha.');
        throw e;
      }
```

(Eliminar la declaración duplicada de `other` que existía más abajo si quedó repetida.)

- [ ] **Step 4: `reservations.service.ts` — `create` con P2002**

Envolver el `this.prisma.reservation.create({...})` de `create`:

```ts
        let reservation;
        try {
            reservation = await this.prisma.reservation.create({
                // ... data e include EXACTAMENTE como están hoy ...
            });
        } catch (e: any) {
            if (e?.code === 'P2002') throw new BadRequestException('Este turno ya está reservado en esa cancha.');
            throw e;
        }
```

- [ ] **Step 5: `modify` — validar antes, swap atómico, sin rollback manual**

1. Cambiar la firma del helper: `private async checkHighDemandLimit(player: any, dateStr: string, excludeReservationId?: string)` y dentro, agregar a AMBOS `count` (familiar e individual) la condición:

```ts
                ...(excludeReservationId ? { id: { not: excludeReservationId } } : {}),
```

(dentro del objeto `where`, junto a `player_id`).

2. En `modify`, reemplazar el bloque desde `// Verificar límite alta demanda...` (el `update` a cancelled) hasta el `catch` con restauración, por:

```ts
        // Validar cupo ANTES de tocar nada, excluyendo la reserva que se modifica
        if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, data.date, reservationId);

        let newReservation;
        try {
            const [, created] = await this.prisma.$transaction([
                this.prisma.reservation.update({
                    where: { id: reservationId },
                    data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Modificada por jugador' }
                }),
                this.prisma.reservation.create({
                    data: {
                        player_id:      player.id,
                        court_id:       data.court_id,
                        date:           reservationDate,
                        time_slot:      data.time_slot,
                        is_high_demand: isHighDemand,
                        has_guest:      isProfe ? false : (data.has_guest || false),
                        guest_name:     isProfe ? null  : (data.guest_name || null),
                        guest_fee:      isProfe ? 0     : (data.has_guest ? 3000 : 0),
                        partner_name:   isProfe ? null  : (data.partner_name || null),
                        status:         'active',
                    },
                    include: { court: true }
                }),
            ]);
            newReservation = created;
        } catch (e: any) {
            if (e?.code === 'P2002') throw new BadRequestException('Este turno ya está reservado en esa cancha.');
            throw e;
        }
```

y dejar el bloque de notificación + `return` fuera del try (usando `newReservation`).

- [ ] **Step 6: Verificación**

Run: `npx tsc -p tsconfig.build.json --noEmit && npx jest`
Expected: sin errores, tests PASS (incluidos los de Tasks 9 y 11).

- [ ] **Step 7: Commit**

```bash
git add src/challenges/challenge-rules.service.ts src/cron/challenges-cron.service.ts src/challenges/challenges.service.ts src/reservations/reservations.service.ts
git commit -m "feat: transacciones en corrimientos y reservas + manejo del unique anti doble-booking"
```

---

## Task 13: Notificaciones fuera del camino de la request

**Files:**
- Modify: `src/challenges/challenges.service.ts`
- Modify: `src/reservations/reservations.service.ts`
- Modify: `src/master/master.service.ts`

- [ ] **Step 1: Agregar helper a los 3 servicios**

En cada servicio (junto a `sleep` si existe):

```ts
  /** Dispara notificaciones sin bloquear la respuesta HTTP. */
  private notifyAsync(task: () => Promise<void>) {
    void task().catch(e => console.error('⚠️ Error notificaciones (async):', e));
  }
```

- [ ] **Step 2: challenges.service.ts — envolver los 6 bloques**

Patrón: cada bloque `try { ...envíos con await y sleep... } catch (e) { console.error(...) }` se convierte en `this.notifyAsync(async () => { ...mismos envíos... });` conservando los `sleep` internos. Ejemplo completo con `create`:

```ts
    this.notifyAsync(async () => {
      if (challenged.phone) { await whatsappService.sendChallengeNotification(challenger.name, challenged.name, challenged.phone); await this.sleep(500); }
      await emailService.sendChallengeNotification(challenger.name, challenged.name, challenged.email);
    });
```

Aplicar el mismo patrón a: bloque de `accept`; los DOS bloques de `reject` (personal + grupo) **fusionados en un solo `notifyAsync`** para conservar el orden personal→grupo; bloque "aviso al otro jugador" de `submitResult`; los DOS bloques de `scheduleMatch` (personal + grupo, fusionados); los DOS bloques de notificación de `processDoubleConfirmation` (resultado + grupo, fusionados — el caso disputed también).

- [ ] **Step 3: reservations.service.ts — 4 bloques**

Mismo patrón en: `create` (confirmación), `cancel` (aviso), `modify` (aviso), `adminCancel` (aviso). Ejemplo con `create`:

```ts
        if (!isProfe) {
            this.notifyAsync(async () => {
                if (!player.phone) return;
                const fechaFormateada = formatReservationDate(reservationDate);
                await whatsappService.sendMessage(
                    player.phone,
                    `📅 *Club de Tenis Graneros*\n\n` +
                    `✅ Tu reserva está confirmada\n\n` +
                    `🎾 ${court.name}\n` +
                    `📆 ${fechaFormateada}\n` +
                    `🕐 ${data.time_slot} hrs` +
                    (isHighDemand ? `\n🔥 Turno de alta demanda` : '') +
                    (data.has_guest ? `\n👤 Visita: ${data.guest_name || 'Externa'}` : '') +
                    (data.partner_name ? `\n🤝 Con: ${data.partner_name}` : '')
                );
            });
        }
```

- [ ] **Step 4: master.service.ts — bloques posteriores a la operación**

Envolver en `this.notifyAsync(...)`:
- En `generateMaster`: TODO el bloque "Notificar jugadores" (los dos loops con `sendWsp`/`sleep`) + el `sendWspGroup` final, en UN solo `notifyAsync` (conserva orden).
- En `scheduleMatch`: el `await this.sendWsp(other.phone, ...)`.
- En `submitPlayerResult`: el aviso "ya ingresó el resultado" y los avisos de disputa (fusionados con su `sleep`).
- En `processMasterResult`: los avisos a ganador/perdedor + grupo (fusionados). Los `checkAndGenerateSemifinals`/`checkAndGenerateFinal` se llaman ANTES de las notificaciones y quedan fuera del notifyAsync (mutan estado del torneo).
- En `checkAndGenerateSemifinals` y `checkAndGenerateFinal`: sus bloques de `sendWsp`/`sendWspGroup` finales.

- [ ] **Step 5: Ajustar el test de accept si aplica**

`challenges.service.spec.ts` (Task 9) usa mocks de notificaciones — sigue pasando porque `notifyAsync` traga errores. Verificar.

- [ ] **Step 6: Verificación**

Run: `npx tsc -p tsconfig.build.json --noEmit && npx jest`
Expected: sin errores, tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/challenges/challenges.service.ts src/reservations/reservations.service.ts src/master/master.service.ts
git commit -m "perf: notificaciones WhatsApp/email fire-and-forget, fuera del camino de la request"
```

---

## Task 14: Seed idempotente

**Files:**
- Modify: `prisma/seed.ts`

- [ ] **Step 1: Reemplazar los `create` por `upsert`**

```ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  const adminPasswordHash = await bcrypt.hash('admin123', 10);

  const adminUser = await prisma.user.upsert({
    where:  { username: 'admin' },
    update: {},
    create: {
      username: 'admin',
      email: 'admin@ctg.cl',
      password_hash: adminPasswordHash,
      is_admin: true,
    }
  });

  await prisma.player.upsert({
    where:  { user_id: adminUser.id },
    update: {},
    create: {
      user_id: adminUser.id,
      name: 'Administrador CTG',
      email: 'admin@ctg.cl',
      position: 0,
    }
  });

  console.log('✅ Admin creado/verificado:');
  console.log('   Username: admin');
  console.log('   Password: admin123 (solo si es nuevo)');
  console.log('\n⚠️  CAMBIA ESTA CONTRASEÑA EN PRODUCCIÓN\n');
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: Commit**

```bash
git add prisma/seed.ts
git commit -m "fix: seed idempotente con upsert"
```

---

## Task 15: Documentación y cierre

**Files:**
- Modify: `ONBOARDING.md`, `CLAUDE.md`
- Delete: `prisma/schema.prisma.backup`, `prisma/seed.js`, `prisma/seed.js.map`, `prisma/seed.d.ts` (artefactos compilados/backup)

- [ ] **Step 1: ONBOARDING.md**

Reemplazar la instrucción del backend: `crea `.env.development`` → `crea `.env.dev`` (la del frontend NO se toca).

- [ ] **Step 2: Borrar artefactos de prisma/**

```bash
git rm --cached prisma/seed.js prisma/seed.js.map prisma/seed.d.ts prisma/schema.prisma.backup 2>/dev/null; rm -f prisma/seed.js prisma/seed.js.map prisma/seed.d.ts prisma/schema.prisma.backup
```

(Si alguno no estaba versionado, `git rm --cached` falla para ese archivo — usar `rm` directo. Verificar después que `npx prisma db seed` sigue funcionando: usa `ts-node prisma/seed.ts` según package.json.)

- [ ] **Step 3: Actualizar CLAUDE.md**

Cambios puntuales (mantener el resto):
- Sección **Despliegue**: eliminar la mención a la doble configuración; queda solo Dockerfile. Agregar: "El startCommand de Railway debe quedar vacío (el CMD del Dockerfile ejecuta `migrate deploy`). `DIRECT_URL` es obligatoria en las variables de Railway."
- Sección **Schema y Migraciones (DRIFT)**: reescribir indicando que el drift fue saneado con `20260611100000_sync_schema_drift` (idempotente) y que la ÚNICA excepción schema-vs-DB es el índice parcial `reservations_active_slot_uniq` (anti doble-booking, Prisma no soporta índices parciales — `migrate dev` lo reportará como drift esperado).
- Sección **Modelos con `prisma as any`**: eliminar (ya no hay casts); reemplazar por nota: "No usar `(this.prisma as any)` — el client está al día; regenerar con `npx prisma generate` si cambia el schema."
- Sección **Autenticación**: documentar guards globales `JwtAuthGuard` + `AdminGuard`, decoradores `@Public()`/`@Admin()`, y que los controllers aún derivan `player_id` del body en challenges (pendiente fase 2: derivarlo del token).
- Sección **Master**: eliminar el warning del bug (resuelto); documentar la doble confirmación con `player1_result`/`player2_result`.
- **Gotchas**: eliminar los de `admin-challenges` con lógica propia y el del directorio `node_modules 2`; agregar: "Las cancelaciones tardías usan el string literal `'Cancelación tardía - turno descontado'` como discriminador en queries — no cambiarlo."
- Sección **Variables de Entorno**: quitar `WORDPRESS_URL`; marcar `JWT_SECRET` y `DIRECT_URL` como obligatorias (la app no arranca / no migra sin ellas).

- [ ] **Step 4: Verificación final completa**

```bash
npx prisma validate
npx tsc -p tsconfig.build.json --noEmit
npm run build
npx jest
```

Expected: todo verde.

- [ ] **Step 5: Commit**

```bash
git add ONBOARDING.md CLAUDE.md
git commit -m "docs: actualizar CLAUDE.md y ONBOARDING tras fixes integrales"
```

- [ ] **Step 6: Recordatorio para el usuario (NO automatizable)**

Antes de pushear `dev` a Railway staging:
1. Agregar `DIRECT_URL` en las variables del servicio de staging (y prod para cuando se promueva).
2. Vaciar el "Custom Start Command" en Railway → Settings → Deploy si está seteado en la UI.
3. Tras el deploy de staging, verificar en los logs que se aplican las migraciones `add_light_charge_config`, `sync_schema_drift`, `add_master_match_results`, `add_performance_indexes`.
4. Probar en staging: login, crear/cancelar reserva, `light-config`, resultado de Master con dos cuentas, y que un usuario NO admin recibe 403 en `/admin/players/all`.
