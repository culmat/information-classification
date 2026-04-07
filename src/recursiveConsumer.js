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
import { findDescendantsToClassify, findPagesByLevel, classifySinglePage } from './services/classificationService';
import { getClassification } from './services/contentPropertyService';
import { findPagesByLabel, removeLabelFromPage, addLabelToPage } from './services/labelService';
import { asyncJobKey } from './shared/constants';
import { getEffectiveConfig } from './storage/configStore';
import { getSpaceConfig } from './storage/spaceConfigStore';

const BATCH_SIZE = 25;
const PROGRESS_INTERVAL = 10; // publish progress every N pages

/**
 * Consumer handler — invoked by Forge async events queue.
 *
 * @param {Object} event - { body, jobId, retryContext }
 */
export async function handler(event) {
  const { mode, fromLevelId } = event.body;

  if (mode === 'import') {
    return handleImport(event);
  }
  if (mode === 'export') {
    return handleExport(event);
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
  const { pageId, spaceKey, levelId, accountId, locale, totalToClassify } = event.body;
  const channel = `classification-progress:${pageId}`;
  const jobKey = asyncJobKey(pageId);

  console.log(`Async classification started: pageId=${pageId}, levelId=${levelId}, total=${totalToClassify}`);

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const level = effectiveConfig.levels.find((l) => l.id === levelId);

  if (!level) {
    console.error(`Level ${levelId} not found in config`);
    await Promise.all([
      publishGlobal(channel, { classified: 0, failed: 0, total: totalToClassify, done: true, error: 'Level not found' }),
      kvs.delete(jobKey),
    ]);
    return;
  }

  const fetchBatch = () => findDescendantsToClassify(pageId, levelId, BATCH_SIZE, 0, { asApp: true });

  await processPages({ channel, jobKey, startedAt, totalToClassify, levelId, spaceKey, accountId, locale, level, fetchBatch });
}

/**
 * Reclassify mode: move all pages from one level to another.
 */
async function handleReclassify(event) {
  const { fromLevelId, toLevelId, accountId, locale, totalToClassify } = event.body;
  const channel = `classification-progress:reclassify-${fromLevelId}`;
  const jobKey = asyncJobKey(`reclassify-${fromLevelId}`);

  console.log(`Reclassify started: ${fromLevelId} → ${toLevelId}, total=${totalToClassify}`);

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  // Load config to find the target level definition
  const effectiveConfig = await getEffectiveConfig();
  const level = effectiveConfig.levels.find((l) => l.id === toLevelId);

  if (!level) {
    console.error(`Target level ${toLevelId} not found in config`);
    await Promise.all([
      publishGlobal(channel, { classified: 0, failed: 0, total: totalToClassify, done: true, error: 'Level not found' }),
      kvs.delete(jobKey),
    ]);
    return;
  }

  // Pages with fromLevelId — they drop out of CQL results once reclassified
  const fetchBatch = () => findPagesByLevel(fromLevelId, BATCH_SIZE, 0, { asApp: true });

  // Reclassify pages need a spaceKey per page — we pass null and classifySinglePage handles it
  await processPages({ channel, jobKey, startedAt, totalToClassify, levelId: toLevelId, spaceKey: null, accountId, locale, level, fetchBatch });
}

/**
 * Import mode: classify pages based on label→level mappings, optionally remove labels.
 */
async function handleImport(event) {
  const { mappings, removeLabels, spaceKey, accountId, locale, totalToClassify } = event.body;
  const channel = 'classification-progress:label-import';
  const jobKey = asyncJobKey('label-import');

  console.log(`Label import started: ${mappings.length} mappings, total=${totalToClassify}, removeLabels=${removeLabels}`);

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
  const sortedMappings = [...mappings].sort((a, b) =>
    (levelIndex.get(a.levelId) ?? 0) - (levelIndex.get(b.levelId) ?? 0)
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
      const { totalSize } = await findPagesByLabel(labelName, 0, 0, spaceKey, { asApp: true });
      if (totalSize === 0) continue;
      const { results } = await findPagesByLabel(labelName, totalSize, 0, spaceKey, { asApp: true });
      console.log(`[import] ${mapping.levelId}/${labelName}: ${results.length} pages`);

      for (const page of results) {
        if (pageLevel.has(page.id)) {
          // Already processed — still remove this label
          if (removeLabels) await removeLabelFromPage(page.id, labelName, true);
          continue;
        }
        try {
          const existing = await getClassification(page.id, { asApp: true });
          const existingIdx = existing?.level ? (levelIndex.get(existing.level) ?? -1) : -1;
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
            for (const l of allImportLabels) {
              await removeLabelFromPage(page.id, l, true);
            }
          }
        } catch (error) {
          console.error(`Failed to import page ${page.id}:`, error);
          failed++;
        }

        if ((classified + failed) % PROGRESS_INTERVAL === 0) {
          await Promise.all([
            publishGlobal(channel, { classified, failed, total: totalToClassify, done: false }),
            kvs.set(jobKey, { total: totalToClassify, startedAt, classified, failed }),
          ]);
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

  await Promise.all([
    publishGlobal(channel, { classified, failed, total: totalToClassify, done: true }),
    kvs.delete(jobKey),
  ]);

  console.log(`Label import complete: classified=${classified}, failed=${failed}`);
}

/**
 * Export mode: add labels to pages based on their classification level.
 */
async function handleExport(event) {
  const { mappings, spaceKey, totalToExport } = event.body;
  const channel = 'classification-progress:label-export';
  const jobKey = asyncJobKey('label-export');

  console.log(`Label export started: ${mappings.length} mappings, total=${totalToExport}`);

  const jobState = await kvs.get(jobKey);
  const startedAt = jobState?.startedAt || Date.now();

  let exported = 0;
  let failed = 0;
  const processed = new Set();

  for (const mapping of mappings) {
    const { levelId, labelName } = mapping;

    // Fetch total count, then all pages in one call (CQL start offset doesn't work with content property aliases)
    const { totalSize } = await findPagesByLevel(levelId, 0, 0, { asApp: true, spaceKey });
    if (totalSize === 0) continue;
    const { results } = await findPagesByLevel(levelId, totalSize, 0, { asApp: true, spaceKey });
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

      if ((exported + failed) % PROGRESS_INTERVAL === 0) {
        await Promise.all([
          publishGlobal(channel, { classified: exported, failed, total: totalToExport, done: false }),
          kvs.set(jobKey, { total: totalToExport, startedAt, classified: exported, failed }),
        ]);
      }
    }
  }

  await Promise.all([
    publishGlobal(channel, { classified: exported, failed, total: totalToExport, done: true }),
    kvs.delete(jobKey),
  ]);

  console.log(`Label export complete: exported=${exported}, failed=${failed}`);
}

/**
 * Shared processing loop for recursive and reclassify modes.
 */
async function processPages({ channel, jobKey, startedAt, totalToClassify, levelId, spaceKey, accountId, locale, level, fetchBatch }) {
  let classified = 0;
  let failed = 0;
  const processed = new Set();

  while (true) {
    const { results } = await fetchBatch();
    if (results.length === 0) break;

    const unprocessed = results.filter((p) => !processed.has(p.id));
    if (unprocessed.length === 0) break;

    for (const page of unprocessed) {
      try {
        const success = await classifySinglePage({ childPageId: page.id, spaceKey, levelId, accountId, locale, level, asApp: true });
        if (success) {
          classified++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to classify page ${page.id}:`, error);
        failed++;
      }
      processed.add(page.id);

      if ((classified + failed) % PROGRESS_INTERVAL === 0) {
        await Promise.all([
          publishGlobal(channel, { classified, failed, total: totalToClassify, done: false }),
          kvs.set(jobKey, { levelId, total: totalToClassify, startedAt, classified, failed }),
        ]);
      }
    }
  }

  await Promise.all([
    publishGlobal(channel, { classified, failed, total: totalToClassify, done: true }),
    kvs.delete(jobKey),
  ]);

  console.log(`Classification complete: classified=${classified}, failed=${failed}`);
}
