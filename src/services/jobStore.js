/**
 * KVS-backed state for client-driven long-running jobs (bulk-classify,
 * label-import, label-export).
 *
 * Why it exists:
 *   Async queue handlers run `asApp` and can't see pages restricted to the
 *   triggering user. So these jobs are driven from the browser (where
 *   resolvers run `asUser`). Progress must survive closed tabs, so each
 *   job's state lives in KVS.
 *
 * Shape:
 *   user-jobs:{accountId}                { activeJobId, queuedJobIds }
 *   job:{accountId}:{jobId}              header (common envelope + kind payload)
 *   job:{accountId}:{jobId}:chunk:{idx}  { ids: [pageId, ...], ... }
 *   scope-locks:bulk                     [ { jobId, ownerAccountId, ... } ]
 *
 * Queue semantics:
 *   - Per user: one `activeJobId` (or null) plus FIFO `queuedJobIds`.
 *     Promotion happens inside start / onJobComplete.
 *   - Global bulk-classify scope lock prevents two jobs (any user, any state)
 *     with overlapping page scope from running concurrently.
 */

import { kvs } from '@forge/kvs';
import {
  BULK_SCOPE_LOCKS_KEY,
  STALE_JOB_MS,
  jobChunkKey,
  jobHeaderKey,
  userJobsKey,
} from '../shared/constants';
import { getAncestorIds } from './restrictionService';

// --- per-user index --------------------------------------------------------

/**
 * Reads the user's queue slot. Back-compat: if the legacy shape
 * `{ rootPageIds: [...] }` is seen, upgrade it in place to
 * `{ activeJobId: null, queuedJobIds: [...] }` and flip any referenced
 * headers back to `status: 'queued'` so the new queue can promote cleanly.
 */
export async function readUserIndex(accountId) {
  const entry = await kvs.get(userJobsKey(accountId));
  if (!entry) return { activeJobId: null, queuedJobIds: [] };
  if (Array.isArray(entry.rootPageIds)) {
    const migrated = {
      activeJobId: null,
      queuedJobIds: [...entry.rootPageIds],
    };
    for (const jobId of migrated.queuedJobIds) {
      const h = await kvs.get(jobHeaderKey(accountId, jobId));
      if (h && h.status === 'active') {
        h.status = 'queued';
        await kvs.set(jobHeaderKey(accountId, jobId), h);
      }
    }
    await kvs.set(userJobsKey(accountId), migrated);
    return migrated;
  }
  return {
    activeJobId: entry.activeJobId ?? null,
    queuedJobIds: Array.isArray(entry.queuedJobIds) ? entry.queuedJobIds : [],
  };
}

async function writeUserIndex(accountId, index) {
  if (!index.activeJobId && (index.queuedJobIds || []).length === 0) {
    await kvs.delete(userJobsKey(accountId));
    return;
  }
  await kvs.set(userJobsKey(accountId), {
    activeJobId: index.activeJobId ?? null,
    queuedJobIds: Array.isArray(index.queuedJobIds) ? index.queuedJobIds : [],
  });
}

// --- headers & chunks ------------------------------------------------------

export async function readJobHeader(accountId, jobId) {
  return await kvs.get(jobHeaderKey(accountId, jobId));
}

export async function writeJobHeader(accountId, jobId, header) {
  await kvs.set(jobHeaderKey(accountId, jobId), header);
}

async function writeChunk(accountId, jobId, idx, payload) {
  await kvs.set(jobChunkKey(accountId, jobId, idx), payload);
}

async function readChunk(accountId, jobId, idx) {
  return await kvs.get(jobChunkKey(accountId, jobId, idx));
}

async function deleteChunk(accountId, jobId, idx) {
  await kvs.delete(jobChunkKey(accountId, jobId, idx));
}

/**
 * Appends a list of page IDs into chunks of `chunkSize`, starting at
 * `startIdx`. Returns the new totalChunks after append. Optional `extra`
 * lets callers (label jobs) attach per-chunk metadata like `mappingIdx`.
 */
