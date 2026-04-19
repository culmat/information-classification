/**
 * KVS-backed state for client-driven recursive classification jobs.
 *
 * Why it exists:
 *   Async queue handlers run `asApp` and can't see pages restricted to the
 *   triggering user. So recursive classification is driven from the browser
 *   (where resolvers run `asUser`). Progress must survive closed tabs, so
 *   each job's state lives in KVS.
 *
 * Shape:
 *   user-jobs:{accountId}                    { rootPageIds: [...] }
 *   job:{accountId}:{rootPageId}             header (metadata + counters)
 *   job:{accountId}:{rootPageId}:chunk:{idx} { ids: [pageId, ...] }
 *
 * Chunks are ~10 page IDs each — a linked list indexed by the header's
 * `nextChunkIdx` (read & delete) and `totalChunks` (append). The chain
 * scales to arbitrarily large trees; no single value ever approaches the
 * 240 KB per-value limit.
 */

import { kvs } from '@forge/kvs';
import { jobChunkKey, jobHeaderKey, userJobsKey } from '../shared/constants';

// --- user-jobs index ---

export async function getUserJobRoots(accountId) {
  const entry = await kvs.get(userJobsKey(accountId));
  return entry?.rootPageIds || [];
}

async function addToUserJobs(accountId, rootPageId) {
  const roots = await getUserJobRoots(accountId);
  if (!roots.includes(rootPageId)) roots.push(rootPageId);
  await kvs.set(userJobsKey(accountId), { rootPageIds: roots });
}

async function removeFromUserJobs(accountId, rootPageId) {
  const roots = await getUserJobRoots(accountId);
  const next = roots.filter((id) => id !== rootPageId);
  if (next.length === 0) {
    await kvs.delete(userJobsKey(accountId));
  } else {
    await kvs.set(userJobsKey(accountId), { rootPageIds: next });
  }
}

// --- header ---

export async function readJobHeader(accountId, rootPageId) {
  return await kvs.get(jobHeaderKey(accountId, rootPageId));
}

export async function writeJobHeader(accountId, rootPageId, header) {
  await kvs.set(jobHeaderKey(accountId, rootPageId), header);
}

// --- chunks ---

async function writeChunk(accountId, rootPageId, idx, ids) {
  await kvs.set(jobChunkKey(accountId, rootPageId, idx), { ids });
}

async function readChunk(accountId, rootPageId, idx) {
  return await kvs.get(jobChunkKey(accountId, rootPageId, idx));
}

async function deleteChunk(accountId, rootPageId, idx) {
  await kvs.delete(jobChunkKey(accountId, rootPageId, idx));
}

// --- high-level operations ---

/**
 * Appends a list of page IDs into chunks of `chunkSize`, starting at
 * `startIdx`. Returns the new `totalChunks` after append.
 */
export async function appendIdsAsChunks(
  accountId,
  rootPageId,
  startIdx,
  ids,
  chunkSize,
) {
  if (!chunkSize || chunkSize < 1) {
    throw new Error('appendIdsAsChunks: chunkSize must be >= 1');
  }
  let idx = startIdx;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    await writeChunk(accountId, rootPageId, idx, slice);
    idx++;
  }
  return idx;
}

/**
 * Reads the next chunk to process and returns its IDs (or null if the
 * current `nextChunkIdx` has no chunk yet — discovery hasn't produced it).
 */
export async function readNextChunk(accountId, rootPageId, nextChunkIdx) {
  const chunk = await readChunk(accountId, rootPageId, nextChunkIdx);
  return chunk?.ids || null;
}

/**
 * Deletes the chunk at `idx`. Caller should increment `nextChunkIdx` in
 * the header after consuming a chunk.
 */
export async function consumeChunk(accountId, rootPageId, idx) {
  await deleteChunk(accountId, rootPageId, idx);
}

/**
 * Writes a new job: header + initial chunks + user-jobs entry. `chunkSize`
 * is stored in the header so `processClassifyBatch` uses the same size when
 * discovery appends more chunks later.
 */
export async function createJob(
  accountId,
  rootPageId,
  header,
  initialIds,
  chunkSize,
) {
  const totalChunks = await appendIdsAsChunks(
    accountId,
    rootPageId,
    0,
    initialIds,
    chunkSize,
  );
  await writeJobHeader(accountId, rootPageId, {
    ...header,
    totalChunks,
    chunkSize,
  });
  await addToUserJobs(accountId, rootPageId);
}

/**
 * Deletes everything: all live chunks (nextChunkIdx..totalChunks-1), the
 * header, and the user-jobs entry. Safe to call multiple times.
 */
export async function deleteJob(accountId, rootPageId) {
  const header = await readJobHeader(accountId, rootPageId);
  if (header) {
    for (let i = header.nextChunkIdx || 0; i < (header.totalChunks || 0); i++) {
      await deleteChunk(accountId, rootPageId, i);
    }
    await kvs.delete(jobHeaderKey(accountId, rootPageId));
  }
  await removeFromUserJobs(accountId, rootPageId);
}
