/**
 * Resolvers for the client-driven recursive classification flow.
 *
 * The browser drives the loop — each invoke runs as the logged-in user, so
 * pages restricted to that user are visible and writable (unlike an async
 * queue handler, which runs `asApp`).
 *
 * Lifecycle:
 *   startRecursiveClassify → processClassifyBatch (repeat) → done
 *                         └─ cancelClassifyJob (anytime) → cleanup
 *
 * The whole thing is scaled by chunk size (CLASSIFY_CHUNK_SIZE). Trees of
 * any size are handled by interleaving discovery and classification across
 * batches — no single invoke ever exceeds Forge's 25 s resolver budget.
 */

import api, { route } from '@forge/api';
import { publishGlobal } from '@forge/realtime';
import {
  classifyPage,
  classifySinglePage,
  findDescendants,
} from '../services/classificationService';
import { getAncestorIds } from '../services/restrictionService';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import { CLASSIFY_CHUNK_SIZE, STALE_JOB_MS } from '../shared/constants';
import {
  appendIdsAsChunks,
  consumeChunk,
  createJob,
  deleteJob,
  getUserJobRoots,
  readJobHeader,
  readNextChunk,
  writeJobHeader,
} from '../services/classifyJobStore';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';

const DISCOVERY_LIMIT = 200; // page of CQL per batch

