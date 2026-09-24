/**
 * Client settings shape for The Daily Mike.
 * Persisted in localStorage; structured for future sync.
 */
import { DEFAULT_ENABLED_COMIC_IDS } from '../data/feeds/comics';
import type { CalendarSource } from './calendar';

export const SETTINGS_STORAGE_KEY = 'daily-mike-settings-v1';
export const GROK_BRIEF_STORAGE_KEY = 'daily-mike-grok-brief-v1';

/** One-shot opt-in for newly shipped comics (won’t re-enable after you uncheck). */
const COMIC_OPT_IN_KEY = 'daily-mike-comic-optins-v1';
const COMIC_IDS_TO_OPT_IN = ['newyorker-daily'] as const;

function withNewComicDefaults(enabledComicIds: string[]): string[] {
  if (typeof localStorage === 'undefined') return enabledComicIds;
  let applied: string[] = [];
  try {
    const raw = localStorage.getItem(COMIC_OPT_IN_KEY);
    applied = raw ? (JSON.parse(raw) as string[]) : [];
    if (!Array.isArray(applied)) applied = [];
  } catch {
    applied = [];
  }
  const set = new Set(enabledComicIds);
  let changed = false;
  for (const id of COMIC_IDS_TO_OPT_IN) {
    if (applied.includes(id)) continue;
    if (!DEFAULT_ENABLED_COMIC_IDS.includes(id)) continue;
    set.add(id);
    applied.push(id);
    changed = true;
  }
  if (changed) {
    try {
      localStorage.setItem(COMIC_OPT_IN_KEY, JSON.stringify(applied));
    } catch {
      /* ignore */
    }
  }
  return Array.from(set);
}

export interface CustomFeed {
  id: string;
  name: string;
  url: string;
  /** Whether the feed is fetched/rendered. Defaults to true. */
  enabled: boolean;
  /** How many articles from this feed to show at once (cycle step). 1..10. */
  count: number;
}

/** Clamp a user-facing article count into the valid 1..10 range. */
function clampFeedCount(value: unknown): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.min(10, n);
}

export interface GrokBriefStore {
  text: string;
  /** Edition date (YYYY-MM-DD) the paste was saved for */
  date: string;
  savedAt: string;
}

export interface BackPageFeatureSettings {
  comics: boolean;
  crossword: boolean;
  jumble: boolean;
  trivia: boolean;
  history: boolean;
  birthdays: boolean;
  answers: boolean;
  joke: boolean;
}

export const DEFAULT_BACK_PAGE_FEATURES: BackPageFeatureSettings = {
  comics: true,
  crossword: true,
  jumble: true,
  trivia: true,
  history: true,
  birthdays: true,
  answers: true,
  joke: true,
};

export interface PaperSettings {
  paperName: string;
  paperTagline: string;
  zip: string;
  /**
   * When false (default), news columns come from the Grok brief only.
   * RSS code remains available; enable feeds in Settings to opt back in.
   */
  rssEnabled: boolean;
  /** Built-in feed ids that are enabled (ignored when rssEnabled is false) */
  enabledFeedIds: string[];
  customFeeds: CustomFeed[];
  /** Comic source ids (xkcd, smbc, oatmeal) */
  enabledComicIds: string[];
  /** Public ICS calendar URLs */
  calendars: CalendarSource[];
  /** Page 3 back page feature visibility */
  features?: BackPageFeatureSettings;
}

/** Sensible defaults — Northbrook ZIP, RSS off (Grok is the news backbone). */
export function defaultSettings(): PaperSettings {
  return {
    paperName: 'The Daily Mike',
    paperTagline: 'NOTEWORTHY EVENTS WEATHER AND SPORTS',
    zip: '60062',
    rssEnabled: false,
    enabledFeedIds: [],
    customFeeds: [],
    enabledComicIds: [...DEFAULT_ENABLED_COMIC_IDS],
    calendars: [],
    features: { ...DEFAULT_BACK_PAGE_FEATURES },
  };
}

