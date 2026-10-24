import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, createLimiter, createTtlCache, parseRetryAfter, backoffDelay, isRetryableStatus, locSizedUrl } from '../js/loc-net.js';

const instant = { setTimer: (fn, ms) => (ms < 10000 ? setTimeout(fn, 0) : setTimeout(fn, ms)), clearTimer: id => clearTimeout(id) };
const jsonRes = body => ({ ok: true, json: async () => body });

test('retryable statuses', () => {
  for (const s of [408, 429, 500, 502, 503, 504]) assert.equal(isRetryableStatus(s), true, s);
  for (const s of [400, 401, 403, 404]) assert.equal(isRetryableStatus(s), false, s);
});

test('Retry-After seconds and dates', () => {
  assert.equal(parseRetryAfter('3'), 3000);
  assert.equal(parseRetryAfter(new Date(10000).toUTCString(), 4000), 6000);
  assert.equal(parseRetryAfter(null), null);
  assert.equal(parseRetryAfter('nonsense'), null);
});

test('backoff grows with attempt, is jittered, capped and honours Retry-After', () => {
  assert.equal(backoffDelay(0, { random: () => 0 }), 300);
  assert.equal(backoffDelay(0, { random: () => 1 }), 600);
  assert.equal(backoffDelay(2, { random: () => 1 }), 2400);
  assert.equal(backoffDelay(10, { random: () => 1 }), 5000);
  assert.equal(backoffDelay(0, { retryAfterMs: 2000 }), 2000);
  assert.equal(backoffDelay(0, { retryAfterMs: 60000 }), 10000);
});

test('fetchWithRetry succeeds after transient failures', async () => {
  const seen = [];
  let n = 0;
  const out = await fetchWithRetry('u', { ...instant, retries: 3, onRetry: r => seen.push(r.error.kind),
    fetchImpl: async () => {
      n++;
      if (n === 1) throw new TypeError('Failed to fetch');
      if (n === 2) return { ok: false, status: 502, headers: { get: () => null } };
      return jsonRes({ ok: 1 });
    } });
  assert.deepEqual(out, { ok: 1 });
  assert.deepEqual(seen, ['network', 'http']);
});

test('fetchWithRetry times out each attempt and reports kind=timeout', async () => {
  let n = 0;
  const hang = (url, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('a'), { name: 'AbortError' }))));
  await assert.rejects(fetchWithRetry('u', { timeoutMs: 20, retries: 1, baseDelayMs: 1, fetchImpl: (...a) => { n++; return hang(...a); } }),
    e => e.kind === 'timeout');
  assert.equal(n, 2);
});

test('fetchWithRetry does not retry 404 and stops when the caller aborts', async () => {
  let n = 0;
  await assert.rejects(fetchWithRetry('u', { ...instant, fetchImpl: async () => { n++; return { ok: false, status: 404 }; } }), e => e.status === 404);
  assert.equal(n, 1);
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(fetchWithRetry('u', { signal: ctrl.signal, fetchImpl: async () => jsonRes({}) }), e => e.kind === 'aborted');
});

test('createLimiter never exceeds its concurrency', async () => {
  const limit = createLimiter(2);
  let active = 0, peak = 0;
  const job = () => limit(async () => { active++; peak = Math.max(peak, active); await new Promise(r => setTimeout(r, 5)); active--; return 1; });
  const results = await Promise.all(Array.from({ length: 7 }, job));
  assert.equal(results.length, 7);
  assert.equal(peak, 2);
  assert.deepEqual(limit.stats(), { active: 0, queued: 0 });
});

test('TTL cache: fresh, stale, expiry, cap and persistence', () => {
  let t = 0;
  const data = {};
  const storage = { getItem: k => data[k] ?? null, setItem: (k, v) => { data[k] = v; } };
  const c = createTtlCache({ storage, storageKey: 'k', ttlMs: 100, staleMs: 1000, maxEntries: 2, now: () => t });
  c.set('a', 1);
  assert.deepEqual(c.get('a'), { value: 1, fresh: true });
  t = 500;
  assert.deepEqual(c.get('a'), { value: 1, fresh: false });
  const reloaded = createTtlCache({ storage, storageKey: 'k', ttlMs: 100, staleMs: 1000, now: () => t });
  assert.deepEqual(reloaded.get('a'), { value: 1, fresh: false });
  t = 2000;
  assert.equal(c.get('a'), null);
  c.set('x', 1); c.set('y', 2); c.set('z', 3);
  assert.equal(c.size(), 2);
  assert.equal(c.get('x'), null);
});

test('TTL cache survives corrupt storage and quota errors', () => {
  const bad = { getItem: () => '{not json', setItem: () => { throw new Error('QuotaExceededError'); } };
  const c = createTtlCache({ storage: bad, storageKey: 'k' });
  c.set('a', 1);
  assert.equal(c.get('a').value, 1);
});

test('locSizedUrl rewrites only tile.loc.gov IIIF sizes', () => {
  const u = 'https://tile.loc.gov/image-services/iiif/service:ndnp:dlc:batch:data:sn1:0001/full/pct:12.5/0/default.jpg';
  assert.equal(locSizedUrl(u, 360), 'https://tile.loc.gov/image-services/iiif/service:ndnp:dlc:batch:data:sn1:0001/full/,360/0/default.jpg');
  assert.equal(locSizedUrl(u + '#h=1&w=2', 360).endsWith('/full/,360/0/default.jpg'), true);
  assert.equal(locSizedUrl('https://example.org/a.jpg', 360), 'https://example.org/a.jpg');
});
