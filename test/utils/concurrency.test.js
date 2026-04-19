import { describe, it, expect, vi } from 'vitest';
import { runWithConcurrency } from '../../src/utils/concurrency';

describe('runWithConcurrency', () => {
  it('preserves input order in the results array', async () => {
    const items = [10, 20, 30, 40, 50];
    // Faster items finish first, but results must still be ordered by index.
    const results = await runWithConcurrency(items, 3, async (x) => {
      await new Promise((r) => setTimeout(r, 20 - (x % 20)));
      return x * 2;
    });
    expect(results).toEqual([20, 40, 60, 80, 100]);
  });

  it('runs up to `limit` workers in parallel', async () => {
    let inFlight = 0;
    let peak = 0;
    const worker = async () => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 10));
      inFlight--;
    };
    const items = Array.from({ length: 10 }, (_, i) => i);
    await runWithConcurrency(items, 3, worker);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
  });

  it('handles empty input', async () => {
    const worker = vi.fn();
    const results = await runWithConcurrency([], 3, worker);
    expect(results).toEqual([]);
    expect(worker).not.toHaveBeenCalled();
  });

  it('clamps the worker count to the number of items', async () => {
    // Two items with limit=5 should spawn at most 2 runners, not 5.
    let seen = 0;
    await runWithConcurrency([1, 2], 5, async () => {
      seen++;
    });
    expect(seen).toBe(2);
  });

  it('passes the index as the second arg to the worker', async () => {
    const pairs = [];
    await runWithConcurrency(['a', 'b', 'c'], 2, async (item, idx) => {
      pairs.push([item, idx]);
    });
    expect(pairs.sort()).toEqual([
      ['a', 0],
      ['b', 1],
      ['c', 2],
    ]);
  });
});
