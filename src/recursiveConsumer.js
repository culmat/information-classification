/**
 * Async event consumer for admin-initiated batch jobs.
 *
 * Only reclassify runs through this consumer now. Label import/export and
 * recursive classification are both client-driven (asUser) so they bypass
 * the async queue entirely. Any stray events from a pre-migration deploy
 * are logged and ignored.
 */

import { publishGlobal } from '@forge/realtime';
import { kvs } from '@forge/kvs';
import {
  findPagesByLevel,
  classifySinglePage,
} from './services/classificationService';
import { asyncJobKey } from './shared/constants';
import { getEffectiveConfig } from './storage/configStore';

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
    if (pages.length >= totalSize) break;
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
      lastProgressAt: Date.now(),
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
  { classified, failed, total, levelId },
  source,
) {
  const payload = { classified, failed, total, done: true };
  if (levelId !== undefined) payload.levelId = levelId;
  await Promise.all([publishGlobal(channel, payload), kvs.delete(jobKey)]);
  if (source && classified > 0) {
    await publishGlobal('classification-changed', { source });
  }
}

/**
 * Consumer handler — only reclassify runs via the async queue now. Label
 * import/export and recursive classify are both client-driven.
 *
 * @param {Object} event - { body, jobId, retryContext }
 */
export function handler(event) {
  const { fromLevelId } = event.body;

  if (fromLevelId) return handleReclassify(event);

  console.warn(
    'recursiveConsumer: unrecognised event body — ignoring',
    JSON.stringify(event.body || {}),
  );
  return undefined;
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
 * Shared processing loop for the reclassify flow.
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
  initialClassified = 0,
}) {
  // classifySinglePage returns:
  //   true  -> page was at a different level and is now at `levelId` → count it
  //   null  -> page was already at `levelId`; no write happened → skip silently
  //   false -> write failed → count it as failed
  // `classified` is seeded with `initialClassified` so a caller that already
  // classified some pages (e.g. the parent, done synchronously by the resolver
  // before enqueue) is reflected in the final total.
  let classified = initialClassified;
  let failed = 0;
  let skipped = 0;

  for (const page of pages) {
    try {
      const result = await classifySinglePage({
        childPageId: page.id,
        spaceKey,
        levelId,
        accountId,
        locale,
        level,
        asApp: true,
      });
      if (result === true) {
        classified++;
      } else if (result === null) {
        skipped++;
      } else {
        console.error(
          `classifySinglePage returned false for page=${page.id} title="${page.title}"`,
        );
        failed++;
      }
    } catch (error) {
      console.error(`Failed to classify page ${page.id}:`, error);
      failed++;
    }

    // Report frequently early for fast user feedback, then settle into batches
    if (shouldReportProgress(classified + failed + skipped)) {
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
    { classified, failed, total: totalToClassify, levelId },
    source,
  );

  console.log(
    `Classification complete: classified=${classified}, failed=${failed}, skipped=${skipped}`,
  );
}
