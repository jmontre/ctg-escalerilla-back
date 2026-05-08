# Diseño: Centralización de lógica de timezone

**Fecha:** 2026-05-08  
**Estado:** Aprobado  
**Alcance:** Solo backend — sin cambios en schema, API, ni frontend

---

## Problema

La lógica de timezone está duplicada y en algunos casos frágil:

1. `nowInChile()` está copiada textualmente en dos archivos:
   - `src/reservations/reservations.service.ts:21`
   - `src/cron/challenges-cron.service.ts:17`
   Si se cambia en uno y se olvida el otro, cron y cancelaciones usarían horas distintas.

2. En `challenges.service.ts scheduleMatch`, el parsing de fecha depende del formato de `es-CL` locale:
   ```ts
   // Fragile: el formato de es-CL puede variar entre versiones de Node.js
   const dateParts = scheduledDate.toLocaleDateString('es-CL', {
     year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Santiago'
   }).split('-');
   const dateChile = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T00:00:00`);
   ```
   `en-CA` garantiza `YYYY-MM-DD` por spec; `es-CL` no.

3. `getWeekBounds` en `reservations.service.ts` usa `setHours(0,0,0,0)` (zona local del servidor). Funciona en Railway/UTC pero no es explícito.

4. Los rangos de mes en `getStats` usan `new Date(year, mon, 1)` (zona local). En Railway/UTC produce el mismo resultado que UTC, pero no es explícito y podría fallar en otro entorno.

---

## Solución: Opción B (centralizar + corregir semanas y meses)

### Archivo nuevo: `src/common/dates.ts`

```ts
/**
 * Hora actual en Chile como Date "naive" (los números del reloj chileno
 * almacenados como si fueran UTC). Permite comparaciones consistentes con
 * time_slots que también se tratan como naive.
 * Funciona correctamente cuando el servidor corre en UTC (Railway/Docker).
 */
export function nowInChile(): Date {
  const now = new Date();
  return new Date(
    now.toLocaleDateString('sv', { timeZone: 'America/Santiago' }) + 'T' +
    now.toLocaleTimeString('sv', { timeZone: 'America/Santiago' }),
  );
}

/**
 * Fecha en Chile en formato YYYY-MM-DD. Usa en-CA que garantiza ese formato
 * por spec (a diferencia de es-CL cuyo formato puede variar).
 */
export function toChileDateStr(date: Date): string {
  return date.toLocaleDateString('en-CA', { timeZone: 'America/Santiago' });
}

/**
 * Rango lunes-domingo en zona Chile naive.
 * Reemplaza el getWeekBounds privado de ReservationsService.
 */
export function chileWeekBounds(date: Date): { weekStart: Date; weekEnd: Date } {
  const dateStr = toChileDateStr(date);
  const d = new Date(`${dateStr}T00:00:00`);
  const weekStart = new Date(d);
  weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  return { weekStart, weekEnd };
}

/**
 * Inicio y fin de mes en UTC puro, para queries Prisma sobre campos @db.Date
 * (que se almacenan como UTC midnight). Reemplaza new Date(year, mon, 1) que
 * usa la zona local del servidor.
 */
export function monthBoundsUTC(year: number, month: number): { start: Date; end: Date } {
  return {
    start: new Date(Date.UTC(year, month, 1)),
    end:   new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999)),
  };
}
```

---

### Cambios en archivos existentes

#### `src/cron/challenges-cron.service.ts`
- Eliminar función local `nowInChile()` (líneas 17-23)
- Agregar import: `import { nowInChile } from '../common/dates';`
- Sin otros cambios

#### `src/reservations/reservations.service.ts`
- Eliminar función local `nowInChile()` (líneas 21-27)
- Eliminar método privado `getWeekBounds(date: Date)` (líneas 754-762)
- Agregar import: `import { nowInChile, toChileDateStr, chileWeekBounds, monthBoundsUTC } from '../common/dates';`
- Reemplazar usos de `this.getWeekBounds(...)` con `chileWeekBounds(...)`
- En `getStats`: reemplazar `new Date(year, mon, 1)` / `new Date(year, mon + 1, 0, ...)` con `monthBoundsUTC`
  - Afecta `monthStart`, `monthEnd`, `prevStart`, `prevEnd`
  - El `month_label` usa `new Date(year, mon, 1).toLocaleDateString(...)` — este es solo display, se deja igual

#### `src/challenges/challenges.service.ts`
- Agregar import: `import { toChileDateStr } from '../common/dates';`
- En `scheduleMatch`, reemplazar el bloque frágil de construcción de fecha:
  ```ts
  // ANTES (frágil)
  const dateParts = scheduledDate.toLocaleDateString('es-CL', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Santiago'
  }).split('-');
  const dateChile = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T00:00:00`);

  // DESPUÉS (seguro)
  const dateChile = new Date(`${toChileDateStr(scheduledDate)}T00:00:00`);
  ```

---

## Lo que NO cambia

- Lógica de negocio: niveles de escalerilla, inmunidad, vulnerabilidad, W.O.
- Schema Prisma y migraciones
- Contratos de API (endpoints, request/response bodies)
- `src/challenges/challenge-rules.service.ts`
- `src/challenges/admin-challenges.service.ts`
- `src/players/`
- `src/master/`
- `src/auth/`
- `src/notifications/`
- Frontend (cero cambios)

---

## Comportamiento en producción

En Railway/Docker el servidor corre en UTC. En ese entorno:
- `new Date(year, mon, 1)` == `new Date(Date.UTC(year, mon, 1))` → **resultado idéntico**
- `chileWeekBounds` produce los mismos rangos que `getWeekBounds` anterior

El cambio hace el código correcto **por razón**, no solo por coincidencia de que el servidor sea UTC.

---

## Bug reportado: "2 minutos antes ya sale como completado"

Investigado el cron `handleExpiredReservations`: la matemática es correcta internamente. Ambos lados de la comparación (`endTime` y `nowInChile()`) usan el mismo "frame naive Chile", por lo que el cron no puede marcar un slot como `completed` antes de que termine.

Causa probable: el **frontend** está enviando la fecha en UTC (`new Date().toISOString().split('T')[0]`) en lugar de la fecha en zona Chile. Esto hace que a las 23:00 Chile (que es UTC+1 siguiente día en invierno), la fecha enviada sea "mañana", y la reserva del día actual no aparezca en la consulta de disponibilidad.

**Acción:** Documentado para revisión en frontend. No está en el alcance de este cambio backend.

---

## Riesgo

**Bajo.** Los cambios son de refactoring puro:
- Cero cambios de comportamiento en entorno Railway/UTC
- Cero cambios de API
- Las 4 funciones nuevas son deterministas y testables de forma aislada
- Si algo falla, el rollback es revertir el commit
