/**
 * Async event consumer for background classification jobs.
 * Supports three modes:
 * - Recursive: classify descendants of a page (pageId + levelId)
 * - Reclassify: move all pages from one level to another (fromLevelId + toLevelId)
 * - Import: classify pages by label mapping and optionally remove labels
 * Publishes progress via Forge Realtime and tracks state in KVS.
 */

import { publishGlobal } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import {
  findDescendantsToClassify,
  findPagesByLevel,
  classifySinglePage,
} from './services/classificationService';
import { getClassification } from './services/contentPropertyService';
import {
  findPagesByLabel,
  removeLabelFromPage,
  addLabelToPage,
} from './services/labelService';
import { asyncJobKey } from './shared/constants';
import { getEffectiveConfig } from './storage/configStore';
import { getSpaceConfig } from './storage/spaceConfigStore';

const FETCH_BATCH_SIZE = 200; // pages per CQL fetch (API max is ~200)
const PROGRESS_INTERVAL = 10; // publish progress every N pages
const EARLY_PROGRESS_COUNT = 3; // report every page for the first N pages

/**
 * Fetches ALL pages matching a CQL query by paginating until exhausted.
 * Decouples "find pages" from "process pages" — avoids the CQL index lag race
 * that occurs when the predicate filters pages mutated by the loop itself.
 *
 * @param queryFn - (limit, start) => Promise<{ results, totalSize }>
 * @returns array of all matching pages
 */
async function fetchAllPages(queryFn) {
  const pages = [];
  let start = 0;
  let lastStart = -1;
  while (true) {
    const { results, totalSize } = await queryFn(FETCH_BATCH_SIZE, start);
    if (!results || results.length === 0) break;
    pages.push(...results);
    start += results.length;
    // Only break when we've fetched at least totalSize. Don't trust
    // `results.length < FETCH_BATCH_SIZE` — Confluence's search API can
    // return fewer than requested even when more results exist (causing
    // the last page to be silently dropped).
    if (pages.length >= totalSize) break;
    // Safety: if start didn't advance, we'd loop forever
    if (start === lastStart) break;
    lastStart = start;
  }
  return pages;
}

/**
 * Decides whether to report progress for the current page count.
 * Reports every page early (immediate user feedback) then settles into batches.
 */
function shouldReportProgress(count) {
  return count <= EARLY_PROGRESS_COUNT || count % PROGRESS_INTERVAL === 0;
}

/**
 * Publishes progress to the Realtime channel and persists state in KVS.
 * Called periodically during batch processing.
 */
async function reportProgress(
  channel,
  jobKey,
  { classified, failed, total, startedAt, levelId },
) {
  await Promise.all([
    publishGlobal(channel, { classified, failed, total, done: false }),
    kvs.set(jobKey, {
      total,
      startedAt,
      classified,
      failed,
      ...(levelId !== undefined && { levelId }),
    }),
  ]);
}

/**
 * Publishes final completion event and removes the KVS job key.
 * If `source` is set and any page was classified, also pings the
 * `classification-changed` channel so open stats panels refresh.
 */
async function completeJob(
  channel,
  jobKey,
  { classified, failed, total },
  source,
) {
  await Promise.all([
    publishGlobal(channel, { classified, failed, total, done: true }),
    kvs.delete(jobKey),
  ]);
  if (source && classified > 0) {
    await publishGlobal('classification-changed', { source });
  }
}

/**
 * Consumer handler — invoked by Forge async events queue.
 *
 * @param {Object} event - { body, jobId, retryContext }
 */
export async function handler(event) {
  const { mode, fromLevelId } = event.body;

  if (mode === 'import') {
    return await handleImport(event);
  }
  if (mode === 'export') {
    return await handleExport(event);
  }
  if (fromLevelId) {
    return handleReclassify(event);
  }
  return handleRecursive(event);
}

/**
 * Recursive mode: classify descendants of a specific page.
 */
async function handleRecursive(event) {
  const { pageId, spaceKey, levelId, accountId, locale, totalToClassify } =
    event.body;
  const channel = `classification-progress:${pageId}`;
  const jobKey = asyncJobKey(pageId);

  console.log(
    `Async classification started: pageId=${pageId}, levelId=${levelId}, total=${totalToClassify}`,
  );

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const level = effectiveConfig.levels.find((l) => l.id === levelId);

  if (!level) {
    console.error(`Level ${levelId} not found in config`);
    await Promise.all([
      publishGlobal(channel, {
        classified: 0,
        failed: 0,
        total: totalToClassify,
        done: true,
        error: 'Level not found',
      }),
      kvs.delete(jobKey),
    ]);
    return;
  }

  // Fetch all descendant page IDs up front to avoid the CQL index lag race.
  // Pagination is essential — without it, only the first batch was ever processed.
  const pages = await fetchAllPages((limit, start) =>
    findDescendantsToClassify(pageId, levelId, limit, start, { asApp: true }),
  );
  console.log(
    `Recursive classification: fetched ${pages.length} descendants for pageId=${pageId}`,
  );

  await processPages({
    channel,
    jobKey,
    startedAt,
    totalToClassify,
    levelId,
    spaceKey,
    accountId,
    locale,
    level,
    pages,
    source: 'recursive',
  });
}

