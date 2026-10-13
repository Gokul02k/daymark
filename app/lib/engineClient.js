/**
 * Server-side client for the Python engine.
 *
 * Import only from route handlers. The browser talks to `/api/*`; those
 * routes talk to the engine. The engine URL is server configuration and must
 * not be bundled into the client.
 */

const TIMEOUT_MS = 3000;

export function engineUrl() {
  return process.env.ENGINE_URL || 'http://127.0.0.1:8790';
}

export async function engineFetch(path, { method = 'GET', body } = {}) {
  const url = new URL(path, engineUrl());
  let res;
  try {
    res = await fetch(url, {
      method,
      cache: 'no-store',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    const err = new Error('engine is not running');
    err.status = 503;
    throw err;
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `engine HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
