# Reservas de partidos de Master — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Que agendar un partido de Master con cancha cree una reserva (bloqueando el turno), notifique al rival y al grupo de WhatsApp, y se muestre en el fixture como "Master Categoría X" — replicando el flujo de los desafíos.

**Architecture:** Se espeja `ChallengesService.scheduleMatch` en `MasterService.scheduleMatch` (validaciones + reserva transaccional + P2002 + notificaciones). La reserva se vincula al `MasterMatch` con dos campos nuevos en `Reservation` (`is_master`, `master_match_id`) y una relación Prisma. El fixture (`getAvailability`) expone la categoría del torneo para la etiqueta.

**Tech Stack:** NestJS 11, Prisma 5, PostgreSQL (Railway), Next.js (frontend), Jest 30.

**Reglas del repo:**
- Backend en `/Users/javiermontre/Documents/CTG/CTG-API-ESCALERILLA/backend`, frontend en `/Users/javiermontre/Documents/CTG/CTG-API-ESCALERILLA/frontend`.
- Branch `dev` en ambos. Commits SIN trailer Co-Authored-By/Claude.
- Verificación de tipos: `npx tsc -p tsconfig.build.json --noEmit` (backend). Tests: `npx jest --forceExit` (jest cuelga sin `--forceExit` por handles abiertos).
- NO correr `prisma migrate` contra la DB; migraciones a mano e idempotentes.

---

## Task 1: Schema + migración (campos de vínculo Master ↔ Reservation)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260623000000_add_master_reservation_link/migration.sql`

- [ ] **Step 1: Agregar campos y relación al schema**

En el modelo `Reservation`, después de `challenge_id   String?` agregar:

```prisma
  is_master      Boolean   @default(false)
  master_match_id String?
```

Y dentro de las relaciones del mismo modelo (junto a `player`/`court`), agregar:

```prisma
  master_match MasterMatch? @relation("match_reservations", fields: [master_match_id], references: [id], onDelete: SetNull)
```

En el modelo `MasterMatch`, agregar el lado inverso (junto a las otras relaciones, antes de `@@map`):

```prisma
  reservations Reservation[] @relation("match_reservations")
```

- [ ] **Step 2: Crear la migración idempotente**

`prisma/migrations/20260623000000_add_master_reservation_link/migration.sql`:

```sql
-- Vínculo reserva ↔ partido de Master (espejo de is_challenge/challenge_id)
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "is_master" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "reservations" ADD COLUMN IF NOT EXISTS "master_match_id" TEXT;

DO $$ BEGIN
  ALTER TABLE "reservations" ADD CONSTRAINT "reservations_master_match_id_fkey"
    FOREIGN KEY ("master_match_id") REFERENCES "master_matches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

- [ ] **Step 3: Regenerar client y validar**

Run: `npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid 🚀` y `Generated Prisma Client`.

Run: `grep -c "is_master" node_modules/.prisma/client/index.d.ts`
Expected: número > 0.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20260623000000_add_master_reservation_link
git commit -m "feat: vínculo reserva ↔ partido de Master (is_master, master_match_id) + migración"
```

---

## Task 2: Backend — `MasterService.scheduleMatch` crea la reserva

**Files:**
- Modify: `src/master/master.service.ts` (imports, constante, método `scheduleMatch`)
- Modify: `src/master/master.controller.ts:47-55` (pasar `court_id`)
- Test: `src/master/master.service.spec.ts` (nuevo)

- [ ] **Step 1: Test que falla — `src/master/master.service.spec.ts`**

