// Client-side network hardening for Library of Congress requests.
// Pure helpers with injectable fetch/timers/storage so they are unit-testable.

export class LocNetError extends Error {
  constructor(message, { kind = 'network', status = 0, cause } = {}) {
    super(message);
    this.name = 'LocNetError';
    this.kind = kind; // 'timeout' | 'http' | 'network' | 'aborted'
    this.status = status;
    if (cause) this.cause = cause;
  }
}

export function isRetryableStatus(status) {
  return status === 408 || status === 429 || (status >= 500 && status <= 599);
}

// Retry-After may be seconds or an HTTP date. Returns ms or null.
export function parseRetryAfter(value, now = Date.now()) {
  if (value == null || value === '') return null;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, at - now) : null;
}

export function backoffDelay(attempt, { baseDelayMs = 600, maxDelayMs = 5000, random = Math.random, retryAfterMs = null } = {}) {
  if (retryAfterMs != null) return Math.min(maxDelayMs * 2, retryAfterMs);
  const exp = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
  return Math.round(exp / 2 + random() * exp / 2); // "equal jitter"
}

/**
 * fetch + parse with a per-attempt timeout and retries on timeout, network
 * errors (including sockets closed mid-body), 408/429 and 5xx. The body is
 * parsed inside the attempt so a truncated download is retried too.
 */
export async function fetchWithRetry(url, {
  fetchImpl = globalThis.fetch,
  init = {},
  parse = res => res.json(),
  timeoutMs = 12000,
  retries = 2,
  baseDelayMs = 600,
  maxDelayMs = 5000,
  signal = null,
  setTimer = (fn, ms) => setTimeout(fn, ms),
  clearTimer = id => clearTimeout(id),
  random = Math.random,
  onRetry = null,
} = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal && signal.aborted) throw new LocNetError('Request cancelled.', { kind: 'aborted' });
    const controller = new AbortController();
    let timedOut = false;
    const onOuterAbort = () => controller.abort();
    if (signal) signal.addEventListener('abort', onOuterAbort, { once: true });
    const timer = setTimer(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let retryAfterMs = null;
    try {
      const res = await fetchImpl(url, { ...init, signal: controller.signal });
      if (!res.ok) {
        retryAfterMs = parseRetryAfter(res.headers && res.headers.get ? res.headers.get('Retry-After') : null);
        throw new LocNetError(`HTTP ${res.status}`, { kind: 'http', status: res.status });
      }
      return await parse(res);
    } catch (err) {
      if (signal && signal.aborted) throw new LocNetError('Request cancelled.', { kind: 'aborted', cause: err });
      lastErr = err instanceof LocNetError ? err
        : (timedOut || (err && err.name === 'AbortError'))
          ? new LocNetError('Request timed out.', { kind: 'timeout', cause: err })
          : new LocNetError((err && err.message) || 'Network error.', { kind: 'network', cause: err });
      const retryable = lastErr.kind !== 'http' || isRetryableStatus(lastErr.status);
      if (!retryable || attempt === retries) throw lastErr;
      const delay = backoffDelay(attempt, { baseDelayMs, maxDelayMs, random, retryAfterMs });
      if (onRetry) onRetry({ attempt: attempt + 1, delay, error: lastErr });
      await new Promise(r => setTimer(r, delay));
    } finally {
      clearTimer(timer);
      if (signal) signal.removeEventListener('abort', onOuterAbort);
    }
  }
  throw lastErr;
}

/** Simple FIFO concurrency limiter: limit(fn) runs fn when a slot is free. */
export function createLimiter(max = 4) {
  let active = 0;
  const queue = [];
  const pump = () => {
    while (active < max && queue.length) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      Promise.resolve().then(fn).then(resolve, reject).finally(() => { active--; pump(); });
    }
  };
  const limit = fn => new Promise((resolve, reject) => { queue.push({ fn, resolve, reject }); pump(); });
  limit.stats = () => ({ active, queued: queue.length });
  return limit;
}

/**
 * Small TTL cache: memory first, mirrored to one storage key (search results
 * only — never documents). get() returns { value, fresh } so callers can serve
 * stale data when the network fails.
 */
export function createTtlCache({ storage = null, storageKey = '', ttlMs = 6 * 3600e3, staleMs = 7 * 86400e3, maxEntries = 12, now = () => Date.now() } = {}) {
  let entries = new Map();
  if (storage && storageKey) {
    try {
      const raw = JSON.parse(storage.getItem(storageKey) || '[]');
      if (Array.isArray(raw)) for (const [k, v] of raw) if (v && typeof v.t === 'number') entries.set(k, v);
    } catch { /* corrupt cache: ignore */ }
  }
  const persist = () => {
    if (!storage || !storageKey) return;
    try { storage.setItem(storageKey, JSON.stringify([...entries])); }
    catch {
      // Quota: drop the oldest half and try once more.
      entries = new Map([...entries].slice(Math.floor(entries.size / 2)));
      try { storage.setItem(storageKey, JSON.stringify([...entries])); } catch { /* give up */ }
    }
  };
  return {
    get(key) {
      const e = entries.get(key);
      if (!e) return null;
      const age = now() - e.t;
      if (age > staleMs) { entries.delete(key); persist(); return null; }
      return { value: e.v, fresh: age <= ttlMs };
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, { t: now(), v: value });
      while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
      persist();
    },
    delete(key) { entries.delete(key); persist(); },
    size() { return entries.size; },
  };
}

/**
 * Rewrite a tile.loc.gov IIIF image URL to a height-bounded size for fast
 * first paint (e.g. ",360"). Non-IIIF URLs are returned unchanged.
 */
export function locSizedUrl(url, height) {
  if (typeof url !== 'string') return url;
  const m = url.match(/^(https:\/\/tile\.loc\.gov\/image-services\/iiif\/[^/]+\/[^/]+\/)([^/]+)(\/\d+\/default\.jpg)(#.*)?$/);
  if (!m) return url;
  return `${m[1]},${Math.max(1, Math.round(height))}${m[3]}`;
}
