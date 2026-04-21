/**
 * Resolvers for the client-driven label import/export flow.
 *
 * Mirror of classifyJobResolver, same lifecycle:
 *   start(Import|Export) → processLabel(Import|Export)Batch (repeat) → done
 *                       └─ cancelLabel(Import|Export)Job (anytime) → cleanup
 *
 * The browser drives the loop so every invoke runs `asUser`, which means
 * pages restricted to the admin are processed (the async-queue handlers ran
 * `asApp` and silently dropped those). Discovery is interleaved with
 * processing and cursor-based so the 5 000-page CQL cap goes away too.
 *
 * Header shape on top of the shared jobStore record:
 *   jobKind       'label-import' | 'label-export'
 *   mappings      per-flow: [{ levelId, labels:[...] }] (import)
 *                            [{ levelId, labelName }]   (export)
 *   workItems     flattened discovery list — one entry per (mapping, label)
 *                 for import, one per mapping for export
 *   workIdx       index into workItems of the current discovery step
 *   workCursor    CQL offset inside the current work item
 *   discoveryDone bool; true once workIdx === workItems.length
 *   removeLabels  import only
 *   allImportLabels  import only; flat list of every label across mappings
 *                    (used at work-time for multi-label page cleanup)
 *
 * Chunk shape: { ids: [pageId, ...], mappingIdx }.
 * `mappingIdx` lets the worker find the level/label to apply without
 * replaying discovery.
 */

