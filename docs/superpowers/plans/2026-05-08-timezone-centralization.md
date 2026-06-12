# Timezone Centralization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralizar toda la lógica de timezone en `src/common/dates.ts`, eliminando duplicación y parsing frágil, sin cambiar comportamiento en producción.

**Architecture:** Se crea un único archivo de utilidades de fechas con 5 funciones puras. Cada servicio que hoy define `nowInChile()` localmente importa desde ese archivo. La firma de `checkHighDemandLimit` cambia de `Date` a `string` para evitar conversión UTC→Chile incorrecta cerca de medianoche.

**Tech Stack:** NestJS 11, TypeScript 5, Jest 30, Node.js 20 (UTC timezone en Railway/Docker)

---

## Mapa de archivos

| Acción | Archivo | Qué cambia |
|--------|---------|-----------|
| **Crear** | `src/common/dates.ts` | Nuevas utilidades de timezone |
| **Crear** | `src/common/dates.spec.ts` | Tests unitarios de dates.ts |
| **Modificar** | `src/cron/challenges-cron.service.ts` | Eliminar `nowInChile()` local, importar |
| **Modificar** | `src/reservations/reservations.service.ts` | Eliminar `nowInChile()` y `getWeekBounds`, cambiar firma de `checkHighDemandLimit`, usar `monthBoundsUTC` |
| **Modificar** | `src/challenges/challenges.service.ts` | Reemplazar parsing `es-CL` y `weekStart/weekEnd` inline |

---

## Task 1: Tests para `dates.ts`

**Files:**
- Create: `src/common/dates.spec.ts`

- [ ] **Step 1: Crear el archivo de tests**

```typescript
// src/common/dates.spec.ts
import {
  toChileDateStr,
  currentChileDate,
  chileWeekBoundsFromStr,
  monthBoundsUTC,
} from './dates';

describe('toChileDateStr', () => {
  it('returns YYYY-MM-DD for UTC noon (same day in Chile always)', () => {
    const date = new Date('2026-05-08T12:00:00Z');
    expect(toChileDateStr(date)).toBe('2026-05-08');
  });

  it('returns Chile date when UTC 02:00 (still previous day in Chile)', () => {
    // UTC 02:00 → Chile UTC-3 = 23:00 previous day, UTC-4 = 22:00 previous day
    const date = new Date('2026-05-08T02:00:00Z');
    expect(toChileDateStr(date)).toBe('2026-05-07');
  });
});

describe('currentChileDate', () => {
  it('returns a string matching YYYY-MM-DD', () => {
    expect(currentChileDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('chileWeekBoundsFromStr', () => {
  // 2026-05-06 is a Wednesday (verified: Jan 1 2026 = Thursday, +125 days = Wednesday)
  it('returns Monday to Sunday for a Wednesday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-06');
    expect(weekStart.toISOString().split('T')[0]).toBe('2026-05-04'); // Monday
    expect(weekEnd.toISOString().split('T')[0]).toBe('2026-05-10');   // Sunday
  });

  it('returns same week when date is Monday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-04');
    expect(weekStart.toISOString().split('T')[0]).toBe('2026-05-04');
    expect(weekEnd.toISOString().split('T')[0]).toBe('2026-05-10');
  });

  it('returns same week when date is Sunday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-10');
    expect(weekStart.toISOString().split('T')[0]).toBe('2026-05-04');
    expect(weekEnd.toISOString().split('T')[0]).toBe('2026-05-10');
  });

  it('weekEnd is set to 23:59:59.999', () => {
    const { weekEnd } = chileWeekBoundsFromStr('2026-05-06');
    expect(weekEnd.getHours()).toBe(23);
    expect(weekEnd.getMinutes()).toBe(59);
    expect(weekEnd.getSeconds()).toBe(59);
    expect(weekEnd.getMilliseconds()).toBe(999);
  });

  it('weekStart is at start of day (00:00:00.000)', () => {
    const { weekStart } = chileWeekBoundsFromStr('2026-05-06');
    expect(weekStart.getHours()).toBe(0);
    expect(weekStart.getMinutes()).toBe(0);
    expect(weekStart.getSeconds()).toBe(0);
  });
});

describe('monthBoundsUTC', () => {
  it('returns correct UTC bounds for May 2026 (month index 4)', () => {
    const { start, end } = monthBoundsUTC(2026, 4);
    expect(start.toISOString()).toBe('2026-05-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-05-31T23:59:59.999Z');
  });

  it('handles December correctly (month index 11)', () => {
    const { start, end } = monthBoundsUTC(2026, 11);
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });

  it('handles February in non-leap year (2026)', () => {
    const { start, end } = monthBoundsUTC(2026, 1);
    expect(start.toISOString()).toBe('2026-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2026-02-28T23:59:59.999Z');
  });

  it('handles February in leap year (2024)', () => {
    const { start, end } = monthBoundsUTC(2024, 1);
    expect(start.toISOString()).toBe('2024-02-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2024-02-29T23:59:59.999Z');
  });
});
```

