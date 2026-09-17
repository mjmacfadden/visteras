/**
 * Print-edition weather: Open-Meteo daily forecast (free, no key, CORS-ok).
 * Screen keeps weatherwidget.io; print uses this B&W strip so ink always works.
 */
import { lookupZipGeo, type ZipGeo } from './settings';

export interface DayForecast {
  date: string;
  /** Short day label: Today, Thu, Fri… */
  label: string;
  highF: number;
  lowF: number;
  condition: string;
  weatherCode: number;
}

/** Known-good Northbrook coords (ZIP 60062). */
export const NORTHBROOK_GEO: ZipGeo = {
  lat: 42.13,
  lon: -87.83,
  city: 'Northbrook',
  stateAbbr: 'IL',
};

/** WMO weather interpretation codes → plain English (print-friendly). */
export function wmoCondition(code: number): string {
  if (code === 0) return 'Clear';
  if (code === 1) return 'Mostly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Fog';
  if (code === 51 || code === 53 || code === 55) return 'Drizzle';
  if (code === 56 || code === 57) return 'Freezing drizzle';
  if (code === 61 || code === 63 || code === 65) return 'Rain';
  if (code === 66 || code === 67) return 'Freezing rain';
  if (code === 71 || code === 73 || code === 75) return 'Snow';
  if (code === 77) return 'Snow grains';
  if (code === 80 || code === 81 || code === 82) return 'Showers';
  if (code === 85 || code === 86) return 'Snow showers';
  if (code === 95) return 'Thunderstorm';
  if (code === 96 || code === 99) return 'T-storm / hail';
  return 'Varied';
}

function chicagoDayLabel(isoDate: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const d = new Date(`${isoDate}T12:00:00`);
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short',
  }).format(d);
}

export async function geoForZip(zip: string): Promise<ZipGeo> {
  if (zip === '60062') return NORTHBROOK_GEO;
  const geo = await lookupZipGeo(zip);
  return geo || NORTHBROOK_GEO;
}

/**
 * Fetch 5-day daily hi/lo + condition from Open-Meteo (America/Chicago).
 * Returns null on network/parse failure.
 */
export async function fetchOpenMeteoForecast(
  lat: number,
  lon: number,
  forecastDays = 5,
): Promise<DayForecast[] | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('timezone', 'America/Chicago');
  url.searchParams.set('forecast_days', String(forecastDays));

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        time?: string[];
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
      };
    };
    const days = data.daily?.time;
    if (!days?.length) return null;
    const codes = data.daily?.weather_code || [];
    const highs = data.daily?.temperature_2m_max || [];
    const lows = data.daily?.temperature_2m_min || [];
    return days.map((date, i) => {
      const code = Number(codes[i] ?? 0);
      return {
        date,
        label: chicagoDayLabel(date, i),
        highF: Math.round(Number(highs[i] ?? 0)),
        lowF: Math.round(Number(lows[i] ?? 0)),
        condition: wmoCondition(code),
        weatherCode: code,
      };
    });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export interface DaySummary {
  highF: number;
  lowF: number;
  condition: string;
  weatherCode: number;
}

export interface HourlySlot {
  time: string;
  hourLabel: string;
  tempF: number;
  condition: string;
  weatherCode: number;
  precipProb?: number;
}

export interface WeatherData {
  summary: DaySummary;
  hourly: HourlySlot[];
}

export function wmoIconSvg(code: number): string {
  // Clear / Mostly clear
  if (code === 0 || code === 1) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
  }
  // Partly cloudy
  if (code === 2) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41"/><path d="M17.5 19H9a5 5 0 0 1-1-9.9 5.5 5.5 0 0 1 10.5 2.4A4 4 0 0 1 17.5 19z"/></svg>`;
  }
  // Overcast / Cloudy
  if (code === 3) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/></svg>`;
  }
  // Fog
  if (code === 45 || code === 48) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 14h16M4 18h16M4 10h16M4 6h16"/></svg>`;
  }
  // Drizzle / Rain / Showers
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><line x1="8" y1="19" x2="8" y2="21"/><line x1="12" y1="19" x2="12" y2="21"/><line x1="16" y1="19" x2="16" y2="21"/></svg>`;
  }
  // Snow / Snow grains / Snow showers
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25"/><line x1="8" y1="19" x2="8" y2="19.01"/><line x1="12" y1="21" x2="12" y2="21.01"/><line x1="16" y1="19" x2="16" y2="19.01"/></svg>`;
  }
  // Thunderstorm
  if (code >= 95) {
    return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9"/><polygon points="13 11 9 17 15 17 11 23 11 23"/></svg>`;
  }
  // Fallback sun
  return `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/></svg>`;
}

