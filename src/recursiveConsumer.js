/**
 * Async event consumer for background classification jobs.
 * Supports two modes:
 * - Recursive: classify descendants of a page (pageId + levelId)
 * - Reclassify: move all pages from one level to another (fromLevelId + toLevelId)
 * Publishes progress via Forge Realtime and tracks state in KVS.
 */

import { publishGlobal } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import { findDescendantsToClassify, findPagesByLevel, classifySinglePage } from './services/classificationService';
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
  const { fromLevelId } = event.body;

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
 * Shared processing loop for both modes.
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