- [ ] **Step 2: Ejecutar los tests — deben fallar porque `dates.ts` no existe aún**

```bash
npx jest src/common/dates.spec.ts --no-coverage
```

Resultado esperado: `FAIL` con `Cannot find module './dates'`

---

## Task 2: Crear `src/common/dates.ts`

**Files:**
- Create: `src/common/dates.ts`

- [ ] **Step 1: Crear el archivo**

```typescript
// src/common/dates.ts

/**
 * Hora actual en Chile como Date "naive": los números del reloj chileno
 * almacenados como si fueran UTC. Permite comparaciones directas con
 * time_slots construidos de la misma manera (sin zona horaria).
 * Solo usar para comparaciones directas con otros valores naive.
 * NO pasar como argumento a toChileDateStr().
 */
export function nowInChile(): Date {
  const now = new Date();
  return new Date(
    now.toLocaleDateString('sv', { timeZone: 'America/Santiago' }) + 'T' +
    now.toLocaleTimeString('sv', { timeZone: 'America/Santiago' }),
  );
}

/**
 * Convierte un timestamp UTC real a fecha Chile en formato YYYY-MM-DD.
 * Usa en-CA que garantiza ese formato por spec ECMAScript (a diferencia
 * de es-CL cuyo formato puede variar entre versiones de Node.js).
 * NO usar con fechas naive producidas por nowInChile().
 */
export function toChileDateStr(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/**
 * Fecha de hoy en Chile en formato YYYY-MM-DD.
 */
export function currentChileDate(): string {
  return toChileDateStr(new Date());
}

/**
 * Rango lunes-domingo (Chile) a partir de una fecha Chile en YYYY-MM-DD.
 * Produce fechas naive (UTC-midnight representando días Chile) compatibles
 * con los campos @db.Date de Prisma (almacenados como UTC midnight).
 */
export function chileWeekBoundsFromStr(chileDate: string): { weekStart: Date; weekEnd: Date } {
  const d = new Date(`${chileDate}T00:00:00`);
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

/**
 * Inicio y fin de mes en UTC puro para queries Prisma sobre campos @db.Date.
 * month es índice 0-based (0 = enero, 11 = diciembre).
 * Reemplaza new Date(year, mon, 1) que usa la zona local del servidor.
 */
export function monthBoundsUTC(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end:   new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  };
}
```

- [ ] **Step 2: Ejecutar los tests — deben pasar todos**

```bash
npx jest src/common/dates.spec.ts --no-coverage
```

Resultado esperado: `PASS` con 10 tests en verde.

- [ ] **Step 3: Commit**

```bash
git add src/common/dates.ts src/common/dates.spec.ts
git commit -m "feat: centralizar utilidades de timezone en dates.ts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 3: Actualizar `challenges-cron.service.ts`

**Files:**
- Modify: `src/cron/challenges-cron.service.ts`

- [ ] **Step 1: Eliminar la función local y agregar el import**

Reemplazar las líneas 17-23 (función `nowInChile` local):

```typescript
// ELIMINAR este bloque completo (líneas 17-23):
function nowInChile(): Date {
    const now = new Date();
    return new Date(
        now.toLocaleDateString('sv', { timeZone: 'America/Santiago' }) + 'T' +
        now.toLocaleTimeString('sv', { timeZone: 'America/Santiago' }),
    );
}
```

Agregar el import en la parte superior del archivo (después de los imports existentes):

```typescript
import { nowInChile } from '../common/dates';
```

- [ ] **Step 2: Compilar para verificar sin errores**

```bash
npm run build 2>&1 | grep -E "error|Error" | head -20
```

Resultado esperado: sin errores relacionados con `dates` o `cron`.

- [ ] **Step 3: Ejecutar tests existentes**

```bash
npx jest --no-coverage
```

Resultado esperado: todos los tests en verde (el único test existente es `app.controller.spec.ts`).

- [ ] **Step 4: Commit**

```bash
git add src/cron/challenges-cron.service.ts
git commit -m "refactor: importar nowInChile desde dates.ts en cron service

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 4: Actualizar `reservations.service.ts`

