/**
 * Shared helper for enqueuing async classification jobs.
 * Consolidates the repeated pattern of: create Queue → push event → persist KVS job state.
 * Used by resolvers that kick off background work (recursive classify, reclassify, import, export).
 */

import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { asyncJobKey } from '../shared/constants';

/**
 * Enqueues a background job and persists its initial state in KVS.
 *
 * @param {string} jobKeyId - identifier for the KVS job key (e.g. pageId, 'label-import')
 * @param {Object} body - event payload for the async consumer
 * @param {string} concurrencyKey - concurrency group key (limits to 1 concurrent job per key)
 * @param {number} total - total items to process (for progress tracking)
 * @returns {Promise<{ jobId: string }>}
 */
export async function enqueueJob(jobKeyId, body, concurrencyKey, total) {
  const queue = new Queue({ key: 'classification-queue' });
  const { jobId } = await queue.push({
    body,
    concurrency: { key: concurrencyKey, limit: 1 },
  });

  await kvs.set(asyncJobKey(jobKeyId), {
    jobId,
    total,
    startedAt: Date.now(),
    classified: 0,
    failed: 0,
  });

  return { jobId };
}
