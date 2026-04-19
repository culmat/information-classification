/**
 * Index-preserving bounded-concurrency runner.
 *
 * Spawns up to `limit` workers that pull indices from a shared counter and
 * process items in submission order. Returns results in the same order as
 * the input so callers can zip them back into per-item counters without
 * tracking ordering themselves.
 *
 * No external dep — small enough to inline.
 *
 * @param {Array<T>} items
 * @param {number} limit — max in-flight workers
 * @param {(item: T, idx: number) => Promise<R>} worker
 * @returns {Promise<Array<R>>}
 */
export async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  if (items.length === 0) return results;

  let i = 0;
  const runnerCount = Math.min(limit, items.length);
  const runners = Array.from({ length: runnerCount }, async () => {
    while (i < items.length) {
      const idx = i++;
      results[idx] = await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
  return results;
}