```ts
import { BadRequestException } from '@nestjs/common';
import { MasterService } from './master.service';

jest.mock('../notifications/whatsapp.service', () => ({
  whatsappService: { sendMessage: jest.fn(), sendGroupMessage: jest.fn(), isReady: () => true },
}));

describe('MasterService.scheduleMatch', () => {
  const futureDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  function build(overrides: any = {}) {
    const match = {
      id: 'm1', status: 'pending', player1_id: 'p1', player2_id: 'p2',
      player1: { id: 'p1', name: 'Uno', phone: null },
      player2: { id: 'p2', name: 'Dos', phone: null },
      season: { category: 'A' },
    };
    const prisma: any = {
      player: { findUnique: jest.fn().mockResolvedValue({ id: 'p1', children: [], member_type: 'socio', extra_high_demand_slots: 0 }) },
      masterMatch: { findUnique: jest.fn().mockResolvedValue(match), update: jest.fn() },
      court: { findUnique: jest.fn().mockResolvedValue({ id: 'c1', is_active: true, name: 'Cancha 1' }) },
      systemConfig: { findUnique: jest.fn().mockResolvedValue({ value: 'verano' }) },
      reservation: {
        findFirst: jest.fn().mockResolvedValue(overrides.slotBusy ?? null),
        count: jest.fn().mockResolvedValue(0),
      },
      $transaction: jest.fn().mockResolvedValue([]),
    };
    return { service: new MasterService(prisma), prisma };
  }

  it('rechaza si el slot ya está ocupado', async () => {
    const { service } = build({ slotBusy: { id: 'r9' } });
    await expect(service.scheduleMatch('m1', 'u1', futureDate, 'c1')).rejects.toThrow(BadRequestException);
  });

  it('crea la reserva en una transacción cuando el slot está libre', async () => {
    const { service, prisma } = build();
    await service.scheduleMatch('m1', 'u1', futureDate, 'c1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('sin courtId solo agenda la fecha (sin reserva)', async () => {
    const { service, prisma } = build();
    await service.scheduleMatch('m1', 'u1', futureDate);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.masterMatch.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { scheduled_date: futureDate } });
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx jest --forceExit src/master/master.service.spec.ts`
Expected: FAIL (la firma actual no acepta `courtId` y no usa `$transaction`).

- [ ] **Step 3: Imports y constante en `master.service.ts`**

Al tope del archivo, junto a los imports existentes, agregar:

```ts
import { toChileDateStr, chileWeekBoundsFromStr } from '../common/dates';
```

Después del bloque `CATEGORY_RANGES` (constante existente), agregar (tercera copia sincronizada con challenges/reservations — ver CLAUDE.md):

```ts
// Slots de alta demanda (mantener sincronizado con challenges.service y reservations.service)
const HIGH_DEMAND: Record<string, string[]> = {
  verano:   ['07:45', '09:30', '18:15', '20:00'],
  invierno: ['09:30', '11:15', '16:30', '18:15'],
};
```

- [ ] **Step 4: Reemplazar el método `scheduleMatch` completo**

Reemplazar el método actual (`async scheduleMatch(matchId, userId, scheduledDate) { ... }`, ~líneas 205-246) por:

```ts
  async scheduleMatch(matchId: string, userId: string, scheduledDate: Date, courtId?: string) {
    const player = await this.prisma.player.findUnique({ where: { user_id: userId }, include: { children: true } });
    if (!player) throw new BadRequestException('Jugador no encontrado');

    const match = await this.prisma.masterMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true, season: { select: { category: true } } }
    });

    if (!match) throw new NotFoundException('Partido no encontrado');
    if (match.status === 'completed') throw new BadRequestException('Este partido ya está completado');
    if (match.player1_id !== player.id && match.player2_id !== player.id) {
      throw new BadRequestException('Solo los jugadores del partido pueden fijar la fecha');
    }
    if (scheduledDate <= new Date()) throw new BadRequestException('La fecha debe ser en el futuro');

    const setter = match.player1_id === player.id ? match.player1 : match.player2;
    const other  = match.player1_id === player.id ? match.player2 : match.player1;

    // ── Reserva automática (si se eligió cancha) ──────────────────────────────
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (!court || !court.is_active) throw new BadRequestException('Cancha no disponible.');

      const timeStr = scheduledDate.toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago'
      });
      const [h, m] = timeStr.split(':');
      const slot = `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;
      const chileDate = toChileDateStr(scheduledDate);
      const dateChile = new Date(`${chileDate}T00:00:00`);

      // Slot ocupado por otra reserva (que no sea de este partido)
      const slotBusy = await this.prisma.reservation.findFirst({
        where: { court_id: courtId, date: dateChile, time_slot: slot, status: 'active', NOT: { master_match_id: matchId } }
      });
      if (slotBusy) throw new BadRequestException('Ese horario ya está ocupado en esa cancha.');

      // Otra reserva activa del jugador (OR explícito por master_match_id nullable)
      const otherActive = await this.prisma.reservation.findFirst({
        where: {
          player_id: player.id,
          status: 'active',
          OR: [ { master_match_id: null }, { master_match_id: { not: matchId } } ],
        }
      });
      if (otherActive) throw new BadRequestException('Ya tienes una reserva activa. Cancélala antes de fijar fecha.');

      // Cupo de alta demanda
      const config = await this.prisma.systemConfig.findUnique({ where: { key: 'season' } });
      const season = config?.value || 'verano';
      const isHighDemand = HIGH_DEMAND[season]?.includes(slot) ?? false;

      if (isHighDemand) {
        const { weekStart, weekEnd } = chileWeekBoundsFromStr(chileDate);
        const playerIds   = [player.id, ...(player.children?.map(c => c.id) || [])];
        const extraSlots  = player.extra_high_demand_slots ?? 0;
        const familyLimit = player.member_type === 'hijo_socio' ? 1 : 2 + (player.children?.length || 0) + extraSlots;
        const used = await this.prisma.reservation.count({
          where: { player_id: { in: playerIds }, is_high_demand: true, status: 'active', date: { gte: weekStart, lte: weekEnd }, NOT: { master_match_id: matchId } }
        });
        if (used >= familyLimit) throw new BadRequestException(`Ya usaste los ${familyLimit} turnos de alta demanda de esta semana.`);
      }

      // Cancelar reserva anterior de este partido + crear la nueva + fijar fecha, atómico.
      try {
        await this.prisma.$transaction([
          this.prisma.reservation.updateMany({
            where: { master_match_id: matchId, status: 'active' },
            data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Fecha reprogramada' }
          }),
          this.prisma.reservation.create({
            data: {
              player_id:       player.id,
              court_id:        courtId,
              date:            dateChile,
              time_slot:       slot,
              is_high_demand:  isHighDemand,
              has_guest:       false,
              partner_name:    other.name,
              is_master:       true,
              master_match_id: matchId,
              status:          'active',
            }
          }),
          this.prisma.masterMatch.update({ where: { id: matchId }, data: { scheduled_date: scheduledDate } }),
        ]);
      } catch (e: any) {
        if (e?.code === 'P2002') throw new BadRequestException('Ese horario ya está ocupado en esa cancha.');
        throw e;
      }
    } else {
      await this.prisma.masterMatch.update({ where: { id: matchId }, data: { scheduled_date: scheduledDate } });
    }

    // ── Notificaciones (fire-and-forget) ──────────────────────────────────────
    const cap     = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const weekday = scheduledDate.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' });
    const day     = scheduledDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
    const hour    = scheduledDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
    const formattedDate = `${cap(weekday)} ${day} — ${hour} hrs`;

    let courtName = '';
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (court) courtName = ` · ${court.name}`;
    }

    this.notifyAsync(async () => {
      await this.sendWsp(
        other.phone,
        `🏆 *Master CTG*\n\n📅 *${setter.name}* agendó el partido:\n\n*${formattedDate}*${courtName}\n\nSi no puedes, coordina con tu rival.`
      );
      await this.sleep(500);
      await this.sendWspGroup(
        `🏆 *Master CTG — Categoría ${match.season.category}*\n\n⚔️ *${match.player1.name}* vs *${match.player2.name}*\n📅 ${formattedDate}${courtName}`
      );
    });

    return this.prisma.masterMatch.findUnique({
      where: { id: matchId },
      include: { player1: true, player2: true, winner: true }
    });
  }
```

- [ ] **Step 5: Controller pasa `court_id`**

En `src/master/master.controller.ts`, reemplazar el handler `scheduleMatch`:

```ts
  @Patch('matches/:id/schedule')
  scheduleMatch(
    @Param('id') id: string,
    @Headers('authorization') auth: string,
    @Body() body: { scheduled_date: string; court_id?: string }
  ) {
    const userId = this.getUserId(auth);
    return this.masterService.scheduleMatch(id, userId, new Date(body.scheduled_date), body.court_id);
  }
