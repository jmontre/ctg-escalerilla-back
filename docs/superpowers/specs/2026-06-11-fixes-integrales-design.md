# Fixes Integrales: Migraciones, Master, Consistencia y Limpieza

**Fecha:** 2026-06-11
**Estado:** Aprobado por Javier

## Contexto

Un análisis completo del backend reveló un conjunto de problemas ("yayitas") que van desde un bug que rompe el torneo Master hasta un pipeline de deploy que dejó de aplicar migraciones hace ~3 meses. Este spec define los arreglos.

### Diagnóstico clave (verificado contra Supabase producción)

- `_prisma_migrations` en prod tiene **6 migraciones aplicadas** (hasta `20260324204804_add_avatar_url_to_players`). La séptima (`20260424000000_add_light_charge_config`) **nunca se aplicó**: la tabla `light_charge_configs` no existe ni en prod ni en staging → los endpoints `/reservations/light-config` y `/reservations/light-summary` fallan en runtime.
- Causa: `railway.json` define `deploy.startCommand: "npm run start:prod"`, que **anula el CMD del Dockerfile** (`npx prisma migrate deploy && node dist/main.js`). El build sí usa Dockerfile (confirmado en Railway Settings), pero el arranque se salta las migraciones.
- Las tablas `courts`, `reservations`, `system_config`, `court_blocks`, `master_seasons`, `master_groups`, `master_group_players`, `master_matches` y varias columnas (`extra_high_demand_slots`, `school_names`, `partner_name`, `is_challenge`, `challenge_id`, `school_name`, etc.) existen en la DB pero **no en ninguna migración** — fueron creadas con `prisma db push` o SQL manual (drift).
- `MasterService.submitPlayerResult` escribe `player1_result`/`player2_result` que no existen en schema, migraciones ni DB → la doble confirmación del Master lanza `PrismaClientValidationError`.

### Decisiones del usuario

1. **Master**: mantener doble confirmación de resultados (como los desafíos) → agregar las 2 columnas a la DB.
2. **Deploy**: el servicio usa Dockerfile → eliminar `railway.json`, `nixpacks.toml` y `Procfile`.
3. **Auth WordPress**: eliminar el código muerto.

## Diseño

### A. Migraciones y Prisma

1. **Schema**: agregar a `MasterMatch`: `player1_result Json?` y `player2_result Json?`.
2. **Migración `sync_schema_drift`** (idempotente): recrea todo el drift con guardas:
   - `CREATE TABLE IF NOT EXISTS` para las 8 tablas faltantes.
   - `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` para columnas drifteadas.
   - Constraints (FKs, uniques) e índices envueltos en `DO $$ ... EXCEPTION WHEN duplicate_object / duplicate_table THEN NULL $$` o `CREATE UNIQUE INDEX IF NOT EXISTS`.
   - El SQL se genera con `prisma migrate diff --from-empty --to-schema-datamodel` y se filtra contra lo que ya crean las 7 migraciones existentes.
   - Resultado: en prod/staging es un no-op seguro; una DB nueva construida solo con `migrate deploy` queda idéntica al schema.
3. **Migración `add_master_match_results`**: `ADD COLUMN IF NOT EXISTS player1_result JSONB, player2_result JSONB` en `master_matches`.
4. `npx prisma generate` y eliminación de los casts `(this.prisma as any)` en `reservations.service.ts` (courtBlock), `challenges.service.ts` (reservation) y `master.service.ts` (updates de resultados). El objetivo a futuro es restaurar `--noEmitOnError` en el build, pero eso queda fuera de este trabajo (se revisará cuando el build esté limpio).

**Orden de aplicación en el próximo deploy** (automático vía CMD del Dockerfile):
`add_light_charge_config` (pendiente desde abril) → `sync_schema_drift` (no-op) → `add_master_match_results`.

### B. Deploy (Railway)

