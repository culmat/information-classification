/**
 * Async event consumer for large recursive classifications.
 * Processes pages in background (up to 10 minutes) using CQL to find
 * only pages that need changes. Publishes progress via Forge Realtime.
 */

import { publishGlobal } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import { findDescendantsToClassify, classifySinglePage } from './services/classificationService';
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
  const { pageId, spaceKey, levelId, accountId, locale, totalToClassify } = event.body;
  const channel = `classification-progress:${pageId}`;

  console.log(`Async classification started: pageId=${pageId}, levelId=${levelId}, total=${totalToClassify}`);

  // Read startedAt from the KVS entry written by the resolver
  const jobState = await kvs.get(asyncJobKey(pageId));
  const startedAt = jobState?.startedAt || Date.now();

  // Load the level definition for classifySinglePage
  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const level = effectiveConfig.levels.find((l) => l.id === levelId);

  if (!level) {
    console.error(`Level ${levelId} not found in config`);
    await Promise.all([
      publishGlobal(channel, { classified: 0, failed: 0, total: totalToClassify, done: true, error: 'Level not found' }),
      kvs.delete(asyncJobKey(pageId)),
    ]);
    return;
  }

  let classified = 0;
  let failed = 0;
  const processed = new Set();

  while (true) {
    // Always fetch from startIndex=0 — classified pages drop out of the CQL result set
    const { results } = await findDescendantsToClassify(pageId, levelId, BATCH_SIZE, 0, { asApp: true });
    if (results.length === 0) break;

    // If every result was already processed, CQL index is lagging — stop to avoid infinite loop
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

      // Publish progress periodically and update KVS for resume-on-reload
      if ((classified + failed) % PROGRESS_INTERVAL === 0) {
        await Promise.all([
          publishGlobal(channel, { classified, failed, total: totalToClassify, done: false }),
          kvs.set(asyncJobKey(pageId), { levelId, total: totalToClassify, startedAt, classified, failed }),
        ]);
      }
    }

  }

  // Publish final status and clear the active job marker
  await Promise.all([
    publishGlobal(channel, { classified, failed, total: totalToClassify, done: true }),
    kvs.delete(asyncJobKey(pageId)),
  ]);

  console.log(`Async classification complete: classified=${classified}, failed=${failed}`);
}