import api, { route } from '@forge/api';
import { publishGlobal } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import { classifySinglePage } from '../services/classificationService';
import { getClassification } from '../services/contentPropertyService';
import { addLabelToPage, removeLabelFromPage } from '../services/labelService';
import { getGlobalConfig, getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import {
  CLASSIFY_CONCURRENCY,
  buildSpaceFilter,
  computeClassifyChunkSize,
  isValidLabel,
  jobChunkKey,
} from '../shared/constants';
import { runWithConcurrency } from '../utils/concurrency';
import {
  consumeChunk,
  createJob,
  getUserJobs,
  onJobComplete,
  promoteNextIfIdle,
  readJobHeader,
  writeJobHeader,
} from '../services/jobStore';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';

const DISCOVERY_LIMIT = 200;

function isPositiveId(x) {
  return typeof x === 'string' && /^\d+$/.test(x);
}

// --- CQL helpers (asUser so restrictions are honoured) ---

// CQL `label != "X"` does NOT match pages that have no labels at all (null
// values are excluded from negative predicates), so it can't be used to
// discover the "needs a label" set directly. Instead we discover the full
// parent set (`level = X` or `label = X`) and filter client-side via the
// expanded labels — reliable regardless of how labels are attached.
async function cqlSearch(cql, limit, start, expand = null) {
  const url = expand
    ? route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&start=${start}&expand=${expand}`
    : route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&start=${start}`;
  const response = await api
    .asUser()
    .requestConfluence(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) return { results: [], totalSize: 0 };
  const data = await response.json();
  return {
    results: (data.results || []).map((r) => ({
      id: String(r.content.id),
      title: r.content.title,
      labels: (r.content.metadata?.labels?.results || []).map((l) => l.name),
    })),
    totalSize: data.totalSize || 0,
  };
}

// Discovery CQL for label-import: pages carrying the label. The per-page
// worker (classifySinglePage) skips pages already at a same-or-stricter
// level via `never_weaken`, so no client-side filter needed here.
function importDiscoveryCql(labelName, spaceKey) {
  return `type=page AND label = "${labelName}"${buildSpaceFilter(spaceKey)}`;
}

// Discovery CQL for label-export: all pages at the level. Client-side
// filter (via expanded `metadata.labels`) drops pages that already carry
// the target label.
function exportDiscoveryCql(levelId, spaceKey) {
  return `type=page AND culmat_classification_level = "${levelId}"${buildSpaceFilter(spaceKey)}`;
}

// Gap estimate for export: classified − alreadyLabelled. Two CQL counts,
// subtraction — same recipe as countLevelGapResolver in the admin UI, so
// the progress-bar total matches the "To Label" column exactly.
async function exportGapEstimate(levelId, labelName, spaceKey) {
  const classifiedCql = exportDiscoveryCql(levelId, spaceKey);
  const alreadyLabelledCql = `${classifiedCql} AND label = "${labelName}"`;
  const [cRes, aRes] = await Promise.all([
    cqlSearch(classifiedCql, 0, 0),
    cqlSearch(alreadyLabelledCql, 0, 0),
  ]);
  return Math.max(0, cRes.totalSize - aRes.totalSize);
}

// Gap estimate for import: labelled − alreadyAtTarget. Same subtraction
// approach; `classifySinglePage` inside the worker takes care of the
// never_weaken skip for pages at more-restrictive levels.
async function importGapEstimate(labelName, targetLevelId, spaceKey) {
  const labelledCql = importDiscoveryCql(labelName, spaceKey);
  const atTargetCql = `${labelledCql} AND culmat_classification_level = "${targetLevelId}"`;
  const [lRes, aRes] = await Promise.all([
    cqlSearch(labelledCql, 0, 0),
    cqlSearch(atTargetCql, 0, 0),
  ]);
  return Math.max(0, lRes.totalSize - aRes.totalSize);
}

// --- chunk helpers (scoped to this flow so the shared store stays generic) ---

async function writeLabelChunk(accountId, jobId, idx, ids, mappingIdx) {
  await kvs.set(jobChunkKey(accountId, jobId, idx), { ids, mappingIdx });
}

async function readLabelChunk(accountId, jobId, idx) {
  return await kvs.get(jobChunkKey(accountId, jobId, idx));
}

/**
 * Builds an opaque label-job id. Uses crypto.randomUUID when available,
 * falling back to a timestamp/random blend on older runtimes.
 */
function newLabelJobId(kind) {
  const rand =
    (typeof crypto !== 'undefined' && crypto.randomUUID?.()) ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  return `${kind}-${rand}`;
}

/**
 * Canonicalises a label job's mapping set to a stable fingerprint so the
 * same user can't queue the exact same import/export twice.
 */
function labelJobFingerprint(kind, mappings, spaceKey) {
  const normalised = mappings
    .map((m) => {
      if (kind === 'label-import') {
        return { levelId: m.levelId, labels: [...(m.labels || [])].sort() };
      }
      return { levelId: m.levelId, labelName: m.labelName };
    })
    .sort((a, b) => a.levelId.localeCompare(b.levelId));
  return `${kind}:${spaceKey || ''}:${JSON.stringify(normalised)}`;
}

/**
 * Checks whether the current user already has a label job queued or
 * active with the same fingerprint. Used to block duplicates per user.
 */
async function findDuplicateLabelJob(accountId, kind, mappings, spaceKey) {
  const fingerprint = labelJobFingerprint(kind, mappings, spaceKey);
  const { activeJob, queuedJobs } = await getUserJobs(accountId);
  const all = [...(activeJob ? [activeJob] : []), ...queuedJobs];
  return all.find(
    (j) =>
      j.jobKind === kind &&
      labelJobFingerprint(kind, j.mappings || [], j.spaceKey) === fingerprint,
  );
}

// ---------------------------------------------------------------------------
// startLabelImport
// ---------------------------------------------------------------------------

/**
 * Validates import mappings against the current config.
 */
async function validateImportMappings(mappings) {
  const config = await getGlobalConfig();
  const allowedIds = new Set(
    config.levels.filter((l) => l.allowed).map((l) => l.id),
  );
  for (const m of mappings) {
    if (!m.levelId || !allowedIds.has(m.levelId)) {
      return `Invalid or disallowed level: ${m.levelId}`;
    }
    if (!Array.isArray(m.labels) || m.labels.length === 0) {
      return `Mapping for level "${m.levelId}" must have at least one label`;
    }
    for (const l of m.labels) {
      if (!isValidLabel(l)) return `Invalid label format: ${l}`;
    }
  }
  return null;
}

/**
 * Sorts mappings by level restrictiveness so the most-restrictive level is
 * processed last. When a page carries labels that resolve to multiple levels,
 * the final classification wins — preserving the "most-restrictive wins"
 * behaviour of the old async handler.
 */
async function sortMappingsByRestrictiveness(mappings) {
  const config = await getGlobalConfig();
  const idx = new Map(config.levels.map((l, i) => [l.id, i]));
  return [...mappings].sort(
    (a, b) => (idx.get(a.levelId) ?? 0) - (idx.get(b.levelId) ?? 0),
  );
}

export async function startLabelImportResolver(req) {
  const accountId = req.context?.accountId;
  if (!accountId) return errorResponse('Authentication required', 401);

  const { mappings, removeLabels, spaceKey } = req.payload || {};
  const locale = req.context?.locale || 'en';

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return validationError('No mappings provided');
  }
  const invalid = await validateImportMappings(mappings);
  if (invalid) return errorResponse(invalid, 400);

  try {
    const sortedMappings = await sortMappingsByRestrictiveness(mappings);

    // Flatten to per-(mapping, label) work items so discovery paginates
    // through each label of each mapping in turn.
    const workItems = [];
    for (let mi = 0; mi < sortedMappings.length; mi++) {
      for (const labelName of sortedMappings[mi].labels) {
        workItems.push({ mappingIdx: mi, labelName });
      }
    }

    const allImportLabels = Array.from(
      new Set(sortedMappings.flatMap((m) => m.labels)),
    );

    // Total estimate uses the "To Classify" gap (labelled − alreadyAtTarget)
    // per (mapping × label). Pages at a stricter level still pass discovery
    // and get skipped by the per-page worker (never_weaken), so the gap is
    // an upper bound — matches the number shown in the admin UI.
    let totalEstimate = 0;
    for (const item of workItems) {
      const mapping = sortedMappings[item.mappingIdx];
      totalEstimate += await importGapEstimate(
        item.labelName,
        mapping.levelId,
        spaceKey || null,
      );
    }
    if (totalEstimate === 0) {
      return successResponse({ count: 0 });
    }

    const dup = await findDuplicateLabelJob(
      accountId,
      'label-import',
      sortedMappings,
      spaceKey || null,
    );
    if (dup) {
      return {
        success: false,
        error: 'duplicate_job',
        existingJobId: dup.jobId,
        status: 409,
      };
    }

    const jobId = newLabelJobId('label-import');
    const chunkSize = computeClassifyChunkSize(totalEstimate);

    // First discovery step inline: all pages carrying the first label.
    const firstWi = workItems[0];
    const firstCql = importDiscoveryCql(firstWi.labelName, spaceKey || null);
    const first = await cqlSearch(firstCql, DISCOVERY_LIMIT, 0);
    const firstIds = (first.results || [])
      .map((r) => r.id)
      .filter(isPositiveId);
    const firstTotal = first.totalSize || 0;

    let workIdx = 0;
    let workCursor = firstIds.length;
    if (workCursor >= firstTotal) {
      workIdx = 1;
      workCursor = 0;
    }
    const discoveryDone = workIdx >= workItems.length;

    const now = Date.now();
    const header = {
      jobId,
      jobKind: 'label-import',
      accountId,
      locale,
      spaceKey: spaceKey || null,
      mappings: sortedMappings,
      allImportLabels,
      removeLabels: !!removeLabels,
      workItems,
      workIdx,
      workCursor,
      discoveryDone,
      totalEstimate,
      classified: 0,
      failed: 0,
      skipped: 0,
      status: 'queued',
      queuedAt: now,
      startedAt: null,
      lastProgressAt: now,
      nextChunkIdx: 0,
      totalChunks: 0, // set by createJob
      chunkSize,
    };
    await createJob(accountId, jobId, header, firstIds, chunkSize, {
      mappingIdx: workItems[0].mappingIdx,
    });
    const promotedJobId = await promoteNextIfIdle(accountId);
    const promoted = promotedJobId === jobId;

    let queuePosition = 0;
    if (!promoted) {
      const { queuedJobs } = await getUserJobs(accountId);
      queuePosition = queuedJobs.findIndex((j) => j.jobId === jobId) + 1;
      if (queuePosition <= 0) queuePosition = queuedJobs.length + 1;
    }

    return successResponse({
      jobId,
      promoted,
      queuePosition: promoted ? 0 : queuePosition,
      classified: 0,
      failed: 0,
      skipped: 0,
      totalEstimate,
      discoveryDone,
      done: promoted && discoveryDone && firstIds.length === 0,
    });
  } catch (error) {
    console.error('startLabelImport failed:', error);
    return errorResponse('Failed to start label import', 500);
  }
}

