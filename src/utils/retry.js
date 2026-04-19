/**
 * Tiny HTTP-429 retry helper used on the classify hot path.
 *
 * Wraps a `requestConfluence` call and, on a 429 response, honours the
 * server's `Retry-After` header (capped) before trying again. Non-429
 * responses are returned immediately. Gives up after `maxRetries` retries
 * and returns the final 429 for the caller to handle.
 *
 * Scope is intentionally narrow (429 only, no exponential backoff, no
 * jitter): the classify loop caller treats any non-2xx/non-429 as a page
 * failure and surfaces it to the user — retrying arbitrary 5xx or network
 * errors inside this helper would hide real problems.
 */

const DEFAULT_MAX_RETRIES = 2;
const RETRY_CAP_MS = 5000;

export async function requestWithRetry(doRequest, opts = {}) {
  const maxRetries = opts.maxRetries ?? DEFAULT_MAX_RETRIES;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await doRequest();
    if (response.status !== 429) return response;
    if (attempt === maxRetries) return response;

    const header = response.headers?.get?.('Retry-After');
    const retryAfterSec = Math.max(1, parseInt(header || '1', 10) || 1);
    const delayMs = Math.min(retryAfterSec * 1000, RETRY_CAP_MS);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  // Unreachable — loop either returns a non-429 or returns the final 429
  // on the last attempt.
}