export function loadSettings(): PaperSettings {
  if (typeof localStorage === 'undefined') return defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings();
    const parsed = JSON.parse(raw) as Partial<PaperSettings>;
    const base = defaultSettings();
    const enabledFeedIds = Array.isArray(parsed.enabledFeedIds)
      ? parsed.enabledFeedIds.filter((id) => typeof id === 'string')
      : base.enabledFeedIds;
    // Explicit flag wins; otherwise infer from whether any feeds are checked or custom feeds exist
    const customFeeds: CustomFeed[] = Array.isArray(parsed.customFeeds)
      ? parsed.customFeeds
          .filter((f) => f && typeof f.url === 'string' && f.url.startsWith('http'))
          .map((f) => ({
            id: String(f.id || `custom-${Date.now()}`),
            name: String(f.name || 'Custom'),
            url: String(f.url),
            enabled: (f as { enabled?: unknown }).enabled !== false,
            count: clampFeedCount((f as { count?: unknown }).count),
          }))
      : [];
    const rssEnabled = enabledFeedIds.length > 0 || customFeeds.some((f) => f.enabled);
    const features: BackPageFeatureSettings = {
      comics: parsed.features?.comics !== false,
      crossword: parsed.features?.crossword !== false,
      jumble: parsed.features?.jumble !== false,
      trivia: parsed.features?.trivia !== false,
      history: parsed.features?.history !== false,
      birthdays: parsed.features?.birthdays !== false,
      answers: parsed.features?.answers !== false,
      joke: parsed.features?.joke !== false,
    };
    return {
      paperName: typeof parsed.paperName === 'string' && parsed.paperName.trim() ? parsed.paperName.trim() : base.paperName,
      paperTagline: typeof parsed.paperTagline === 'string' && parsed.paperTagline.trim() ? parsed.paperTagline.trim() : base.paperTagline,
      zip: typeof parsed.zip === 'string' && /^\d{5}$/.test(parsed.zip) ? parsed.zip : base.zip,
      rssEnabled,
      enabledFeedIds,
      customFeeds,
      enabledComicIds: withNewComicDefaults(
        Array.isArray(parsed.enabledComicIds)
          ? parsed.enabledComicIds.filter((id) => typeof id === 'string')
          : base.enabledComicIds,
      ),
      calendars: Array.isArray(parsed.calendars)
        ? parsed.calendars.filter(
            (c) => c && typeof c.url === 'string' && c.url.startsWith('http'),
          )
        : [],
      features,
    };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: PaperSettings): void {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function loadGrokBrief(): GrokBriefStore | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GROK_BRIEF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GrokBriefStore;
    if (!parsed || typeof parsed.text !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGrokBrief(text: string, date: string): GrokBriefStore {
  const store: GrokBriefStore = {
    text,
    date,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(GROK_BRIEF_STORAGE_KEY, JSON.stringify(store));
  return store;
}

export function clearGrokBrief(): void {
  localStorage.removeItem(GROK_BRIEF_STORAGE_KEY);
}

/** Portable backup of lasting paper settings (not the daily Grok brief). */
export const LOCAL_STORAGE_BUNDLE_VERSION = 1;
export const LOCAL_STORAGE_BUNDLE_APP = 'the-daily-mike';

export interface LocalStorageBundle {
  version: number;
  app: string;
  exportedAt: string;
  settings: PaperSettings;
}

export function buildLocalStorageBundle(opts?: { settings?: PaperSettings }): LocalStorageBundle {
  return {
    version: LOCAL_STORAGE_BUNDLE_VERSION,
    app: LOCAL_STORAGE_BUNDLE_APP,
    exportedAt: new Date().toISOString(),
    settings: opts?.settings ?? loadSettings(),
  };
}

/** Normalize a settings object the same way loadSettings does. */
export function normalizePaperSettings(parsed: Partial<PaperSettings> | null | undefined): PaperSettings {
  const base = defaultSettings();
  const enabledFeedIds = Array.isArray(parsed.enabledFeedIds)
    ? parsed.enabledFeedIds.filter((id) => typeof id === 'string')
    : base.enabledFeedIds;
  const customFeeds = Array.isArray(parsed.customFeeds)
    ? parsed.customFeeds
        .filter(
          (f) => f && typeof f.url === 'string' && f.url.startsWith('http'),
        )
        .map((f) => ({
          id: String(f.id || `custom-${Date.now()}`),
          name: String(f.name || 'Custom'),
          url: String(f.url),
          enabled: (f as { enabled?: unknown }).enabled !== false,
          count: clampFeedCount((f as { count?: unknown }).count),
        }))
    : [];
  const rssEnabled = enabledFeedIds.length > 0 || customFeeds.some((f) => f.enabled);
  return {
    paperName: typeof parsed.paperName === 'string' && parsed.paperName.trim() ? parsed.paperName.trim() : base.paperName,
    paperTagline: typeof parsed.paperTagline === 'string' && parsed.paperTagline.trim() ? parsed.paperTagline.trim() : base.paperTagline,
    zip: typeof parsed.zip === 'string' && /^\d{5}$/.test(parsed.zip) ? parsed.zip : base.zip,
    rssEnabled,
    enabledFeedIds,
    customFeeds,
    enabledComicIds: withNewComicDefaults(
      Array.isArray(parsed.enabledComicIds)
        ? parsed.enabledComicIds.filter((id) => typeof id === 'string')
        : base.enabledComicIds,
    ),
    calendars: Array.isArray(parsed?.calendars)
      ? parsed.calendars.filter(
          (c) => c && typeof c.url === 'string' && c.url.startsWith('http'),
        )
      : [],
    features: {
      comics: parsed?.features?.comics !== false,
      crossword: parsed?.features?.crossword !== false,
      jumble: parsed?.features?.jumble !== false,
      trivia: parsed?.features?.trivia !== false,
      history: parsed?.features?.history !== false,
      birthdays: parsed?.features?.birthdays !== false,
      answers: parsed?.features?.answers !== false,
      joke: parsed?.features?.joke !== false,
    },
  };
}

export function parseLocalStorageBundle(raw: unknown): LocalStorageBundle {
  if (!raw || typeof raw !== 'object') throw new Error('Invalid backup file');
  const obj = raw as Record<string, unknown>;
  const looksLikeSettings =
    'zip' in obj || 'calendars' in obj || 'enabledComicIds' in obj || 'rssEnabled' in obj;
  const hasBundleFields = 'settings' in obj || obj.app === LOCAL_STORAGE_BUNDLE_APP;

  if (hasBundleFields || ('version' in obj && 'settings' in obj)) {
    if (obj.app && obj.app !== LOCAL_STORAGE_BUNDLE_APP) {
      throw new Error('Not a The Daily Mike settings backup');
    }
    return {
      version: typeof obj.version === 'number' ? obj.version : LOCAL_STORAGE_BUNDLE_VERSION,
      app: LOCAL_STORAGE_BUNDLE_APP,
      exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
      settings: normalizePaperSettings(obj.settings as Partial<PaperSettings>),
    };
  }

  if (looksLikeSettings) {
    return {
      version: LOCAL_STORAGE_BUNDLE_VERSION,
      app: LOCAL_STORAGE_BUNDLE_APP,
      exportedAt: new Date().toISOString(),
      settings: normalizePaperSettings(obj as Partial<PaperSettings>),
    };
  }

  throw new Error('Unrecognized backup format');
}

/** Write settings into localStorage. Does not touch the daily Grok brief. */
export function applyLocalStorageBundle(bundle: LocalStorageBundle): PaperSettings {
  const settings = normalizePaperSettings(bundle.settings);
  saveSettings(settings);
  return settings;
}

export function wundergroundUrlForZip(zip: string): string {
  return `https://www.wunderground.com/weather/us/il/northbrook/${zip}`;
}

/** Northbrook weatherwidget / forecast7 URL (known-good default embed). */
export function forecast7UrlForNorthbrook(): string {
  return 'https://forecast7.com/en/42d13n87d83/northbrook/';
}

export interface ZipGeo {
  lat: number;
  lon: number;
  city: string;
  stateAbbr: string;
}

/** City slug for forecast7 path: lowercased, hyphenated. */
export function citySlug(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Encode lat/lon + city for forecast7 / weatherwidget.io.
 * Decimal point → `d`; negative lon → `n` prefix (US west).
 * Example: 42.13, -87.83, Northbrook → `42d13n87d83/northbrook`
 */
export function forecast7PathFromCoords(lat: number, lon: number, city: string): string {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const rLat = round2(lat);
  const rLon = round2(lon);

  const enc = (n: number): string => {
    const parts = Math.abs(n).toFixed(2).split('.');
    return `${parts[0]}d${parts[1]}`;
  };

  let latPart = enc(rLat);
  if (rLat < 0) latPart = `s${latPart}`;

  // Negative lon → `n` prefix; positive lon has no prefix (e.g. Barcelona 41d392d17).
  const lonPart = rLon < 0 ? `n${enc(rLon)}` : enc(rLon);

  const slug = citySlug(city) || 'location';
  return `${latPart}${lonPart}/${slug}`;
}

export function forecast7UrlFromCoords(lat: number, lon: number, city: string): string {
  return `https://forecast7.com/en/${forecast7PathFromCoords(lat, lon, city)}/`;
}

/** Lookup US ZIP via zippopotam.us (no API key). */
export async function lookupZipGeo(zip: string): Promise<ZipGeo | null> {
  if (!/^\d{5}$/.test(zip)) return null;
  try {
    const res = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      places?: Array<{
        'place name'?: string;
        latitude?: string;
        longitude?: string;
        'state abbreviation'?: string;
      }>;
    };
    const place = data.places?.[0];
    if (!place) return null;
    const lat = Number(place.latitude);
    const lon = Number(place.longitude);
    const city = place['place name'];
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !city) return null;
    return {
      lat,
      lon,
      city,
      stateAbbr: place['state abbreviation'] || '',
    };
  } catch {
    return null;
  }
}

/**
 * Map ZIP → forecast7 URL. Uses zippopotam.us; falls back to Northbrook on failure.
 * Prefer known Northbrook URL for default ZIP so the embed matches Mike's snippet.
 */
export async function forecast7UrlForZip(
  zip: string,
): Promise<{ url: string; label: string; city: string; stateAbbr: string; fromFallback: boolean }> {
  if (zip === '60062') {
    return {
      url: forecast7UrlForNorthbrook(),
      label: 'NORTHBROOK',
      city: 'Northbrook',
      stateAbbr: 'IL',
      fromFallback: false,
    };
  }
  const geo = await lookupZipGeo(zip);
  if (!geo) {
    return {
      url: forecast7UrlForNorthbrook(),
      label: 'NORTHBROOK',
      city: 'Northbrook',
      stateAbbr: 'IL',
      fromFallback: true,
    };
  }
  return {
    url: forecast7UrlFromCoords(geo.lat, geo.lon, geo.city),
    label: geo.city.toUpperCase(),
    city: geo.city,
    stateAbbr: geo.stateAbbr,
    fromFallback: false,
  };
}