// ---------------------------------------------------------------------------
// startLabelExport
// ---------------------------------------------------------------------------

async function validateExportMappings(mappings) {
  const config = await getGlobalConfig();
  const knownIds = new Set(config.levels.map((l) => l.id));
  for (const m of mappings) {
    if (!m.levelId || !knownIds.has(m.levelId)) {
      return `Unknown level: ${m.levelId}`;
    }
    if (!isValidLabel(m.labelName)) {
      return `Mapping for level "${m.levelId}" has invalid labelName: ${m.labelName}`;
    }
  }
  return null;
}

export async function startLabelExportResolver(req) {
  const accountId = req.context?.accountId;
  if (!accountId) return errorResponse('Authentication required', 401);

  const { mappings, spaceKey } = req.payload || {};
  const locale = req.context?.locale || 'en';

  if (!Array.isArray(mappings) || mappings.length === 0) {
    return validationError('No mappings provided');
  }
  const invalid = await validateExportMappings(mappings);
  if (invalid) return errorResponse(invalid, 400);

  try {
    // One work item per mapping. Discovery fetches the full classified set
    // per level and filters client-side (via expanded metadata.labels) to
    // skip pages that already carry the target label.
    const workItems = mappings.map((_, mi) => ({ mappingIdx: mi }));

    let totalEstimate = 0;
    for (const m of mappings) {
      totalEstimate += await exportGapEstimate(
        m.levelId,
        m.labelName,
        spaceKey || null,
      );
    }
    if (totalEstimate === 0) {
      return successResponse({ count: 0 });
    }

    const dup = await findDuplicateLabelJob(
      accountId,
      'label-export',
      mappings,
      spaceKey || null,
    );
    if (dup) {
      return {
        success: false,
        error: 'duplicate_job',
        existingJobId: dup.jobId,
        status: 409,
      };
    }

    const jobId = newLabelJobId('label-export');
    const chunkSize = computeClassifyChunkSize(totalEstimate);

    const firstMapping = mappings[workItems[0].mappingIdx];
    const firstCql = exportDiscoveryCql(firstMapping.levelId, spaceKey || null);
    const first = await cqlSearch(
      firstCql,
      DISCOVERY_LIMIT,
      0,
      'content.metadata.labels',
    );
    const rawResults = first.results || [];
    const firstIds = rawResults
      .filter((r) => !(r.labels || []).includes(firstMapping.labelName))
      .map((r) => r.id)
      .filter(isPositiveId);
    const firstTotal = first.totalSize || 0;

    let workIdx = 0;
    let workCursor = rawResults.length;
    if (workCursor >= firstTotal) {
      workIdx = 1;
      workCursor = 0;
    }
    const discoveryDone = workIdx >= workItems.length;

    const now = Date.now();
    const header = {
      jobId,
      jobKind: 'label-export',
      accountId,
      locale,
      spaceKey: spaceKey || null,
      mappings,
      workItems,
      workIdx,
      workCursor,
      discoveryDone,
      totalEstimate,
      classified: 0,
      failed: 0,
      skipped: 0,
      status: 'queued',
      queuedAt: now,
      startedAt: null,
      lastProgressAt: now,
      nextChunkIdx: 0,
      totalChunks: 0,
      chunkSize,
    };
    await createJob(accountId, jobId, header, firstIds, chunkSize, {
      mappingIdx: workItems[0].mappingIdx,
    });
    const promotedJobId = await promoteNextIfIdle(accountId);
    const promoted = promotedJobId === jobId;

    let queuePosition = 0;
    if (!promoted) {
      const { queuedJobs } = await getUserJobs(accountId);
      queuePosition = queuedJobs.findIndex((j) => j.jobId === jobId) + 1;
      if (queuePosition <= 0) queuePosition = queuedJobs.length + 1;
    }

    return successResponse({
      jobId,
      promoted,
      queuePosition: promoted ? 0 : queuePosition,
      classified: 0,
      failed: 0,
      skipped: 0,
      totalEstimate,
      discoveryDone,
      done: promoted && discoveryDone && firstIds.length === 0,
    });
  } catch (error) {
    console.error('startLabelExport failed:', error);
    return errorResponse('Failed to start label export', 500);
  }
}

