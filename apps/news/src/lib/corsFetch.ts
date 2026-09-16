/**
 * Client-side fetch helper with CORS proxy fallback.
 * Attempts direct fetch first; if blocked by browser CORS, falls back to public proxies.
 */
export async function fetchWithCorsFallback(
  url: string,
  options: RequestInit = {},
  timeoutMs = 12000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const mergedSignal = options.signal
    ? composeSignals(options.signal, controller.signal)
    : controller.signal;

  try {
    const directRes = await fetch(url, {
      ...options,
      signal: mergedSignal,
    });
    return directRes;
  } catch (err: any) {
    if (options.signal?.aborted) {
      throw err;
    }

    if (/^https?:\/\//i.test(url)) {
      const proxies = [
        `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      ];

      for (const proxyUrl of proxies) {
        try {
          const proxyRes = await fetch(proxyUrl, {
            ...options,
            headers: {
              ...(options.headers || {}),
              Accept: '*/*',
            },
            signal: AbortSignal.timeout(4000),
          });
          if (proxyRes.ok) {
            return proxyRes;
          }
        } catch {
          // Try next proxy
        }
      }
    }

    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function composeSignals(s1: AbortSignal, s2: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (s1.aborted || s2.aborted) {
    controller.abort();
    return controller.signal;
  }
  s1.addEventListener('abort', onAbort, { once: true });
  s2.addEventListener('abort', onAbort, { once: true });
  return controller.signal;
}
