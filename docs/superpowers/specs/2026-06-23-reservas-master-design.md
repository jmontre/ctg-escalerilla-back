# Reservas de partidos de Master

**Fecha:** 2026-06-23
**Estado:** Aprobado por Javier (pendiente revisión del spec escrito)

## Contexto

Hoy, al agendar un **desafío** con cancha, `ChallengesService.scheduleMatch` crea una reserva (`is_challenge: true`, `challenge_id`), valida cancha/slot libre y "una reserva activa a la vez", descuenta cupo de alta demanda, bloquea el slot (queda `active`), notifica al rival y al grupo de WhatsApp, y la muestra como "Desafío" en el fixture/disponibilidad. Al completarse el partido o reprogramar, libera/reemplaza la reserva.

El **Master** NO tiene nada de esto: `MasterService.scheduleMatch(matchId, userId, scheduledDate)` solo guarda `scheduled_date` en `master_matches` y notifica al rival. No reserva cancha, no bloquea slot, no aparece en el fixture.

**Objetivo:** que agendar un partido de Master con cancha funcione igual que un desafío — crear reserva, bloquear el turno, notificar (rival + grupo) y mostrarlo en el fixture como **"Master Categoría {A/B/C/D}"**.

## Decisiones (confirmadas con el usuario)

1. El jugador **elige cancha + fecha/hora** al agendar (igual que desafío).
2. La reserva de Master **descuenta cupo de alta demanda** igual que el desafío.
3. Aplica la **misma restricción de "una reserva activa a la vez"** (cuenta normales + desafíos + master).
4. Fixture muestra **"Master Categoría {category}"** (con la categoría del torneo).
5. **Notificación individual al rival + mensaje al grupo** (tal cual el desafío).

## Diseño

### A. Modelo de datos (`prisma/schema.prisma`)

`Reservation` gana dos campos (espejo de `is_challenge`/`challenge_id`):
- `is_master Boolean @default(false)`
- `master_match_id String?`
- Relación: `master_match MasterMatch? @relation("match_reservations", fields: [master_match_id], references: [id])`

`MasterMatch` gana el lado inverso: `reservations Reservation[] @relation("match_reservations")`.

**Migración idempotente** `add_master_reservation_link`:
- `ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "is_master" BOOLEAN NOT NULL DEFAULT false;`
- `ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "master_match_id" TEXT;`
- FK `reservations_master_match_id_fkey` → `master_matches(id)` `ON DELETE SET NULL`, en bloque `DO $$ ... EXCEPTION WHEN duplicate_object`.

`MasterMatch.season` con `onDelete: Cascade` ya existe (FK reciente), así que `master_match.season.category` es alcanzable para el fixture.

### B. Backend — `MasterService.scheduleMatch(matchId, userId, scheduledDate, courtId?)`

Se agrega el parámetro `courtId?`. Si viene, replica la lógica de `ChallengesService.scheduleMatch` (reutilizando la constante `HIGH_DEMAND` y los helpers de fecha `toChileDateStr`, `chileWeekBoundsFromStr`):

1. Validaciones previas (igual que hoy): match existe, no completado, jugador es del match, fecha futura.
2. Si `courtId`:
   - Cancha activa; slot (derivado de `scheduledDate` en hora Chile) libre en esa cancha (excluyendo reservas de este mismo match).
   - **Una reserva activa a la vez**: el jugador no tiene otra reserva `active` que no sea de este match (`OR` explícito para `master_match_id` null/distinto, igual que el patrón de challenges con `challenge_id`).
   - Cupo de alta demanda (si el slot es de alta demanda según `SystemConfig.season`): cuenta familiar (jugador + hijos), `extra_high_demand_slots`, límite por `member_type`, excluyendo reservas de este match.
   - **Transacción** (`prisma.$transaction([...])`):
     - `reservation.updateMany` → cancela la reserva master anterior de este match (`status: 'cancelled'`, `cancel_reason: 'Fecha reprogramada'`).
     - `reservation.create` → `is_master: true`, `master_match_id: matchId`, `partner_name: <rival>`, `is_high_demand`, `court_id`, `date`, `time_slot`, `status: 'active'`.
     - `masterMatch.update` → `scheduled_date`.
   - `catch (P2002)` → `BadRequestException('Ese horario ya está ocupado en esa cancha.')`.
3. Si NO `courtId`: solo `masterMatch.update({ scheduled_date })` (comportamiento actual, sin reserva).
4. **Notificaciones** (vía `notifyAsync`, fire-and-forget): mensaje individual al rival + mensaje al grupo (formato abajo).

### C. Liberar la reserva

- `processMasterResult` (al completar): `reservation.updateMany({ where: { master_match_id: matchId, status: 'active' }, data: { status: 'cancelled', cancelled_at, cancel_reason: 'Partido completado' } })`.
- `deleteSeason`: **antes** de borrar los matches, cancelar explícitamente las reservas master asociadas (`reservation.updateMany({ where: { master_match_id: { in: <ids de matches de la temporada> }, status: 'active' }, data: { status: 'cancelled', cancelled_at, cancel_reason: 'Torneo eliminado' } })`), para que los slots se liberen del fixture. (La FK con `ON DELETE SET NULL` solo desvincularía, dejando la reserva `active` y el slot bloqueado — por eso se cancela a mano.)

### D. Fixture / disponibilidad (`ReservationsService.getAvailability`)

- Incluir `master_match: { include: { season: { select: { category: true } } } }` en la query de reservas.
- En el objeto `reservation` de cada slot, agregar:
  - `is_master: existing.is_master`
  - `master_category: existing.master_match?.season?.category ?? null`
- El slot sigue marcándose `available: false` y `blocked` por ser una reserva `active` (mecanismo actual, sin cambios).

### E. Frontend

- **Pantalla de Master** (`app/master/page.tsx`, `handleSchedule`): pasar de solo fecha/hora a **cancha + fecha/hora** (selector de cancha como en el flujo de desafío). El `fetch` a `PATCH /master/matches/:id/schedule` incluye `court_id` (con `authHeader()`, ya presente).
- **Fixture/disponibilidad**: donde hoy renderiza "Desafío" para `is_challenge`, agregar la rama `is_master` → **"Master Categoría {master_category}"** + nombres de los jugadores (`partner_name`).

### F. Notificaciones (formato)

Individual al rival:
```
🏆 *Master CTG*

📅 *{setter}* agendó el partido:

*{Lunes 30 de junio — 18:15 hrs}* · {Cancha 2}

Si no puedes, coordina con tu rival.
```

Grupo:
```
🏆 *Master CTG — Categoría {category}*

⚔️ *{player1}* vs *{player2}*
📅 {Lunes 30 de junio — 18:15 hrs} · {Cancha 2}
```

## Testing

- `npx tsc -p tsconfig.build.json --noEmit` limpio; `npx jest --forceExit` verde.
- Verificación de migración: el SQL es idempotente (`IF NOT EXISTS` + `DO` FK).
- Manual en staging: agendar un partido de Master con cancha → aparece reserva `is_master` en el fixture como "Master Categoría X", el slot queda bloqueado, llega WhatsApp al rival y al grupo. Reprogramar → cancela la anterior y crea la nueva. Completar el partido → el slot se libera.

## Fuera de alcance

- Lógica de resultados/avance del torneo (solo se libera la reserva al completar).
- Reglas de armado de grupos del Master.
- Cupo: no se crea una exención especial; se reutiliza la lógica de alta demanda existente.
