/**
 * Resolvers for the client-driven bulk-classify flow.
 *
 * The browser drives the loop — each invoke runs as the logged-in user, so
 * pages restricted to that user are visible and writable (unlike an async
 * queue handler, which runs `asApp`).
 *
 * Lifecycle:
 *   startBulkClassify → processClassifyBatch (repeat) → done
 *                    └─ cancelClassifyJob (anytime) → cleanup
 *
 * Scope kinds:
 *   - `descendants` — pages under a given root page (used by the byline's
 *     "apply to sub-pages" flow; root is classified synchronously first).
 *   - `fromLevel`   — site-wide pages currently at `sourceLevelFilter`
 *     (used by the admin Bulk Classify tab to replace the old async
 *     reclassify path).
 *
 * Chunk size is computed per job from the total page estimate (see
 * computeClassifyChunkSize). Discovery and classification interleave across
 * batches so no single invoke exceeds Forge's 25 s resolver budget.
 *
 * Queue semantics live in jobStore: per-user FIFO queue (one active + N
 * queued), plus a cross-user scope-overlap lock preventing two jobs that
 * could touch the same pages from running concurrently.
 */

import api, { route } from '@forge/api';
import { publishGlobal } from '@forge/realtime';
import {
  classifyPage,
  classifySinglePage,
  findPagesByScope,
} from '../services/classificationService';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import {
  CLASSIFY_CONCURRENCY,
  computeClassifyChunkSize,
} from '../shared/constants';
import { runWithConcurrency } from '../utils/concurrency';
import {
  appendIdsAsChunks,
  buildDescendantsLockEntry,
  buildFromLevelLockEntry,
  consumeChunk,
  createJob,
  getUserJobs,
  onJobComplete,
  promoteNextIfIdle,
  readJobHeader,
  readNextChunk,
  releaseBulkScopeLock,
  tryAcquireBulkScopeLock,
  writeJobHeader,
} from '../services/jobStore';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';

const DISCOVERY_LIMIT = 200; // page of CQL per batch

function isPositiveId(x) {
  return typeof x === 'string' && /^\d+$/.test(x);
}