// ---------------------------------------------------------------------------
// processLabelBatch — shared between import and export
// ---------------------------------------------------------------------------

/**
 * Applies the import-side work to one page:
 *   - classify the page to the mapping's level if it isn't already at a
 *     more-restrictive level (never_weaken)
 *   - if removeLabels, strip every import-label from the page (multi-label
 *     safe)
 * Returns:
 *   true   → classification happened
 *   null   → page was already at a stricter level (skipped but counted clean)
 *   false  → write failed
 */
async function applyImportToPage({
  pageId,
  mapping,
  allImportLabels,
  removeLabels,
  accountId,
  locale,
  spaceKey,
  levelIndex,
  level,
}) {
  const thisLevelIdx = levelIndex.get(mapping.levelId) ?? 0;
  let outcome = null;
  try {
    const existing = await getClassification(pageId, { asApp: false });
    const existingIdx = existing?.level
      ? (levelIndex.get(existing.level) ?? -1)
      : -1;
    if (existingIdx >= thisLevelIdx) {
      outcome = null; // skip — not weaker
    } else {
      const ok = await classifySinglePage({
        childPageId: pageId,
        spaceKey,
        levelId: mapping.levelId,
        accountId,
        locale,
        level,
        asApp: false,
      });
      outcome = ok === true ? true : ok === null ? null : false;
    }
    if (removeLabels && allImportLabels.length > 0) {
      await Promise.all(
        allImportLabels.map((l) => removeLabelFromPage(pageId, l, false)),
      );
    }
  } catch (err) {
    console.error(`applyImportToPage(${pageId}) failed:`, err?.message || err);
    outcome = false;
  }
  return outcome;
}