/**
 * Reclassify mode: move all pages from one level to another.
 */
async function handleReclassify(event) {
  const { fromLevelId, toLevelId, accountId, locale, totalToClassify } =
    event.body;
  const channel = `classification-progress:reclassify-${fromLevelId}`;
  const jobKey = asyncJobKey(`reclassify-${fromLevelId}`);

  console.log(
    `Reclassify started: ${fromLevelId} → ${toLevelId}, total=${totalToClassify}`,
  );

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  // Load config to find the target level definition
  const effectiveConfig = await getEffectiveConfig();
  const level = effectiveConfig.levels.find((l) => l.id === toLevelId);

  if (!level) {
    console.error(`Target level ${toLevelId} not found in config`);
    await Promise.all([
      publishGlobal(channel, {
        classified: 0,
        failed: 0,
        total: totalToClassify,
        done: true,
        error: 'Level not found',
      }),
      kvs.delete(jobKey),
    ]);
    return;
  }

  // Fetch all pages with fromLevelId up front (paginated) to avoid CQL index lag race
  const pages = await fetchAllPages((limit, start) =>
    findPagesByLevel(fromLevelId, limit, start, { asApp: true }),
  );
  console.log(
    `Reclassify: fetched ${pages.length} pages with level=${fromLevelId}`,
  );

  // Reclassify pages need a spaceKey per page — we pass null and classifySinglePage handles it
  await processPages({
    channel,
    jobKey,
    startedAt,
    totalToClassify,
    levelId: toLevelId,
    spaceKey: null,
    accountId,
    locale,
    level,
    pages,
    source: 'reclassify',
  });
}

/**
 * Import mode: classify pages based on label→level mappings, optionally remove labels.
 */
async function handleImport(event) {
  const {
    mappings,
    removeLabels,
    spaceKey,
    accountId,
    locale,
    totalToClassify,
  } = event.body;
  const channel = 'classification-progress:label-import';
  const jobKey = asyncJobKey('label-import');

  console.log(
    `Label import started: ${mappings.length} mappings, total=${totalToClassify}, removeLabels=${removeLabels}`,
  );

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  const effectiveConfig = await getEffectiveConfig();

  // Collect all label names for bulk removal — when a page has multiple labels, remove them all
  const allImportLabels = new Set();
  if (removeLabels) {
    for (const m of mappings) {
      for (const l of m.labels) allImportLabels.add(l);
    }
  }

  let classified = 0;
  let failed = 0;
  // Track pageId → level index so conflicts resolve to the most restrictive level
  const pageLevel = new Map(); // pageId → index in effectiveConfig.levels
  const levelIndex = new Map(effectiveConfig.levels.map((l, i) => [l.id, i]));

  // Sort mappings so most restrictive levels are processed last (highest index last).
  // This means the final classification for a conflicting page is always the most restrictive.
  const sortedMappings = [...mappings].sort(
    (a, b) =>
      (levelIndex.get(a.levelId) ?? 0) - (levelIndex.get(b.levelId) ?? 0),
  );

  for (const mapping of sortedMappings) {
    const level = effectiveConfig.levels.find((l) => l.id === mapping.levelId);
    if (!level) {
      console.error(`Level ${mapping.levelId} not found, skipping`);
      continue;
    }
    const thisLevelIdx = levelIndex.get(mapping.levelId) ?? 0;

    for (const labelName of mapping.labels) {
      // Fetch all pages with this label at once (CQL offset doesn't work reliably with label index lag)
      const { results } = await findPagesByLabel(labelName, 5000, 0, spaceKey, {
        asApp: true,
      });
      if (results.length === 0) continue;
      console.log(
        `[import] ${mapping.levelId}/${labelName}: ${results.length} pages`,
      );

      for (const page of results) {
        if (pageLevel.has(page.id)) {
          // Already processed — still remove this label
          if (removeLabels) await removeLabelFromPage(page.id, labelName, true);
          continue;
        }
        try {
          const existing = await getClassification(page.id, { asApp: true });
          const existingIdx = existing?.level
            ? (levelIndex.get(existing.level) ?? -1)
            : -1;
          if (existingIdx >= thisLevelIdx) {
            // Already at same or more restrictive level — don't reclassify
            pageLevel.set(page.id, existingIdx);
            classified++;
          } else {
            const success = await classifySinglePage({
              childPageId: page.id,
              spaceKey,
              levelId: mapping.levelId,
              accountId,
              locale,
              level,
              asApp: true,
            });
            if (success) {
              classified++;
              pageLevel.set(page.id, thisLevelIdx);
            } else {
              failed++;
            }
          }
          // Remove ALL import labels from this page (handles multi-label pages)
          if (removeLabels) {
            await Promise.all(
              allImportLabels.map((l) => removeLabelFromPage(page.id, l, true)),
            );
          }
        } catch (error) {
          console.error(`Failed to import page ${page.id}:`, error);
          failed++;
        }

        if (shouldReportProgress(classified + failed)) {
          await reportProgress(channel, jobKey, {
            classified,
            failed,
            total: totalToClassify,
            startedAt,
          });
        }
      }
    }
  }

  // Save import log
  await kvs.set(`import-log:${Date.now()}`, {
    date: new Date().toISOString(),
    mappings: mappings.map((m) => ({ levelId: m.levelId, labels: m.labels })),
    removeLabels,
    scope: spaceKey || 'all',
    totalClassified: classified,
    totalFailed: failed,
  });

  await completeJob(
    channel,
    jobKey,
    { classified, failed, total: totalToClassify },
    'import',
  );

  console.log(
    `Label import complete: classified=${classified}, failed=${failed}`,
  );
}