**Files:**
- Modify: `src/reservations/reservations.service.ts`

Este es el archivo con más cambios. Hacerlos en orden para no romper nada.

- [ ] **Step 1: Agregar el import en la parte superior**

Después de la línea `import { AppLogger } from '../common/app.logger';`, agregar:

```typescript
import { nowInChile, toChileDateStr, currentChileDate, chileWeekBoundsFromStr, monthBoundsUTC } from '../common/dates';
```

- [ ] **Step 2: Eliminar la función local `nowInChile` (líneas 21-27)**

Eliminar este bloque completo:

```typescript
function nowInChile(): Date {
    const now = new Date();
    return new Date(
        now.toLocaleDateString('sv', { timeZone: 'America/Santiago' }) + 'T' +
        now.toLocaleTimeString('sv', { timeZone: 'America/Santiago' }),
    );
}
```

- [ ] **Step 3: Corregir `getAllReservations` — rangos de mes (línea 171)**

Reemplazar:
```typescript
where.date = { gte: new Date(year, mon, 1), lte: new Date(year, mon + 1, 0, 23, 59, 59, 999) };
```

Con:
```typescript
const { start: monthRangeStart, end: monthRangeEnd } = monthBoundsUTC(year, mon);
where.date = { gte: monthRangeStart, lte: monthRangeEnd };
```

- [ ] **Step 4: Corregir `getLightSummary` — rangos de mes (líneas 217-218)**

Reemplazar:
```typescript
const start = new Date(year, mon, 1);
const end   = new Date(year, mon + 1, 0, 23, 59, 59, 999);
```

Con:
```typescript
const { start, end } = monthBoundsUTC(year, mon);
```

- [ ] **Step 5: Corregir `getStats` — rangos de mes (líneas 272-280)**

Reemplazar:
```typescript
const year  = month ? parseInt(month.split('-')[0]) : now.getFullYear();
const mon   = month ? parseInt(month.split('-')[1]) - 1 : now.getMonth();

const monthStart = new Date(year, mon, 1);
const monthEnd   = new Date(year, mon + 1, 0, 23, 59, 59, 999);

// Mes anterior para comparación
const prevStart = new Date(year, mon - 1, 1);
const prevEnd   = new Date(year, mon, 0, 23, 59, 59, 999);
```

Con:
```typescript
const year  = month ? parseInt(month.split('-')[0]) : now.getUTCFullYear();
const mon   = month ? parseInt(month.split('-')[1]) - 1 : now.getUTCMonth();

const { start: monthStart, end: monthEnd } = monthBoundsUTC(year, mon);

// Mes anterior para comparación
const { start: prevStart, end: prevEnd } = monthBoundsUTC(year, mon - 1);
```

- [ ] **Step 6: Corregir `getWeeklyUsageForPlayer` — semana actual (línea 765)**

Reemplazar:
```typescript
const { weekStart, weekEnd } = this.getWeekBounds(new Date());
```

Con:
```typescript
const { weekStart, weekEnd } = chileWeekBoundsFromStr(currentChileDate());
```

- [ ] **Step 7: Eliminar el método privado `getWeekBounds` (líneas 754-762)**

Eliminar este bloque completo:

```typescript
private getWeekBounds(date: Date) {
    const weekStart = new Date(date);
    weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    return { weekStart, weekEnd };
}
```

- [ ] **Step 8: Cambiar firma de `checkHighDemandLimit` (línea 795) y sus callers**

Cambiar la firma del método:
```typescript
// ANTES:
private async checkHighDemandLimit(player: any, date: Date) {
    const { weekStart, weekEnd } = this.getWeekBounds(date);

// DESPUÉS:
private async checkHighDemandLimit(player: any, dateStr: string) {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr(dateStr);
```

Actualizar el caller en `create()` (línea 489):
```typescript
// ANTES:
if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, reservationDate);

// DESPUÉS:
if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, data.date);
```

Actualizar el caller en `modify()` (línea 651):
```typescript
// ANTES:
if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, reservationDate);

// DESPUÉS:
if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, data.date);
```

- [ ] **Step 9: Compilar para verificar**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Resultado esperado: sin errores de TypeScript en `reservations.service.ts`.

- [ ] **Step 10: Ejecutar todos los tests**

```bash
npx jest --no-coverage
```

Resultado esperado: todos en verde.

- [ ] **Step 11: Commit**

