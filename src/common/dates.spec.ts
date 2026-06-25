import {
  toChileDateStr,
  currentChileDate,
  chileWeekBoundsFromStr,
  monthBoundsUTC,
} from './dates';

// chileWeekBoundsFromStr produces naive local-timezone dates.
// Use local date methods, not toISOString(), to avoid UTC offset issues.
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

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
  // 2026-05-06 is a Wednesday
  it('returns Monday to Sunday for a Wednesday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-06');
    expect(localDateStr(weekStart)).toBe('2026-05-04'); // Monday
    expect(localDateStr(weekEnd)).toBe('2026-05-10'); // Sunday
  });

  it('returns same week when date is Monday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-04');
    expect(localDateStr(weekStart)).toBe('2026-05-04');
    expect(localDateStr(weekEnd)).toBe('2026-05-10');
  });

  it('returns same week when date is Sunday', () => {
    const { weekStart, weekEnd } = chileWeekBoundsFromStr('2026-05-10');
    expect(localDateStr(weekStart)).toBe('2026-05-04');
    expect(localDateStr(weekEnd)).toBe('2026-05-10');
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