export async function appendIdsAsChunks(
  accountId,
  jobId,
  startIdx,
  ids,
  chunkSize,
  extra = {},
) {
  if (!chunkSize || chunkSize < 1) {
    throw new Error('appendIdsAsChunks: chunkSize must be >= 1');
  }
  let idx = startIdx;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const slice = ids.slice(i, i + chunkSize);
    await writeChunk(accountId, jobId, idx, { ids: slice, ...extra });
    idx++;
  }
  return idx;
}

export async function readNextChunk(accountId, jobId, nextChunkIdx) {
  const chunk = await readChunk(accountId, jobId, nextChunkIdx);
  return chunk || null;
}

export async function consumeChunk(accountId, jobId, idx) {
  await deleteChunk(accountId, jobId, idx);
}

// --- lifecycle -------------------------------------------------------------

/**
 * Writes a new job: header + initial chunks + append to `queuedJobIds`.
 * Does NOT promote — callers decide whether to call `promoteNextIfIdle`
 * after creating so they can short-circuit the "immediately active" path.
 */
export async function createJob(
  accountId,
  jobId,
  header,
  initialIds,
  chunkSize,
  chunkExtra = {},
) {
  const totalChunks = await appendIdsAsChunks(
    accountId,
    jobId,
    0,
    initialIds,
    chunkSize,
    chunkExtra,
  );
  await writeJobHeader(accountId, jobId, {
    ...header,
    totalChunks,
    chunkSize,
  });
  const index = await readUserIndex(accountId);
  if (index.activeJobId !== jobId && !index.queuedJobIds.includes(jobId)) {
    index.queuedJobIds.push(jobId);
    await writeUserIndex(accountId, index);
  }
}

/**
 * Deletes a job's live chunks + header. Caller is responsible for removing
 * the jobId from the user's index (see `onJobComplete`). Safe to call
 * multiple times.
 */
async function purgeJobStorage(accountId, jobId) {
  const header = await kvs.get(jobHeaderKey(accountId, jobId));
  if (header) {
    for (let i = header.nextChunkIdx || 0; i < (header.totalChunks || 0); i++) {
      await deleteChunk(accountId, jobId, i);
    }
    await kvs.delete(jobHeaderKey(accountId, jobId));
  }
}

/**
 * If the active slot is free and there's a queued job, promote the first
 * queued → active (flip header.status, set startedAt). Returns the new
 * activeJobId (or null if still idle).
 */
export async function promoteNextIfIdle(accountId) {
  const index = await readUserIndex(accountId);
  if (index.activeJobId) return index.activeJobId;
  if (index.queuedJobIds.length === 0) {
    await writeUserIndex(accountId, index);
    return null;
  }
  const nextId = index.queuedJobIds.shift();
  const header = await readJobHeader(accountId, nextId);
  if (!header) {
    // orphan — drop and recurse
    await writeUserIndex(accountId, index);
    return await promoteNextIfIdle(accountId);
  }
  header.status = 'active';
  header.startedAt = header.startedAt || Date.now();
  header.lastProgressAt = Date.now();
  await writeJobHeader(accountId, nextId, header);
  index.activeJobId = nextId;
  await writeUserIndex(accountId, index);
  return nextId;
}

/**
 * Full cleanup for a finished job: release scope lock (for bulk-classify),
 * delete chunks + header, remove from user index, then promote next queued.
 * Returns the newly-promoted activeJobId (or null). Idempotent.
 */
export async function onJobComplete(accountId, jobId) {
  const header = await readJobHeader(accountId, jobId);
  if (header && header.jobKind === 'bulk-classify') {
    await releaseBulkScopeLock(jobId);
  }
  await purgeJobStorage(accountId, jobId);
  const index = await readUserIndex(accountId);
  let changed = false;
  if (index.activeJobId === jobId) {
    index.activeJobId = null;
    changed = true;
  }
  const before = index.queuedJobIds.length;
  index.queuedJobIds = index.queuedJobIds.filter((id) => id !== jobId);
  if (index.queuedJobIds.length !== before) changed = true;
  if (changed) await writeUserIndex(accountId, index);
  return await promoteNextIfIdle(accountId);
}