```

- [ ] **Step 6: Verificar**

Run: `npx jest --forceExit src/master/master.service.spec.ts`
Expected: PASS (3 tests).

Run: `npx tsc -p tsconfig.build.json --noEmit; echo exit:$?`
Expected: exit:0.

- [ ] **Step 7: Commit**

```bash
git add src/master/master.service.ts src/master/master.controller.ts src/master/master.service.spec.ts
git commit -m "feat: agendar partido de Master crea reserva, bloquea slot y notifica (rival + grupo)"
```

---

## Task 3: Backend — liberar la reserva al completar / borrar temporada

**Files:**
- Modify: `src/master/master.service.ts` (`processMasterResult`, `deleteSeason`)

- [ ] **Step 1: Liberar en `processMasterResult`**

En `processMasterResult`, inmediatamente después del `await this.prisma.masterMatch.update({ ... status: 'completed' ... })` (el que marca completado, ~línea 351), agregar:

```ts
    // Liberar la reserva del partido (igual que el desafío)
    await this.prisma.reservation.updateMany({
      where: { master_match_id: matchId, status: 'active' },
      data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Partido completado' }
    });
```

- [ ] **Step 2: Liberar en `deleteSeason`**

Reemplazar el método `deleteSeason` por:

```ts
  async deleteSeason(seasonId: string) {
    const matches = await this.prisma.masterMatch.findMany({ where: { season_id: seasonId }, select: { id: true } });
    const matchIds = matches.map(m => m.id);
    if (matchIds.length) {
      await this.prisma.reservation.updateMany({
        where: { master_match_id: { in: matchIds }, status: 'active' },
        data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Torneo eliminado' }
      });
    }
    await this.prisma.masterMatch.deleteMany({ where: { season_id: seasonId } });
    const groups = await this.prisma.masterGroup.findMany({ where: { season_id: seasonId } });
    for (const group of groups) {
      await this.prisma.masterGroupPlayer.deleteMany({ where: { group_id: group.id } });
    }
    await this.prisma.masterGroup.deleteMany({ where: { season_id: seasonId } });
    await this.prisma.masterSeason.delete({ where: { id: seasonId } });
    return { message: 'Torneo eliminado' };
  }
```

- [ ] **Step 3: Verificar**

Run: `npx tsc -p tsconfig.build.json --noEmit; echo exit:$?`
Expected: exit:0.

Run: `npx jest --forceExit`
Expected: todos los suites PASS.

- [ ] **Step 4: Commit**

```bash
git add src/master/master.service.ts
git commit -m "feat: liberar reserva de Master al completar el partido o borrar la temporada"
```

---

## Task 4: Backend — exponer `is_master` y categoría en el fixture

**Files:**
- Modify: `src/reservations/reservations.service.ts` (`getAvailability`)

- [ ] **Step 1: Incluir la relación en la query**

En `getAvailability`, en la query de `reservations` (la que tiene `include: { player: {...}, court: true }`), agregar al `include`:

```ts
                master_match: { select: { season: { select: { category: true } } } },
```

quedando:

```ts
        const reservations = await this.prisma.reservation.findMany({
            where: { date: new Date(date), status: { in: ['active', 'completed'] } },
            include: {
                player: { select: { id: true, name: true } },
                court: true,
                master_match: { select: { season: { select: { category: true } } } },
            }
        });
```

- [ ] **Step 2: Agregar `is_master` y `master_category` al objeto del slot**

En el objeto `reservation: existing ? { ... } : null` (dentro del `.map` de slots, junto a `is_challenge`), agregar:

```ts
                            is_master:       existing.is_master || false,
                            master_category: existing.master_match?.season?.category ?? null,
