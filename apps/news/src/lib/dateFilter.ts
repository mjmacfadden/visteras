/** America/Chicago calendar date helpers for “today-only” RSS filtering. */

export function chicagoDateKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

/** Parse RSS/Atom dates into a Date; null if unusable. */
export function parseFeedDate(raw: string): Date | null {
  if (!raw) return null;
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

export function isSameChicagoDay(isoOrRaw: string, editionDate: string): boolean {
  const d = parseFeedDate(isoOrRaw);
  if (!d) return false;
  return chicagoDateKey(d) === editionDate;
}