// --- queue introspection ---------------------------------------------------

/**
 * Returns `{ activeJob, queuedJobs }` with full header objects. Performs GC:
 *   - stale active (lastProgressAt older than STALE_JOB_MS) is demoted to
 *     the front of the queue (status → 'queued', active slot cleared).
 *   - orphan jobIds (no header) are pruned.
 *   - cancelled headers are purged.
 *   - orphan scope-lock entries for this user are swept.
 * After GC, idempotently promotes if the active slot is free.
 */
export async function getUserJobs(accountId) {
  let index = await readUserIndex(accountId);
  const now = Date.now();

  // GC active slot
  if (index.activeJobId) {
    const header = await readJobHeader(accountId, index.activeJobId);
    if (!header) {
      index.activeJobId = null;
    } else if (header.status === 'cancelled') {
      if (header.jobKind === 'bulk-classify') {
        await releaseBulkScopeLock(index.activeJobId);
      }
      await purgeJobStorage(accountId, index.activeJobId);
      index.activeJobId = null;
    } else {
      const stale =
        now - (header.lastProgressAt || header.startedAt || 0) > STALE_JOB_MS;
      if (stale) {
        header.status = 'queued';
        await writeJobHeader(accountId, index.activeJobId, header);
        index.queuedJobIds.unshift(index.activeJobId);
        index.activeJobId = null;
      }
    }
  }

  // GC queued
  const freshQueued = [];
  for (const jobId of index.queuedJobIds) {
    const header = await readJobHeader(accountId, jobId);
    if (!header) continue;
    if (header.status === 'cancelled') {
      if (header.jobKind === 'bulk-classify') {
        await releaseBulkScopeLock(jobId);
      }
      await purgeJobStorage(accountId, jobId);
      continue;
    }
    freshQueued.push(jobId);
  }
  index.queuedJobIds = freshQueued;

  await writeUserIndex(accountId, index);
  await sweepOrphanBulkScopeLocks(accountId);

  // Try promote after GC.
  const promotedId = await promoteNextIfIdle(accountId);
  if (promotedId) index = await readUserIndex(accountId);

  const activeJob = index.activeJobId
    ? await readJobHeader(accountId, index.activeJobId)
    : null;
  const queuedJobs = [];
  for (const jobId of index.queuedJobIds) {
    const h = await readJobHeader(accountId, jobId);
    if (h) queuedJobs.push(h);
  }
  return { activeJob, queuedJobs };
}

// --- bulk-classify global scope lock --------------------------------------

async function readBulkScopeLocks() {
  const entry = await kvs.get(BULK_SCOPE_LOCKS_KEY);
  return Array.isArray(entry?.locks) ? entry.locks : [];
}

async function writeBulkScopeLocks(locks) {
  if (!locks || locks.length === 0) {
    await kvs.delete(BULK_SCOPE_LOCKS_KEY);
    return;
  }
  await kvs.set(BULK_SCOPE_LOCKS_KEY, { locks });
}

/**
 * Two bulk-classify entries overlap iff they could mutate the same set of
 * pages. Rules (see plan):
 *   - fromLevel vs fromLevel: overlap iff same sourceLevelFilter.
 *   - descendants vs descendants: overlap iff one ancestor-chain contains
 *     the other's root (equal roots included).
 *   - mixed: conservative — treat as overlapping.
 */