function newJobId(kind) {
  const rand =
    (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}-${rand}`;
}

/**
 * Fetches a page title for display in resume banners. Best-effort — if it
 * fails (page deleted, permission), we fall back to `null` and the banner
 * degrades to "Paused classification to <Level>".
 */
async function fetchPageTitle(pageId) {
  try {
    const response = await api
      .asUser()
      .requestConfluence(route`/wiki/api/v2/pages/${pageId}`, {
        headers: { Accept: 'application/json' },
      });
    if (!response.ok) return null;
    const data = await response.json();
    return data?.title || null;
  } catch (_) {
    return null;
  }
}

/**
 * Start a bulk-classify job. Accepts:
 *   { scope: { kind, rootPageId? }, sourceLevelFilter, targetLevelId,
 *     spaceKey?, locale? }
 *
 * Creates the job header with `status: 'queued'`, reserves the global
 * scope lock (rejecting overlap against any user's live job), then
 * promotes to active iff the user's slot is free.
 */
export async function startBulkClassifyResolver(req) {
  const accountId = req.context?.accountId;
  if (!accountId) return errorResponse('Authentication required', 401);

  const payload = req.payload || {};
  const scope = payload.scope;
  const sourceLevelFilter = payload.sourceLevelFilter ?? null;
  const targetLevelId = payload.targetLevelId;
  const spaceKey = payload.spaceKey || null;
  const locale = payload.locale || req.context?.locale || 'en';

  if (!scope || !scope.kind) {
    return validationError('scope.kind is required');
  }
  if (!targetLevelId) {
    return validationError('targetLevelId is required');
  }
  if (scope.kind === 'descendants') {
    if (!scope.rootPageId)
      return validationError('scope.rootPageId is required');
    if (!spaceKey)
      return validationError('spaceKey is required for descendants scope');
  } else if (scope.kind === 'fromLevel') {
    if (!sourceLevelFilter) {
      return validationError(
        'sourceLevelFilter is required for fromLevel scope',
      );
    }
    if (sourceLevelFilter === targetLevelId) {
      return validationError('sourceLevelFilter and targetLevelId must differ');
    }
  } else {
    return validationError(`Unknown scope kind: ${scope.kind}`);
  }

  // Validate target against the effective config (use root-page's space
  // when we have one; fall back to global for site-wide jobs).
  const spConfig = spaceKey ? await getSpaceConfig(spaceKey) : null;
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const target = effectiveConfig.levels.find((l) => l.id === targetLevelId);
  if (!target || !target.allowed) {
    return errorResponse(`Target level "${targetLevelId}" is not allowed`, 400);
  }
  if (sourceLevelFilter) {
    const src = effectiveConfig.levels.find((l) => l.id === sourceLevelFilter);
    if (!src)
      return errorResponse(
        `Source level "${sourceLevelFilter}" not found`,
        400,
      );
  }

  const jobId = newJobId('bulk');
  let lockEntry;
  try {
    if (scope.kind === 'descendants') {
      lockEntry = await buildDescendantsLockEntry({
        jobId,
        ownerAccountId: accountId,
        rootPageId: scope.rootPageId,
        sourceLevelFilter,
        targetLevelId,
      });
    } else {
      lockEntry = buildFromLevelLockEntry({
        jobId,
        ownerAccountId: accountId,
        sourceLevelFilter,
        targetLevelId,
      });
    }
    const acq = await tryAcquireBulkScopeLock(lockEntry);
    if (!acq.ok) {
      const conflict = acq.conflict;
      return {
        success: false,
        error: 'scope_conflict',
        message:
          'Another classification job with an overlapping scope is already running or queued.',
        ownerAccountId: conflict.ownerAccountId,
        existingJobId: conflict.jobId,
        reason:
          conflict.scope?.kind === 'descendants'
            ? 'descendants_ancestry'
            : conflict.scope?.kind === 'fromLevel'
              ? 'fromLevel'
              : 'mixed_scope',
        status: 409,
      };
    }

    // Synchronous first step varies by scope.
    const now = Date.now();
    let firstIds = [];
    let totalSize = 0;
    let parentClassified = 0;
    let rootTitle = null;

    if (scope.kind === 'descendants') {
      // Classify the root page first (asUser so restrictions are honored).
      const rootResult = await classifyPage({
        pageId: String(scope.rootPageId),
        spaceKey,
        levelId: targetLevelId,
        accountId,
        locale,
      });
      if (!rootResult.success) {
        await releaseBulkScopeLock(jobId);
        return errorResponse(rootResult.message, 400);
      }
      parentClassified = rootResult.unchanged ? 0 : 1;

      const [descendantBatch, title] = await Promise.all([
        findPagesByScope(
          { kind: 'descendants', rootPageId: String(scope.rootPageId) },
          sourceLevelFilter,
          DISCOVERY_LIMIT,
          0,
        ),
        fetchPageTitle(String(scope.rootPageId)),
      ]);
      rootTitle = title;
      firstIds = (descendantBatch.results || [])
        .map((r) => r.id)
        .filter(isPositiveId);
      totalSize = descendantBatch.totalSize || 0;
    } else {
      const batch = await findPagesByScope(
        { kind: 'fromLevel' },
        sourceLevelFilter,
        DISCOVERY_LIMIT,
        0,
      );
      firstIds = (batch.results || []).map((r) => r.id).filter(isPositiveId);
      totalSize = batch.totalSize || 0;
    }

    const discoveryCursor =
      firstIds.length < totalSize ? firstIds.length : null;
    const chunkSize = computeClassifyChunkSize(totalSize);
    const header = {
      jobId,
      jobKind: 'bulk-classify',
      accountId,
      locale,
      scope:
        scope.kind === 'descendants'
          ? { kind: 'descendants', rootPageId: String(scope.rootPageId) }
          : { kind: 'fromLevel' },
      sourceLevelFilter,
      targetLevelId,
      spaceKey,
      rootTitle,
      // Back-compat fields used by progress/UI:
      rootPageId:
        scope.kind === 'descendants' ? String(scope.rootPageId) : null,
      levelId: targetLevelId, // legacy alias for the UI
      totalEstimate: totalSize,
      classified: parentClassified,
      failed: 0,
      skipped: 0,
      parentClassified,
      status: 'queued',
      queuedAt: now,
      startedAt: null,
      lastProgressAt: now,
      nextChunkIdx: 0,
      totalChunks: 0, // set by createJob
      chunkSize,
      discoveryCursor,
    };
    await createJob(accountId, jobId, header, firstIds, chunkSize);

    const promotedJobId = await promoteNextIfIdle(accountId);
    const promoted = promotedJobId === jobId;

    // If we didn't promote, fetch queue position for the UI.
    let queuePosition = 0;
    if (!promoted) {
      const { queuedJobs } = await getUserJobs(accountId);
      queuePosition = queuedJobs.findIndex((j) => j.jobId === jobId);
      if (queuePosition < 0) queuePosition = queuedJobs.length;
    }

    return successResponse({
      jobId,
      promoted,
      queuePosition: promoted ? 0 : queuePosition + 1,
      classified: parentClassified,
      failed: 0,
      skipped: 0,
      totalEstimate: totalSize + parentClassified,
      discoveryDone: discoveryCursor === null,
      done: promoted && discoveryCursor === null && firstIds.length === 0,
    });
  } catch (error) {
    console.error('startBulkClassify failed:', error);
    try {
      await releaseBulkScopeLock(jobId);
    } catch (_) {}
    return errorResponse('Failed to start classification', 500);
  }
}

/**
 * Processes one batch: advances discovery if there's more, classifies one
 * chunk if one is available, writes updated header. Budgeted to stay under
 * 25 s.
 */
export async function processClassifyBatchResolver(req) {
  const { jobId } = req.payload || {};
  const accountId = req.context?.accountId;
  if (!jobId) return validationError('jobId is required');
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const header = await readJobHeader(accountId, String(jobId));
    if (!header) {
      return successResponse({ done: true, missing: true });
    }
    if (header.status === 'cancelled') {
      const promotedNextJobId = await onJobComplete(accountId, String(jobId));
      return successResponse({
        done: true,
        cancelled: true,
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate + (header.parentClassified || 0),
        promotedNextJobId,
      });
    }
    if (header.status === 'queued') {
      // The client called us without the slot being active. Try to promote
      // (handles the race where two tabs race startBulkClassify).
      const promoted = await promoteNextIfIdle(accountId);
      if (promoted !== String(jobId)) {
        return successResponse({
          classified: header.classified,
          failed: header.failed,
          skipped: header.skipped,
          totalEstimate: header.totalEstimate + (header.parentClassified || 0),
          discoveryDone:
            header.discoveryCursor === null ||
            header.discoveryCursor === undefined,
          done: false,
          queued: true,
        });
      }
    }

    // Bail out cleanly if the target level has been removed/disallowed mid-job.
    const spConfig = header.spaceKey
      ? await getSpaceConfig(header.spaceKey)
      : null;
    const effectiveConfig = await getEffectiveConfig(header.spaceKey, spConfig);
    const level = effectiveConfig.levels.find(
      (l) => l.id === header.targetLevelId,
    );
    if (!level || !level.allowed) {
      const promotedNextJobId = await onJobComplete(accountId, String(jobId));
      return successResponse({
        done: true,
        aborted: level ? 'level_disallowed' : 'level_deleted',
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate + (header.parentClassified || 0),
        promotedNextJobId,
      });
    }

    // Discovery step — one CQL page if there's more to find.
    if (
      header.discoveryCursor !== null &&
      header.discoveryCursor !== undefined
    ) {
      const { results, totalSize } = await findPagesByScope(
        header.scope,
        header.sourceLevelFilter,
        DISCOVERY_LIMIT,
        header.discoveryCursor,
      );
      const newIds = (results || []).map((r) => r.id).filter(isPositiveId);
      if (newIds.length > 0) {
        const chunkSize =
          header.chunkSize ||
          computeClassifyChunkSize(header.totalEstimate || 0);
        const newTotalChunks = await appendIdsAsChunks(
          accountId,
          String(jobId),
          header.totalChunks,
          newIds,
          chunkSize,
        );
        header.totalChunks = newTotalChunks;
        if (!header.chunkSize) header.chunkSize = chunkSize;
      }
      const advanced = header.discoveryCursor + (results?.length || 0);
      header.discoveryCursor =
        !results || results.length === 0 || advanced >= totalSize
          ? null
          : advanced;
      header.totalEstimate = totalSize;
    }

    // Classification step — consume the next chunk if there is one.
    let batchClassified = 0;
    let batchSkipped = 0;
    let batchFailed = 0;
    if (header.nextChunkIdx < header.totalChunks) {
      const chunk = await readNextChunk(
        accountId,
        String(jobId),
        header.nextChunkIdx,
      );
      const ids = chunk?.ids || [];
      if (ids.length > 0) {
        const outcomes = await runWithConcurrency(
          ids,
          CLASSIFY_CONCURRENCY,
          async (id) => {
            try {
              return await classifySinglePage({
                childPageId: String(id),
                spaceKey: header.spaceKey,
                levelId: header.targetLevelId,
                accountId,
                locale: header.locale,
                level,
                asApp: false,
              });
            } catch (err) {
              console.error(
                `classifySinglePage threw for page=${id}:`,
                err?.message || err,
              );
              return false;
            }
          },
        );
        for (const outcome of outcomes) {
          if (outcome === true) batchClassified++;
          else if (outcome === null) batchSkipped++;
          else batchFailed++;
        }
      }
      await consumeChunk(accountId, String(jobId), header.nextChunkIdx);
      header.nextChunkIdx++;
    }

    header.classified += batchClassified;
    header.skipped += batchSkipped;
    header.failed += batchFailed;
    header.lastProgressAt = Date.now();

    const done =
      (header.discoveryCursor === null ||
        header.discoveryCursor === undefined) &&
      header.nextChunkIdx >= header.totalChunks;

    let promotedNextJobId = null;
    if (done) {
      const durationMs = Date.now() - (header.startedAt || Date.now());
      console.log(
        `[classify-job] done jobId=${jobId} classified=${header.classified} failed=${header.failed} skipped=${header.skipped} durationMs=${durationMs}`,
      );
      promotedNextJobId = await onJobComplete(accountId, String(jobId));
    } else {
      await writeJobHeader(accountId, String(jobId), header);
    }

    // Ping open stats panels once per batch so the chart refreshes during
    // long jobs. The panel debounces (1 s), so per-batch frequency is safe.
    if (batchClassified > 0) {
      try {
        await publishGlobal('classification-changed', {
          source: 'bulk-classify',
          spaceKey: header.spaceKey,
        });
      } catch (err) {
        console.warn('publishGlobal classification-changed failed:', err);
      }
    }

    return successResponse({
      classified: header.classified,
      failed: header.failed,
      skipped: header.skipped,
      totalEstimate: header.totalEstimate + (header.parentClassified || 0),
      discoveryDone:
        header.discoveryCursor === null || header.discoveryCursor === undefined,
      done,
      promotedNextJobId,
    });
  } catch (error) {
    console.error('processClassifyBatch failed:', error);
    return errorResponse('Failed to process classification batch', 500);
  }
}

/**
 * Explicit stop — deletes the job and promotes the next queued job if any.
 * Pages already classified stay as-is (no rollback).
 */
export async function cancelClassifyJobResolver(req) {
  const { jobId } = req.payload || {};
  const accountId = req.context?.accountId;
  if (!jobId) return validationError('jobId is required');
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const header = await readJobHeader(accountId, String(jobId));
    const promotedNextJobId = await onJobComplete(accountId, String(jobId));
    return successResponse({
      cancelled: true,
      classified: header?.classified || 0,
      failed: header?.failed || 0,
      skipped: header?.skipped || 0,
      levelId: header?.targetLevelId || null,
      promotedNextJobId,
    });
  } catch (error) {
    console.error('cancelClassifyJob failed:', error);
    return errorResponse('Failed to cancel job', 500);
  }
}

/**
 * Preview count for the admin Bulk Classify tab. Returns the CQL
 * totalSize for the given scope + source-level filter.
 */
export async function countBulkClassifyScopeResolver(req) {
  const accountId = req.context?.accountId;
  if (!accountId) return errorResponse('Authentication required', 401);

  const { scope, sourceLevelFilter } = req.payload || {};
  if (!scope || !scope.kind) return validationError('scope.kind is required');
  if (scope.kind === 'fromLevel' && !sourceLevelFilter) {
    return validationError('sourceLevelFilter required for fromLevel scope');
  }
  try {
    const { totalSize } = await findPagesByScope(
      scope,
      sourceLevelFilter ?? null,
      0,
      0,
    );
    return successResponse({ count: totalSize });
  } catch (error) {
    console.error('countBulkClassifyScope failed:', error);
    return errorResponse('Failed to count pages', 500);
  }
}

/**
 * Returns `{ activeJob, queuedJobs }` for the current user — unified
 * across bulk-classify + label-import + label-export. GC happens inside
 * getUserJobs. Includes self/ancestor annotation for byline UX on
 * bulk-classify jobs when `currentPageId` is supplied.
 */
export async function getUserJobsResolver(req) {
  const accountId = req.context?.accountId;
  const currentPageId = req.payload?.currentPageId
    ? String(req.payload.currentPageId)
    : null;
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const { activeJob, queuedJobs } = await getUserJobs(accountId);

    // Normalize for the wire. UI-facing summary fields per kind.
    const toWire = (h) => {
      const base = {
        jobId: h.jobId,
        jobKind: h.jobKind,
        status: h.status,
        classified: h.classified,
        failed: h.failed,
        skipped: h.skipped,
        totalEstimate: h.totalEstimate + (h.parentClassified || 0),
        discoveryDone:
          h.discoveryDone ??
          (h.discoveryCursor === null || h.discoveryCursor === undefined),
        startedAt: h.startedAt,
        lastProgressAt: h.lastProgressAt,
        queuedAt: h.queuedAt,
      };
      if (h.jobKind === 'bulk-classify') {
        return {
          ...base,
          scope: h.scope,
          sourceLevelFilter: h.sourceLevelFilter,
          targetLevelId: h.targetLevelId,
          // Byline-friendly aliases:
          rootPageId: h.rootPageId || null,
          rootTitle: h.rootTitle || null,
          spaceKey: h.spaceKey || null,
          levelId: h.targetLevelId, // legacy UI alias
          isSelf: false,
          isAncestor: false,
        };
      }
      return {
        ...base,
        spaceKey: h.spaceKey || null,
        mappings: h.mappings,
        removeLabels: !!h.removeLabels,
      };
    };

    const active = activeJob ? toWire(activeJob) : null;
    const queued = queuedJobs.map(toWire);

    // Ancestor annotation on bulk-classify descendants for byline UX.
    if (currentPageId) {
      const entries = [
        ...(active && active.jobKind === 'bulk-classify' ? [active] : []),
        ...queued.filter((j) => j.jobKind === 'bulk-classify'),
      ];
      if (entries.some((j) => j.scope?.kind === 'descendants')) {
        let ancestorSet = null;
        for (const j of entries) {
          if (j.scope?.kind !== 'descendants' || !j.rootPageId) continue;
          if (j.rootPageId === currentPageId) {
            j.isSelf = true;
            continue;
          }
          if (ancestorSet === null) {
            try {
              const { getAncestorIds } =
                await import('../services/restrictionService');
              ancestorSet = new Set(await getAncestorIds(currentPageId));
            } catch (_) {
              ancestorSet = new Set();
            }
          }
          if (ancestorSet.has(j.rootPageId)) j.isAncestor = true;
        }
      }
    }

    return successResponse({ activeJob: active, queuedJobs: queued });
  } catch (error) {
    console.error('getUserJobs failed:', error);
    return errorResponse('Failed to list jobs', 500);
  }
}

export const __testExports = { DISCOVERY_LIMIT };
