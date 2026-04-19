import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestWithRetry } from '../../src/utils/retry';

// Helper to build a minimal fake Response.
function r(status, headers = {}) {
  return { status, headers: { get: (k) => headers[k] ?? null } };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('requestWithRetry', () => {
  it('returns the response immediately on a non-429 success', async () => {
    const doRequest = vi.fn().mockResolvedValue(r(200));
    const result = await requestWithRetry(doRequest);
    expect(result.status).toBe(200);
    expect(doRequest).toHaveBeenCalledOnce();
  });

  it('retries once on 429 and returns the subsequent success', async () => {
    const doRequest = vi
      .fn()
      .mockResolvedValueOnce(r(429, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(r(200));

    const promise = requestWithRetry(doRequest);
    // Advance past the 1-second Retry-After delay.
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(doRequest).toHaveBeenCalledTimes(2);
  });

  it('gives up after maxRetries and returns the final 429', async () => {
    const doRequest = vi.fn().mockResolvedValue(r(429, { 'Retry-After': '1' }));

    const promise = requestWithRetry(doRequest, { maxRetries: 2 });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.status).toBe(429);
    expect(doRequest).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('caps Retry-After at 5 seconds so one page never eats the budget', async () => {
    const doRequest = vi
      .fn()
      .mockResolvedValueOnce(r(429, { 'Retry-After': '120' })) // server asks for 2 min
      .mockResolvedValueOnce(r(200));

    const promise = requestWithRetry(doRequest);
    // We should only wait up to 5 s, not 120 s.
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.status).toBe(200);
    expect(doRequest).toHaveBeenCalledTimes(2);
  });

  it('handles missing Retry-After header by defaulting to 1 s', async () => {
    const doRequest = vi
      .fn()
      .mockResolvedValueOnce(r(429)) // no header
      .mockResolvedValueOnce(r(200));

    const promise = requestWithRetry(doRequest);
    await vi.advanceTimersByTimeAsync(1000);
    const result = await promise;

    expect(result.status).toBe(200);
  });
});
