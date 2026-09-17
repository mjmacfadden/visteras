/** Day-of-year / date-key helpers for static puzzle banks. */

export function dayOfYear(date: Date = new Date()): number {
  const start = new Date(Date.UTC(date.getFullYear(), 0, 0));
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  return Math.floor((utc.getTime() - start.getTime()) / 86_400_000);
}

export function dateKey(date: Date = new Date()): string {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${m}-${d}`;
}

/** Map day-of-year 1–N into bank index 0..length-1 (wraps). Prefer stableHashIndex for overflow. */
export function bankIndex(day: number, length: number): number {
  if (length <= 0) return 0;
  const n = ((day - 1) % length + length) % length;
  return n;
}

/**
 * Stable FNV-1a–ish hash of a YYYY-MM-DD (or any string) into [0, length).
 * Spreads overflow dates across the full bank instead of a short modulo cycle.
 */
export function stableHashIndex(key: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % length;
}

/**
 * Pick a bank entry for a calendar date.
 * Order: exact dateKey (MM-DD) → dayOfYear → stable hash of ISO date (no short cycle).
 */
export function pickByDate<T extends { dayOfYear: number; dateKey: string }>(
  bank: T[],
  date: Date = new Date(),
): T {
  if (!bank.length) {
    throw new Error('pickByDate: empty bank');
  }
  const key = dateKey(date);
  const byKey = bank.find((e) => e.dateKey === key);
  if (byKey) return byKey;
  const doy = dayOfYear(date);
  const byDoy = bank.find((e) => e.dayOfYear === doy);
  if (byDoy) return byDoy;
  const iso = `${date.getFullYear()}-${key}`;
  return bank[stableHashIndex(iso, bank.length)]!;
}
