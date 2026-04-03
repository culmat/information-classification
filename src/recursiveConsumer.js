/**
 * Async event consumer for large recursive classifications.
 * Processes pages in background (up to 10 minutes) using CQL to find
 * only pages that need changes. Publishes progress via Forge Realtime.
 */

import { publishGlobal } from '@forge/realtime';
import { findDescendantsToClassify, classifySinglePage } from './services/classificationService';
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
  const { pageId, spaceKey, levelId, accountId, locale, totalToClassify } = event.body;
  const channel = `classification-progress:${pageId}`;

  console.log(`Async classification started: pageId=${pageId}, levelId=${levelId}, total=${totalToClassify}`);

  // Load the level definition for classifySinglePage
  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const level = effectiveConfig.levels.find((l) => l.id === levelId);

  if (!level) {
    console.error(`Level ${levelId} not found in config`);
    await publishGlobal(channel, { classified: 0, failed: 0, total: totalToClassify, done: true, error: 'Level not found' });
    return;
  }

  let classified = 0;
  let failed = 0;

  while (true) {
    // Always fetch from startIndex=0 — classified pages drop out of the CQL result set
    const { results } = await findDescendantsToClassify(pageId, levelId, BATCH_SIZE, 0);
    if (results.length === 0) break;

    for (const page of results) {
      try {
        const success = await classifySinglePage({ childPageId: page.id, spaceKey, levelId, accountId, locale, level });
        if (success) {
          classified++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to classify page ${page.id}:`, error);
        failed++;
      }

      // Publish progress periodically
      if ((classified + failed) % PROGRESS_INTERVAL === 0) {
        await publishGlobal(channel, { classified, failed, total: totalToClassify, done: false });
      }
    }

    startIndex += results.length;
  }

  // Recheck: are there still pages not at the target level? (concurrent modifications)
  const { totalSize: remainingCount } = await findDescendantsToClassify(pageId, levelId, 0);
  const reviewUrl = remainingCount > 0
    ? `/wiki/search?cql=ancestor%3D${pageId}+AND+type%3Dpage+AND+culmat_classification_level+!%3D+%22${encodeURIComponent(levelId)}%22`
    : null;

  // Publish final status
  await publishGlobal(channel, {
    classified,
    failed,
    total: totalToClassify,
    remainingCount,
    reviewUrl,
    done: true,
  });

  console.log(`Async classification complete: classified=${classified}, failed=${failed}, remaining=${remainingCount}`);
}