export function overlapsBulk(a, b) {
  const ak = a.scope?.kind;
  const bk = b.scope?.kind;
  if (ak === 'fromLevel' && bk === 'fromLevel') {
    return a.sourceLevelFilter === b.sourceLevelFilter;
  }
  if (ak === 'descendants' && bk === 'descendants') {
    if (!a.ancestorChain || !b.ancestorChain) return true;
    const aRoot = String(a.scope.rootPageId);
    const bRoot = String(b.scope.rootPageId);
    if (aRoot === bRoot) return true;
    if (a.ancestorChain.includes(bRoot)) return true;
    if (b.ancestorChain.includes(aRoot)) return true;
    return false;
  }
  return true;
}

/**
 * Tries to reserve a global bulk-classify scope lock. Returns
 * `{ ok: true }` on success (the entry is appended), or
 * `{ ok: false, conflict }` if any existing entry overlaps.
 *
 * For `scope.kind === 'descendants'`, the caller must supply
 * `entry.ancestorChain` (via `buildDescendantsLockEntry` below) so the
 * overlap check has ancestry info.
 */
export async function tryAcquireBulkScopeLock(entry) {
  const locks = await readBulkScopeLocks();
  for (const existing of locks) {
    if (overlapsBulk(entry, existing)) {
      return { ok: false, conflict: existing };
    }
  }
  locks.push(entry);
  await writeBulkScopeLocks(locks);
  return { ok: true };
}

export async function releaseBulkScopeLock(jobId) {
  const locks = await readBulkScopeLocks();
  const filtered = locks.filter((l) => l.jobId !== jobId);
  if (filtered.length !== locks.length) await writeBulkScopeLocks(filtered);
}

/**
 * Builds a descendants-scope lock entry with its ancestor chain resolved
 * so the overlap check is fast and synchronous thereafter.
 */
export async function buildDescendantsLockEntry({
  jobId,
  ownerAccountId,
  rootPageId,
  sourceLevelFilter,
  targetLevelId,
}) {
  let ancestors = [];
  try {
    ancestors = await getAncestorIds(String(rootPageId));
  } catch (_) {
    ancestors = [];
  }
  return {
    jobId,
    ownerAccountId,
    scope: { kind: 'descendants', rootPageId: String(rootPageId) },
    sourceLevelFilter: sourceLevelFilter ?? null,
    targetLevelId,
    ancestorChain: [...ancestors, String(rootPageId)],
  };
}

export function buildFromLevelLockEntry({
  jobId,
  ownerAccountId,
  sourceLevelFilter,
  targetLevelId,
}) {
  return {
    jobId,
    ownerAccountId,
    scope: { kind: 'fromLevel' },
    sourceLevelFilter,
    targetLevelId,
  };
}

/**
 * Removes scope-lock entries whose job header no longer exists for the
 * owning user. Cheap sweep on the current user's slice only.
 */
async function sweepOrphanBulkScopeLocks(accountId) {
  const locks = await readBulkScopeLocks();
  if (locks.length === 0) return;
  const mine = locks.filter((l) => l.ownerAccountId === accountId);
  if (mine.length === 0) return;
  const alive = [];
  for (const l of locks) {
    if (l.ownerAccountId !== accountId) {
      alive.push(l);
      continue;
    }
    const header = await readJobHeader(accountId, l.jobId);
    if (header) alive.push(l);
  }
  if (alive.length !== locks.length) await writeBulkScopeLocks(alive);
}

// --- legacy exports kept for any external callers --------------------------

/**
 * @deprecated use onJobComplete. Retained for back-compat with resolvers
 * that haven't migrated yet; routes through the same cleanup so the queue
 * stays consistent.
 */
export async function deleteJob(accountId, jobId) {
  await onJobComplete(accountId, jobId);
}

/**
 * @deprecated — returns just the jobIds in the queue slot (active first,
 * then queued). Kept so the legacy pending-jobs resolver still compiles;
 * new code should call `getUserJobs`.
 */
export async function getUserJobRoots(accountId) {
  const { activeJob, queuedJobs } = await getUserJobs(accountId);
  const ids = [];
  if (activeJob) ids.push(activeJob.jobId);
  for (const j of queuedJobs) ids.push(j.jobId);
  return ids;
}