function isPositiveId(x) {
  return typeof x === 'string' && /^\d+$/.test(x);
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
 * Kicks off a client-driven recursive classification job.
 *
 * Synchronously: classifies the root page (fast, one write), runs one
 * CQL discovery batch asUser (limit=200), writes the first chunks + header,
 * and returns enough for the client to render a progress bar.
 */
export async function startRecursiveClassifyResolver(req) {
  const { pageId, spaceKey, levelId, locale } = req.payload || {};
  const accountId = req.context?.accountId;

  if (!pageId || !spaceKey || !levelId) {
    return validationError('pageId, spaceKey, and levelId are required');
  }
  if (!accountId) {
    return errorResponse('Authentication required', 401);
  }

  try {
    const existing = await readJobHeader(accountId, String(pageId));
    if (existing && existing.status !== 'cancelled') {
      const stale =
        Date.now() - (existing.lastProgressAt || existing.startedAt || 0) >
        STALE_JOB_MS;
      if (!stale) {
        return {
          success: false,
          error: 'job_in_progress',
          message: 'A classification job is already running for this page',
          jobId: String(pageId),
          status: 409,
        };
      }
      // Stale: clean up before starting a new one.
      await deleteJob(accountId, String(pageId));
    }

    // Classify the root page first (asUser so restrictions are honored).
    const rootResult = await classifyPage({
      pageId: String(pageId),
      spaceKey,
      levelId,
      accountId,
      recursive: false,
      locale: locale || 'en',
    });
    if (!rootResult.success) {
      return errorResponse(rootResult.message, 400);
    }
    const parentClassified = rootResult.unchanged ? 0 : 1;

    // Seed discovery + fetch title in parallel (title is best-effort).
    const [descendantBatch, rootTitle] = await Promise.all([
      findDescendants(String(pageId), DISCOVERY_LIMIT, 0),
      fetchPageTitle(String(pageId)),
    ]);
    const { results, totalSize } = descendantBatch;
    const firstIds = (results || []).map((r) => r.id).filter(isPositiveId);
    const discoveryCursor =
      firstIds.length < totalSize ? firstIds.length : null;

    const now = Date.now();
    const header = {
      rootPageId: String(pageId),
      rootTitle,
      spaceKey,
      levelId,
      accountId,
      locale: locale || 'en',
      totalEstimate: totalSize,
      classified: parentClassified,
      failed: 0,
      skipped: 0,
      parentClassified,
      startedAt: now,
      lastProgressAt: now,
      status: 'active',
      nextChunkIdx: 0,
      totalChunks: 0, // filled by createJob
      discoveryCursor,
    };
    await createJob(accountId, String(pageId), header, firstIds);

    return successResponse({
      jobId: String(pageId),
      classified: parentClassified,
      failed: 0,
      skipped: 0,
      totalEstimate: totalSize + parentClassified,
      discoveryDone: discoveryCursor === null,
      done: discoveryCursor === null && firstIds.length === 0,
    });
  } catch (error) {
    console.error('startRecursiveClassify failed:', error);
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
      await deleteJob(accountId, String(jobId));
      return successResponse({
        done: true,
        cancelled: true,
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate + (header.parentClassified || 0),
      });
    }

    // Bail out cleanly if the target level has been removed/disallowed mid-job.
    const spConfig = await getSpaceConfig(header.spaceKey);
    const effectiveConfig = await getEffectiveConfig(header.spaceKey, spConfig);
    const level = effectiveConfig.levels.find((l) => l.id === header.levelId);
    if (!level || !level.allowed) {
      await deleteJob(accountId, String(jobId));
      return successResponse({
        done: true,
        aborted: level ? 'level_disallowed' : 'level_deleted',
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate + (header.parentClassified || 0),
      });
    }

    // Discovery step — one CQL page if there's more to find.
    if (
      header.discoveryCursor !== null &&
      header.discoveryCursor !== undefined
    ) {
      const { results, totalSize } = await findDescendants(
        String(header.rootPageId),
        DISCOVERY_LIMIT,
        header.discoveryCursor,
      );
      const newIds = (results || []).map((r) => r.id).filter(isPositiveId);
      if (newIds.length > 0) {
        const newTotalChunks = await appendIdsAsChunks(
          accountId,
          String(jobId),
          header.totalChunks,
          newIds,
        );
        header.totalChunks = newTotalChunks;
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
      const ids = await readNextChunk(
        accountId,
        String(jobId),
        header.nextChunkIdx,
      );
      if (ids && ids.length > 0) {
        for (const id of ids) {
          try {
            const outcome = await classifySinglePage({
              childPageId: String(id),
              spaceKey: header.spaceKey,
              levelId: header.levelId,
              accountId,
              locale: header.locale,
              level,
              asApp: false, // <-- asUser; the whole point of client-driven
            });
            if (outcome === true) batchClassified++;
            else if (outcome === null) batchSkipped++;
            else batchFailed++;
          } catch (err) {
            console.error(
              `[processClassifyBatch] page=${id} threw:`,
              err?.message || err,
            );
            batchFailed++;
          }
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

    if (done) {
      await deleteJob(accountId, String(jobId));
    } else {
      await writeJobHeader(accountId, String(jobId), header);
    }

    // Ping open stats panels once per batch so the chart refreshes during
    // long recursive jobs. The panel debounces incoming events (1 s), so
    // per-batch frequency is safe — no thundering herd.
    if (batchClassified > 0) {
      try {
        await publishGlobal('classification-changed', {
          source: 'recursive-client',
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
    });
  } catch (error) {
    console.error('processClassifyBatch failed:', error);
    return errorResponse('Failed to process classification batch', 500);
  }
}

/**
 * Explicit stop — deletes everything. Pages already classified stay as-is
 * (no rollback). The caller's next `processClassifyBatch` will see the job
 * gone and return `done: true, cancelled: true`.
 */
export async function cancelClassifyJobResolver(req) {
  const { jobId } = req.payload || {};
  const accountId = req.context?.accountId;
  if (!jobId) return validationError('jobId is required');
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const header = await readJobHeader(accountId, String(jobId));
    await deleteJob(accountId, String(jobId));
    return successResponse({
      cancelled: true,
      classified: header?.classified || 0,
      failed: header?.failed || 0,
      skipped: header?.skipped || 0,
      levelId: header?.levelId || null,
    });
  } catch (error) {
    console.error('cancelClassifyJob failed:', error);
    return errorResponse('Failed to cancel job', 500);
  }
}

/**
 * Returns the list of paused jobs for the current user. Called only when the
 * classify modal opens — not on byline mount, to keep page views cheap.
 *
 * Includes stale-clearance: any job whose `lastProgressAt` is older than
 * STALE_JOB_MS is garbage-collected before the list is returned.
 */
export async function getUserPendingJobsResolver(req) {
  const accountId = req.context?.accountId;
  const currentPageId = req.payload?.currentPageId
    ? String(req.payload.currentPageId)
    : null;
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const roots = await getUserJobRoots(accountId);
    const now = Date.now();
    const jobs = [];
    for (const rootPageId of roots) {
      const header = await readJobHeader(accountId, rootPageId);
      if (!header) {
        // Orphan in the index — clean it up lazily.
        await deleteJob(accountId, rootPageId);
        continue;
      }
      const stale =
        now - (header.lastProgressAt || header.startedAt || 0) > STALE_JOB_MS;
      if (stale || header.status === 'cancelled') {
        await deleteJob(accountId, rootPageId);
        continue;
      }
      jobs.push({
        jobId: rootPageId,
        rootPageId,
        rootTitle: header.rootTitle || null,
        spaceKey: header.spaceKey,
        levelId: header.levelId,
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate + (header.parentClassified || 0),
        discoveryDone:
          header.discoveryCursor === null ||
          header.discoveryCursor === undefined,
        startedAt: header.startedAt,
        lastProgressAt: header.lastProgressAt,
        isSelf: false,
        isAncestor: false,
      });
    }

    // Annotate each job with relation to the current page so the byline can
    // hide the picker when classifying here would conflict with an existing
    // (self- or ancestor-rooted) paused job. Single ancestor fetch covers N
    // pending jobs — cheaper than one call per job.
    if (jobs.length > 0 && currentPageId) {
      let ancestorSet = null;
      for (const job of jobs) {
        if (job.rootPageId === currentPageId) {
          job.isSelf = true;
          continue;
        }
        if (ancestorSet === null) {
          try {
            const ids = await getAncestorIds(currentPageId);
            ancestorSet = new Set(ids);
          } catch (_) {
            ancestorSet = new Set();
          }
        }
        if (ancestorSet.has(job.rootPageId)) {
          job.isAncestor = true;
        }
      }
    }

    return successResponse({ jobs });
  } catch (error) {
    console.error('getUserPendingJobs failed:', error);
    return errorResponse('Failed to list pending jobs', 500);
  }
}

export const __testExports = { DISCOVERY_LIMIT, CLASSIFY_CHUNK_SIZE };
