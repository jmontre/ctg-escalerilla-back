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