```

- [ ] **Step 3: Verificar**

Run: `npx tsc -p tsconfig.build.json --noEmit; echo exit:$?`
Expected: exit:0.

- [ ] **Step 4: Commit**

```bash
git add src/reservations/reservations.service.ts
git commit -m "feat: fixture expone is_master y categoría del torneo para reservas de Master"
```

---

## Task 5: Frontend — selector de cancha al agendar Master

**Files (en `/Users/javiermontre/Documents/CTG/CTG-API-ESCALERILLA/frontend`):**
- Modify: `app/master/page.tsx` (`MasterScheduleModal`, `MatchCard` prop, `handleSchedule`)

- [ ] **Step 1: `handleSchedule` envía `court_id`**

En `app/master/page.tsx`, reemplazar `handleSchedule`:

```ts
  const handleSchedule = async (matchId: string, isoDate: string, courtId: string) => {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/master/matches/${matchId}/schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ scheduled_date: isoDate, court_id: courtId }),
    });
    if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.message || 'Error al fijar fecha'); }
    onRefresh();
  };
```

- [ ] **Step 2: Tipos de `onSchedule` en `MatchCard` y en el modal**

En la firma de `MatchCard` (`function MatchCard({ ... }: { ... onSchedule: (matchId: string, isoDate: string) => Promise<void>; ... })`), cambiar a:

```ts
  onSchedule: (matchId: string, isoDate: string, courtId: string) => Promise<void>;
```

En el uso del modal dentro de `MatchCard`, cambiar:

```tsx
        <MasterScheduleModal match={match} onClose={() => setShowSchedule(false)}
          onSubmit={(iso, courtId) => onSchedule(match.id, iso, courtId)} minDate={minDate} maxDate={maxDate} />
