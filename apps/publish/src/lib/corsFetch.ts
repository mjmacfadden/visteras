/**
 * Client-side fetch helper with CORS proxy fallback (zero-cost, no servers).
 *
 * Order: direct fetch -> free public proxies. Each proxy response is read and
 * validated (optional `validate`) so a 200 that is actually an HTML error page,
 * rate-limit notice, or Markdown rendering is rejected and the next proxy tried.
 * Returns a fresh Response built from the validated body.
 */
export interface CorsFetchOptions extends RequestInit {
  /** Return true if the body is acceptable (e.g. looks like XML). */
  validate?: (body: string, contentType: string) => boolean;
}

type ProxyDef = {
  name: string;
  build: (url: string) => string;
  headers?: Record<string, string>;
  /** Optional body cleanup before validation (e.g. strip a text preamble). */
  transform?: (body: string) => string;
};

/** Drop anything before the first <rss>/<feed>/<rdf:RDF> root (jina text mode adds a preamble). */
function sliceFromFeedRoot(body: string): string {
  const i = body.search(/<(rss|feed|rdf:RDF)[\s>]/i);
  return i > 0 ? body.slice(i) : body;
}

const PROXIES: ProxyDef[] = [
  // r.jina.ai returns Markdown by default; X-Return-Format: html returns the raw source.
  { name: 'jina', build: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' } },
  // Some feeds (e.g. ESPN) come back wrapped in an HTML viewer in html mode; text mode
  // returns "This XML file does not appear…" + the raw XML, which we slice out.
  { name: 'jina-text', build: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'text' }, transform: sliceFromFeedRoot },
  { name: 'cors.lol', build: (u) => `https://api.cors.lol/?url=${encodeURIComponent(u)}` },
  { name: 'codetabs', build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}` },
  { name: 'allorigins', build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` },
];

const PROXY_TIMEOUT_MS = 8000;

export async function fetchWithCorsFallback(
  url: string,
  options: CorsFetchOptions = {},
  timeoutMs = 12000,
): Promise<Response> {
  const { validate, ...init } = options;

  const accept = async (res: Response, transform?: (b: string) => string): Promise<Response | null> => {
    if (!res.ok) return null;
    if (!validate) return res;
    const ct = res.headers.get('content-type') || '';
    const raw = await res.text();
    const body = transform ? transform(raw) : raw;
    if (!validate(body, ct)) return null;
    return new Response(body, { status: 200, headers: { 'content-type': ct } });
  };

  let lastErr: unknown = new Error(`Could not fetch ${url}`);

  try {
    const directRes = await fetch(url, { ...init, signal: withTimeout(init.signal, timeoutMs) });
    const ok = await accept(directRes);
    if (ok) return ok;
    if (!validate) return directRes; // non-validating callers keep old semantics
    lastErr = new Error(`Direct fetch returned unusable response (HTTP ${directRes.status})`);
  } catch (err) {
    if (init.signal?.aborted) throw err;
    lastErr = err;
  }

  if (!/^https?:\/\//i.test(url)) throw lastErr;

  for (const proxy of PROXIES) {
    if (init.signal?.aborted) break;
    try {
      const res = await fetch(proxy.build(url), {
        ...init,
        headers: { ...((init.headers as Record<string, string>) || {}), ...(proxy.headers || {}) },
        signal: withTimeout(init.signal, PROXY_TIMEOUT_MS),
      });
      const ok = await accept(res, proxy.transform);
      if (ok) return ok;
      lastErr = new Error(`${proxy.name}: unusable response (HTTP ${res.status})`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/** True if body looks like an RSS/Atom/RDF XML document (not HTML/Markdown/JSON error). */
export function looksLikeFeedXml(body: string): boolean {
  const head = body.slice(0, 2000).replace(/^\uFEFF/, '').trimStart();
  if (/^<!doctype html|^<html/i.test(head)) return false;
  return /<(rss|feed|rdf:RDF)[\s>]/i.test(head);
}

function withTimeout(signal: AbortSignal | null | undefined, ms: number): AbortSignal {
  const t = AbortSignal.timeout(ms);
  if (!signal) return t;
  const c = new AbortController();
  const abort = () => c.abort();
  if (signal.aborted || t.aborted) c.abort();
  signal.addEventListener('abort', abort, { once: true });
  t.addEventListener('abort', abort, { once: true });
  return c.signal;
}
