/**
 * Public site base URL for QR codes and absolute links.
 * Works seamlessly with GitHub Pages subpaths (e.g. /royko/) as well as custom domains.
 */
export function getSiteBaseUrl(): string {
  const fromEnv =
    (typeof import.meta !== 'undefined' &&
      (import.meta as ImportMeta & { env?: Record<string, string> }).env?.PUBLIC_SITE_URL) ||
    '';
  if (fromEnv) {
    const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
    return `${fromEnv.trim().replace(/\/$/, '')}${base}`;
  }
  return 'http://mjmacfadden.github.io/royko';
}

export function answersUrlForDate(date: string): string {
  return `${getSiteBaseUrl()}/answers?date=${date}`;
}

/** Paper name — use everywhere instead of legacy Chronicle branding. */
export const PAPER_NAME = 'The Daily Mike';
export const PAPER_NAME_UPPER = 'THE DAILY MIKE';
export const PAPER_TAGLINE = 'NOTEWORTHY EVENTS WEATHER AND SPORTS';