```

- [ ] **Step 3: Agregar selección de cancha a `MasterScheduleModal`**

Cambiar la firma del componente y su estado:

```tsx
function MasterScheduleModal({ match, onClose, onSubmit, minDate, maxDate }: {
  match: MasterMatchExt; onClose: () => void; onSubmit: (iso: string, courtId: string) => Promise<void>;
  minDate: Date; maxDate: Date;
}) {
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<string | null>(null);
  const [courts, setCourts] = useState<{ id: string; name: string }[]>([]);
  const [selectedCourt, setSelectedCourt] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');
  const now = new Date();

  useEffect(() => { api.getCourts().then(setCourts).catch(() => setCourts([])); }, []);
```

(Asegurar que `useEffect` y `api` estén importados al tope de `app/master/page.tsx`: `import { useState, useEffect } from 'react';` y `import { api } from '@/lib/api';` — agregar lo que falte.)

Reemplazar `handleSubmit` del modal por:

```tsx
  const handleSubmit = async () => {
    setError('');
    if (!selectedDate || !selectedSlot) { setError('Debes seleccionar fecha y horario.'); return; }
    if (!selectedCourt) { setError('Debes seleccionar una cancha.'); return; }
    const [h, m] = selectedSlot.split(':').map(Number);
    const final = new Date(selectedDate); final.setHours(h, m, 0, 0);
    if (final <= now) { setError('El horario seleccionado ya pasó.'); return; }
    if (final > maxDate) { setError('La fecha supera el límite del round.'); return; }
    setLoading(true);
    try { await onSubmit(final.toISOString(), selectedCourt); onClose(); }
    catch (err: any) { setError(err.message || 'Error al fijar la fecha.'); }
    finally { setLoading(false); }
  };
```

Agregar el bloque de selección de cancha en el JSX, justo después del bloque de selección de horario (el `<div>` que contiene "Selecciona el horario" y termina antes del resumen `selectedDate && selectedSlot && ...`):

```tsx
          <div>
            <p className={`text-sm font-semibold mb-3 flex items-center gap-1 ${selectedSlot ? 'text-gray-700' : 'text-gray-400'}`}>
              <span className={`w-5 h-5 rounded-full text-xs flex items-center justify-center font-bold ${selectedSlot ? 'bg-ctg-green text-white' : 'bg-gray-200 text-gray-400'}`}>3</span>
              Selecciona la cancha
            </p>
            {!selectedSlot ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 py-6 text-center text-gray-400 text-sm">Primero elige un horario</div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {courts.map(c => (
                  <button key={c.id} type="button" onClick={() => { setSelectedCourt(c.id); setError(''); }}
                    className={`py-3 px-2 rounded-xl text-sm font-semibold border-2 transition-all
                      ${selectedCourt === c.id ? 'bg-ctg-dark border-ctg-dark text-white shadow-md' : 'bg-ctg-light/40 border-ctg-light text-ctg-dark hover:border-ctg-green'}`}>
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit; echo exit:$?` (en el directorio del frontend)
Expected: exit:0.

- [ ] **Step 5: Commit**

```bash
git add app/master/page.tsx
git commit -m "feat: elegir cancha al agendar partido de Master"
```

---

## Task 6: Frontend — etiqueta "Master" en el fixture

**Files (frontend):**
- Modify: `app/fixture-reservas/page.tsx`

- [ ] **Step 1: Declarar `isMaster` / `masterCat`**

En `app/fixture-reservas/page.tsx`, reemplazar:

```tsx
                        const isChallenge   = s.reservation?.is_challenge;
                        const isBlocked     = !s.reservation;
```

por:

```tsx
                        const isChallenge   = s.reservation?.is_challenge;
                        const isMaster      = s.reservation?.is_master;
                        const masterCat     = s.reservation?.master_category;
                        const isBlocked     = !s.reservation;
```

- [ ] **Step 2: Resaltado de fila (opcional, consistencia visual)**

Reemplazar el `className` de la fila:

```tsx
                          <div key={s.slot} className={`flex items-center justify-between px-5 py-3 ${isChallenge ? 'bg-blue-50/50' : ''} ${isBlocked ? 'bg-gray-50/50' : ''} ${isToday && isPast(s.slot) ? 'opacity-50' : ''}`}>
```

por:

```tsx
                          <div key={s.slot} className={`flex items-center justify-between px-5 py-3 ${isChallenge ? 'bg-blue-50/50' : ''} ${isMaster ? 'bg-amber-50/50' : ''} ${isBlocked ? 'bg-gray-50/50' : ''} ${isToday && isPast(s.slot) ? 'opacity-50' : ''}`}>
```

- [ ] **Step 3: Badge Master + etiqueta "vs"**

Reemplazar el badge de desafío:

```tsx
                                    {isChallenge && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">⚔️ Desafío</span>
                                    )}
```

por:

```tsx
                                    {isChallenge && (
                                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">⚔️ Desafío</span>
                                    )}
                                    {isMaster && (
                                      <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">🏆 Master Categoría {masterCat}</span>
                                    )}
```

Y reemplazar la línea del `partner_name` para que el Master también diga "vs":

```tsx
                                      {isChallenge ? 'vs' : 'con'} {s.reservation.partner_name}
```

por:

```tsx
                                      {(isChallenge || isMaster) ? 'vs' : 'con'} {s.reservation.partner_name}
```

- [ ] **Step 4: Verificar tipos**

Run: `npx tsc --noEmit; echo exit:$?`
Expected: exit:0. (Si el tipo del slot/reservation es explícito y no tiene `is_master`/`master_category`, agregarlos como opcionales en su interfaz en `types/` o en el tipo inline correspondiente — el grid usa `s: any`, así que probablemente no haga falta.)

- [ ] **Step 5: Commit**

```bash
git add app/fixture-reservas/page.tsx
git commit -m "feat: fixture muestra etiqueta Master Categoría en reservas de Master"
```

---

## Verificación final (manual, en staging tras push de `dev` en ambos repos)

- Agendar un partido de Master eligiendo cancha → aparece en el fixture como "🏆 Master Categoría X", el slot queda bloqueado (no reservable por otro), y llega WhatsApp al rival y al grupo con día/hora/cancha.
- Reprogramar el mismo partido a otro slot → la reserva anterior se cancela y el slot viejo se libera.
- Cargar el resultado del partido → el slot se libera.
- Borrar la temporada (admin) → los slots de sus partidos se liberan.
- Un partido agendado sin elegir cancha (si el flujo lo permitiera) → solo queda la fecha, sin reserva (comportamiento previo).