/**
 * Applies the export-side work to one page: add the target label.
 * Returns true on success, false on failure.
 */
async function applyExportToPage({ pageId, labelName }) {
  try {
    return await addLabelToPage(pageId, labelName, false);
  } catch (err) {
    console.error(`applyExportToPage(${pageId}) failed:`, err?.message || err);
    return false;
  }
}

/**
 * Runs one CQL page of discovery for the current work item, writes any new
 * ids as chunks, advances work cursor (or work index).
 */
async function discoverOneBatch(accountId, jobId, header) {
  const wi = header.workItems[header.workIdx];
  if (!wi) return;

  const mapping = header.mappings[wi.mappingIdx];
  let cql;
  let expand = null;
  if (header.jobKind === 'label-import') {
    cql = importDiscoveryCql(wi.labelName, header.spaceKey);
  } else {
    cql = exportDiscoveryCql(mapping.levelId, header.spaceKey);
    expand = 'content.metadata.labels';
  }
  const res = await cqlSearch(
    cql,
    DISCOVERY_LIMIT,
    header.workCursor || 0,
    expand,
  );
  const rawResults = res.results || [];
  // Cursor advancement uses the RAW result length so we don't re-walk pages
  // we've already seen. Filtering only decides which ones get chunked.
  const results =
    header.jobKind === 'label-export'
      ? rawResults.filter((r) => !(r.labels || []).includes(mapping.labelName))
      : rawResults;
  const totalSize = res.totalSize || 0;

  const ids = results.map((r) => r.id).filter(isPositiveId);
  if (ids.length > 0) {
    const cs = header.chunkSize || 3;
    for (let i = 0; i < ids.length; i += cs) {
      const slice = ids.slice(i, i + cs);
      await writeLabelChunk(
        accountId,
        jobId,
        header.totalChunks,
        slice,
        wi.mappingIdx,
      );
      header.totalChunks++;
    }
  }

  // Advance by raw results so we don't re-walk pages the filter skipped.
  const advanced = (header.workCursor || 0) + rawResults.length;
  if (!rawResults.length || advanced >= totalSize) {
    header.workIdx++;
    header.workCursor = 0;
  } else {
    header.workCursor = advanced;
  }
  if (header.workIdx >= header.workItems.length) {
    header.discoveryDone = true;
  }
}