/**
 * Fetch daily summary and hourly forecast from Open-Meteo (America/Chicago).
 * Returns today's summary (high/low/icon) plus 9 daytime hourly slots.
 */
export async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
): Promise<WeatherData | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('daily', 'weather_code,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('hourly', 'temperature_2m,weather_code,precipitation_probability');
  url.searchParams.set('temperature_unit', 'fahrenheit');
  url.searchParams.set('timezone', 'America/Chicago');
  url.searchParams.set('forecast_days', '1');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url.toString(), { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      daily?: {
        weather_code?: number[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
      };
      hourly?: {
        time?: string[];
        temperature_2m?: number[];
        weather_code?: number[];
        precipitation_probability?: number[];
      };
    };

    const dailyCode = Number(data.daily?.weather_code?.[0] ?? 0);
    const highF = Math.round(Number(data.daily?.temperature_2m_max?.[0] ?? 75));
    const lowF = Math.round(Number(data.daily?.temperature_2m_min?.[0] ?? 55));
    const summary: DaySummary = {
      highF,
      lowF,
      condition: wmoCondition(dailyCode),
      weatherCode: dailyCode,
    };

    const times = data.hourly?.time || [];
    const temps = data.hourly?.temperature_2m || [];
    const codes = data.hourly?.weather_code || [];
    const precips = data.hourly?.precipitation_probability || [];

    const targetHours = [6, 8, 10, 12, 14, 16, 18, 20, 22];
    const hourly: HourlySlot[] = targetHours.map((h) => {
      const time = times[h] || `T${String(h).padStart(2, '0')}:00`;
      const tempF = Math.round(Number(temps[h] ?? 0));
      const code = Number(codes[h] ?? 0);
      const precip = Number(precips[h] ?? 0);
      const hourLabel =
        h === 0 ? '12 AM' : h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`;
      return {
        time,
        hourLabel,
        tempF,
        condition: wmoCondition(code),
        weatherCode: code,
        precipProb: precip,
      };
    });

    return { summary, hourly };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Backward compatibility for hourly-only caller */
export async function fetchOpenMeteoHourly(
  lat: number,
  lon: number,
): Promise<HourlySlot[] | null> {
  const data = await fetchOpenMeteoWeather(lat, lon);
  return data?.hourly || null;
}

/** Render HTML for today's summary box (icon + high/low below label) */
export function renderDaySummaryHtml(
  summary: DaySummary,
  escapeHtml: (t: string) => string = (t) => t,
): string {
  return `<span class="ws-hour">Today</span>
<span class="ws-bottom">
  <span class="ws-icon" title="${escapeHtml(summary.condition)}">${wmoIconSvg(summary.weatherCode)}</span>
  <span class="wsd-temps">${summary.highF}°&nbsp;/&nbsp;${summary.lowF}°</span>
</span>`;
}

/** Render HTML for hourly weather slots (icon + temp below hour) */
export function renderHourlyWeatherSlotsHtml(
  slots: HourlySlot[],
  escapeHtml: (t: string) => string = (t) => t,
): string {
  return slots
    .map(
      (s) => `<div class="weather-slot" title="${escapeHtml(s.condition)}">
  <span class="ws-hour">${escapeHtml(s.hourLabel)}</span>
  <span class="ws-bottom">
    <span class="ws-icon">${wmoIconSvg(s.weatherCode)}</span>
    <span class="ws-temp">${s.tempF}°</span>
  </span>
</div>`,
    )
    .join('');
}

/** Build print strip HTML (backward compatibility). */
export function renderPrintWeatherStripHtml(
  days: DayForecast[],
  escapeHtml: (t: string) => string,
): string {
  return days
    .map(
      (d) => `<div class="weather-print-day">
  <span class="wpd-day">${escapeHtml(d.label)}</span>
  <span class="wpd-cond">${escapeHtml(d.condition)}</span>
  <span class="wpd-temps">${d.highF}° / ${d.lowF}°</span>
</div>`,
    )
    .join('');
}