/**
 * Export mode: add labels to pages based on their classification level.
 */
async function handleExport(event) {
  const { mappings, spaceKey, totalToExport } = event.body;
  const channel = 'classification-progress:label-export';
  const jobKey = asyncJobKey('label-export');

  console.log(
    `Label export started: ${mappings.length} mappings, total=${totalToExport}`,
  );

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  let exported = 0;
  let failed = 0;
  const processed = new Set();

  for (const mapping of mappings) {
    const { levelId, labelName } = mapping;

    // Fetch all pages at once (CQL start offset doesn't work reliably with content property aliases)
    const { results } = await findPagesByLevel(levelId, 5000, 0, {
      asApp: true,
      spaceKey,
    });
    if (results.length === 0) continue;
    console.log(`[export] ${levelId}/${labelName}: ${results.length} pages`);

    for (const page of results) {
      if (processed.has(page.id)) continue;
      try {
        const success = await addLabelToPage(page.id, labelName, true);
        if (success) {
          exported++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to label page ${page.id}:`, error);
        failed++;
      }
      processed.add(page.id);

      if (shouldReportProgress(exported + failed)) {
        await reportProgress(channel, jobKey, {
          classified: exported,
          failed,
          total: totalToExport,
          startedAt,
        });
      }
    }
  }

  await completeJob(channel, jobKey, {
    classified: exported,
    failed,
    total: totalToExport,
  });

  console.log(`Label export complete: exported=${exported}, failed=${failed}`);
}

/**
 * Shared processing loop for recursive and reclassify modes.
 * Pages are pre-fetched (paginated) by the caller — no CQL race condition.
 */
async function processPages({
  channel,
  jobKey,
  startedAt,
  totalToClassify,
  levelId,
  spaceKey,
  accountId,
  locale,
  level,
  pages,
  source,
}) {
  let classified = 0;
  let failed = 0;

  for (const page of pages) {
    try {
      const success = await classifySinglePage({
        childPageId: page.id,
        spaceKey,
        levelId,
        accountId,
        locale,
        level,
        asApp: true,
      });
      if (success) {
        classified++;
      } else {
        console.error(
          `classifySinglePage returned false for page ${page.id} (title=${page.title})`,
        );
        failed++;
      }
    } catch (error) {
      console.error(`Failed to classify page ${page.id}:`, error);
      failed++;
    }

    // Report frequently early for fast user feedback, then settle into batches
    if (shouldReportProgress(classified + failed)) {
      await reportProgress(channel, jobKey, {
        classified,
        failed,
        total: totalToClassify,
        startedAt,
        levelId,
      });
    }
  }

  await completeJob(
    channel,
    jobKey,
    { classified, failed, total: totalToClassify },
    source,
  );

  console.log(
    `Classification complete: classified=${classified}, failed=${failed}`,
  );
}