export async function processLabelBatchResolver(req) {
  const { jobId } = req.payload || {};
  const accountId = req.context?.accountId;
  if (!jobId) return validationError('jobId is required');
  if (!accountId) return errorResponse('Authentication required', 401);

  try {
    const header = await readJobHeader(accountId, String(jobId));
    if (!header) return successResponse({ done: true, missing: true });

    if (header.status === 'cancelled') {
      const promotedNextJobId = await onJobComplete(accountId, String(jobId));
      return successResponse({
        done: true,
        cancelled: true,
        classified: header.classified,
        failed: header.failed,
        skipped: header.skipped,
        totalEstimate: header.totalEstimate,
        promotedNextJobId,
      });
    }
    if (header.status === 'queued') {
      const promoted = await promoteNextIfIdle(accountId);
      if (promoted !== String(jobId)) {
        return successResponse({
          classified: header.classified,
          failed: header.failed,
          skipped: header.skipped,
          totalEstimate: header.totalEstimate,
          discoveryDone: !!header.discoveryDone,
          done: false,
          queued: true,
        });
      }
    }

    // Discovery step
    if (!header.discoveryDone && header.workIdx < header.workItems.length) {
      await discoverOneBatch(accountId, String(jobId), header);
    }

    // Work step
    let batchClassified = 0;
    let batchSkipped = 0;
    let batchFailed = 0;
    if (header.nextChunkIdx < header.totalChunks) {
      const chunk = await readLabelChunk(
        accountId,
        String(jobId),
        header.nextChunkIdx,
      );
      const ids = chunk?.ids || [];
      const mappingIdx = chunk?.mappingIdx ?? 0;
      const mapping = header.mappings[mappingIdx];

      if (ids.length > 0 && mapping) {
        if (header.jobKind === 'label-import') {
          const spConfig = await getSpaceConfig(header.spaceKey);
          const effectiveConfig = await getEffectiveConfig(
            header.spaceKey,
            spConfig,
          );
          const level = effectiveConfig.levels.find(
            (l) => l.id === mapping.levelId,
          );
          if (!level || !level.allowed) {
            const promotedNextJobId = await onJobComplete(
              accountId,
              String(jobId),
            );
            return successResponse({
              done: true,
              aborted: level ? 'level_disallowed' : 'level_deleted',
              classified: header.classified,
              failed: header.failed,
              skipped: header.skipped,
              totalEstimate: header.totalEstimate,
              promotedNextJobId,
            });
          }
          const levelIndex = new Map(
            effectiveConfig.levels.map((l, i) => [l.id, i]),
          );
          const outcomes = await runWithConcurrency(
            ids,
            CLASSIFY_CONCURRENCY,
            (id) =>
              applyImportToPage({
                pageId: String(id),
                mapping,
                allImportLabels: header.allImportLabels || [],
                removeLabels: !!header.removeLabels,
                accountId,
                locale: header.locale,
                spaceKey: header.spaceKey,
                levelIndex,
                level,
              }),
          );
          for (const o of outcomes) {
            if (o === true) batchClassified++;
            else if (o === null) batchSkipped++;
            else batchFailed++;
          }
        } else {
          // label-export
          const outcomes = await runWithConcurrency(
            ids,
            CLASSIFY_CONCURRENCY,
            (id) =>
              applyExportToPage({
                pageId: String(id),
                labelName: mapping.labelName,
              }),
          );
          for (const o of outcomes) {
            if (o === true) batchClassified++;
            else batchFailed++;
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
      header.discoveryDone && header.nextChunkIdx >= header.totalChunks;

    let promotedNextJobId = null;
    if (done) {
      const durationMs = Date.now() - (header.startedAt || Date.now());
      console.log(
        `[label-job] done jobId=${jobId} kind=${header.jobKind} classified=${header.classified} failed=${header.failed} skipped=${header.skipped} durationMs=${durationMs}`,
      );
      promotedNextJobId = await onJobComplete(accountId, String(jobId));
    } else {
      await writeJobHeader(accountId, String(jobId), header);
    }

    // Only `label-import` changes classification levels. `label-export`
    // only adds labels — the level distribution is unchanged, so there's
    // nothing for StatisticsPanel to refresh. Publishing anyway would
    // trigger one getAuditData per batch, which on slow instances
    // compounds into a gateway timeout storm.
    if (batchClassified > 0 && header.jobKind === 'label-import') {
      try {
        await publishGlobal('classification-changed', {
          source: header.jobKind,
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
      totalEstimate: header.totalEstimate,
      discoveryDone: header.discoveryDone,
      done,
      promotedNextJobId,
    });
  } catch (error) {
    console.error('processLabelBatch failed:', error);
    return errorResponse('Failed to process label batch', 500);
  }
}

// ---------------------------------------------------------------------------
// cancel + pending listing
// ---------------------------------------------------------------------------

export async function cancelLabelJobResolver(req) {
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
      jobKind: header?.jobKind || null,
      promotedNextJobId,
    });
  } catch (error) {
    console.error('cancelLabelJob failed:', error);
    return errorResponse('Failed to cancel label job', 500);
  }
}

export const __testExports = {
  DISCOVERY_LIMIT,
  applyImportToPage,
  applyExportToPage,
};