- Eliminar `railway.json`, `nixpacks.toml` y `Procfile`. El CMD del Dockerfile (`npx prisma migrate deploy && node dist/main.js`) vuelve a regir el arranque.
- **Checklist manual del usuario antes del próximo deploy** (staging y prod):
  1. Agregar variable `DIRECT_URL` en Railway (conexión directa de Supabase, puerto 5432, no el pooler). Sin ella, `migrate deploy` falla y el contenedor no arranca.
  2. Verificar en Railway → Settings → Deploy que el campo **Custom Start Command de la UI quede vacío** (si está seteado a mano, seguiría anulando el CMD).
  3. Desplegar primero en staging y verificar logs: deben verse las 3 migraciones aplicándose.

### C. Master — doble confirmación funcional

- Con las columnas creadas y el client regenerado, la lógica existente de `submitPlayerResult` queda operativa sin reescritura: ambos ingresan → coinciden se procesa / difieren `disputed`; admin resuelve disputas vía `POST /master/matches/:id/result`.
- Se eliminan los `as any` de esos updates y se tipan los resultados.

### D. Consistencia de la escalerilla

1. **`AdminChallengesService.resolveChallenge`** delega en `ChallengeRulesService` en lugar de su lógica propia:
   - `processWin` (corrimiento con pivot 9999 + `RankingHistory` para todos los afectados),
   - `applyPostMatchStatus` (inmunidad 24h excepto posición #1 — hoy el admin da inmunidad incluso al #1),
   - `updateStats`.
   - Además libera la reserva del desafío (`status: cancelled, cancel_reason: 'Partido completado'`) igual que el flujo normal.
   - `ChallengeRulesService` ya está proveído en `ChallengesModule`, solo se inyecta.
2. **`ChallengesService.accept`**: aplicar el mismo patrón de claim atómico que `reject` (`updateMany where status: 'pending'`) para evitar doble procesamiento.
3. `cancelChallenge` admin NO cambia: seguir sin revertir ranking es decisión de negocio documentada.

### E. Cupos de alta demanda — panel admin

`AdminPlayersService.getWeeklyHighDemandUsage` se alinea con la lógica de cobro real (`ReservationsService.checkHighDemandLimit`):
- Semana lunes-domingo en hora Chile (`chileWeekBoundsFromStr(currentChileDate())`) en vez de hora del servidor.
- Cuenta cancelaciones tardías (`cancel_reason = 'Cancelación tardía - turno descontado'`).
- Incluye `extra_high_demand_slots` en el límite.
Hoy el panel puede mostrar cupos distintos a los que se aplican al reservar.

### F. Limpieza y hardening

1. Eliminar `src/auth/wordpress-auth.service.ts`, `wordpress-auth.guard.ts`, `wp-user.decorator.ts` (código muerto que además loguea cookies).
2. `AuthModule`: eliminar el fallback hardcodeado de `JWT_SECRET` (`'ctg-secret-key-change-in-production'`). Si la variable falta, lanzar error claro al arrancar.
3. Seed idempotente: `upsert` por `username` en vez de `create`.
4. `ONBOARDING.md`: corregir `.env.development` → `.env.dev` (backend).
5. `CLAUDE.md`: actualizar las secciones que estos fixes dejan obsoletas (drift, Master roto, deploy ambiguo, gotcha de admin-challenges).
6. Borrar directorio basura `node_modules 2/` (vacío, no versionado).

## Testing

- `npm run build` y `npm test` deben pasar.
- Tests nuevos (Jest, siguiendo `src/common/dates.spec.ts` como referencia de estilo):
  - `getWeeklyHighDemandUsage`: semana Chile + conteo de tardías + extra slots (con Prisma mockeado).
  - Claim atómico de `accept`: segundo intento sobre desafío ya aceptado falla con `BadRequestException`.
- Validación de migraciones: aplicar las migraciones sobre una DB vacía local/efímera si hay una disponible; como mínimo, verificar que el SQL de `sync_schema_drift` + migraciones existentes produce el mismo DDL que `migrate diff --from-empty --to-schema-datamodel`.
- Verificación manual post-deploy en staging (usuario): logs de migraciones, `GET /reservations/light-config?date=...`, flujo de resultado Master con dos cuentas.

## Fuera de alcance

- Guards/protección real de rutas admin (se mantiene el modelo de confianza actual).
- Revertir ranking en `cancelChallenge`.
- Restaurar `--noEmitOnError` en el build.
- Cambios en notificaciones WhatsApp/email.