```bash
git add src/reservations/reservations.service.ts
git commit -m "refactor: centralizar timezone y corregir week/month bounds en reservations

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 5: Actualizar `challenges.service.ts`

**Files:**
- Modify: `src/challenges/challenges.service.ts`

- [ ] **Step 1: Agregar el import**

Después del import existente de `date-fns`:
```typescript
import { toChileDateStr, chileWeekBoundsFromStr } from '../common/dates';
```

- [ ] **Step 2: Reemplazar el parsing frágil de fecha en `scheduleMatch` (líneas 200-203)**

Reemplazar:
```typescript
const dateParts = scheduledDate.toLocaleDateString('es-CL', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Santiago'
}).split('-');
const dateChile = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T00:00:00`);
```

Con:
```typescript
const chileDate = toChileDateStr(scheduledDate);
const dateChile = new Date(`${chileDate}T00:00:00`);
```

- [ ] **Step 3: Reemplazar el cálculo inline de weekStart/weekEnd (líneas 225-228)**

Reemplazar:
```typescript
const weekStart = new Date(dateChile);
weekStart.setDate(dateChile.getDate() - ((dateChile.getDay()+6)%7));
weekStart.setHours(0,0,0,0);
const weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate()+6); weekEnd.setHours(23,59,59,999);
```

Con:
```typescript
const { weekStart, weekEnd } = chileWeekBoundsFromStr(chileDate);
```

- [ ] **Step 4: Compilar para verificar**

```bash
npm run build 2>&1 | grep -E "error TS" | head -20
```

Resultado esperado: sin errores en `challenges.service.ts`.

- [ ] **Step 5: Ejecutar todos los tests**

```bash
npx jest --no-coverage
```

Resultado esperado: todos en verde.

- [ ] **Step 6: Commit**

```bash
git add src/challenges/challenges.service.ts
git commit -m "refactor: corregir parsing de fecha Chile en scheduleMatch

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Task 6: Verificación final

- [ ] **Step 1: Build completo limpio**

```bash
npm run build 2>&1 | tail -5
```

Resultado esperado: termina sin errores relevantes (los warnings de `as any` son esperados).

- [ ] **Step 2: Todos los tests en verde**

```bash
npx jest --no-coverage
```

Resultado esperado: `Tests: X passed, X total` con 0 failed.

- [ ] **Step 3: Verificar que el servidor arranca en dev**

```bash
npm run start:dev &
sleep 8
curl -s http://localhost:3000/ | head -5
kill %1
```

Resultado esperado: el servidor arranca sin errores de timezone.

- [ ] **Step 4: Actualizar CLAUDE.md — corregir la sección de `chileWeekBounds`**

En `CLAUDE.md`, buscar la mención de `chileWeekBounds` (en la sección de funciones de `dates.ts`) y actualizar el nombre a `chileWeekBoundsFromStr`. El CLAUDE.md menciona la función con nombre incorrecto ya que el diseño evolucionó.

En la sección "Invariantes Críticos / Timezone Chile", reemplazar el bloque de código de ejemplo con:

```typescript
// src/common/dates.ts — punto único de verdad para timezone
import { nowInChile, toChileDateStr, currentChileDate, chileWeekBoundsFromStr, monthBoundsUTC } from '../common/dates';

// nowInChile(): para comparar con time_slots naive (cron, cancelaciones)
// toChileDateStr(date): para convertir timestamp UTC → fecha Chile (scheduleMatch)
// currentChileDate(): para obtener hoy en Chile como YYYY-MM-DD
// chileWeekBoundsFromStr(dateStr): para rangos de semana desde string Chile
// monthBoundsUTC(year, mon): para rangos de mes en queries Prisma @db.Date
```

- [ ] **Step 5: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: actualizar CLAUDE.md con API final de dates.ts

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Notas para el ejecutor

**El cambio más importante a entender:** `checkHighDemandLimit` cambia su segundo parámetro de `Date` a `string`. Esto es necesario porque pasar `new Date("2026-05-08")` (UTC midnight) a `chileWeekBoundsFromStr` a través de `toChileDateStr` daría "2026-05-07" (Chile es UTC-3 a medianoche UTC), computando la semana equivocada. Al pasar `data.date` ("2026-05-08") directamente como string se evita esta conversión doble.

**No hacer:** No renombrar ni mover `formatReservationDate()` en `reservations.service.ts` — es una función local de ese archivo, no necesita centralizarse.

**No hacer:** No cambiar las constantes `HIGH_DEMAND_SLOTS` duplicadas — es un problema separado fuera del alcance de este plan.
