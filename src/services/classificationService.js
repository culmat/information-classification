/**
 * Core classification service — orchestrates classification changes.
 * This is the main business logic module, called by resolvers.
 *
 * Responsibilities:
 * - Validate that the requested level is allowed in the target space
 * - Write classification data and byline display properties
 * - Log changes to the audit trail
 * - Handle recursive classification of sub-pages
 * - Check and warn about restriction mismatches
 */

import { route } from '@forge/api';
import { publishGlobal } from '@forge/realtime';
import { buildSpaceFilter } from '../shared/constants';
import { getRequester } from '../utils/requester';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import {
  getClassification,
  setClassification,
  appendHistory,
} from './contentPropertyService';
import { hasViewRestrictions } from './restrictionService';

/**
 * Gets the current classification for a page, along with the effective config
 * for the page's space (needed by the UI to render level options).
 *
 * @param {string} pageId - Confluence page ID
 * @param {string} spaceKey - Confluence space key
 * @returns {Promise<Object>} { classification, config }
 */
export async function getPageClassification(pageId, spaceKey) {
  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
  const classification = await getClassification(pageId);

  // Check restriction mismatch on every load
  const levelId = classification?.level || effectiveConfig.defaultLevelId;
  const level = effectiveConfig.levels.find((l) => l.id === levelId);
  let restrictionWarning = null;

  if (level) {
    const isProtected = await hasViewRestrictions(pageId);
    if (level.requiresProtection && !isProtected) {
      // Confidential page without restrictions
      restrictionWarning = 'requires_protection';
    } else if (!level.requiresProtection && isProtected) {
      // Level doesn't require protection but page has restrictions — mismatch
      restrictionWarning = 'has_unnecessary_protection';
    }
  }

  return {
    classification,
    config: effectiveConfig,
    restrictionWarning,
  };
}

/**
 * Classifies a page with the given level.
 * Optionally applies recursively to all child pages.
 *
 * @param {Object} params
 * @param {string} params.pageId - Confluence page ID
 * @param {string} params.spaceKey - Confluence space key
 * @param {string} params.levelId - classification level ID to apply
 * @param {string} params.accountId - Atlassian account ID of the user making the change
 * @param {boolean} params.recursive - whether to apply to child pages
 * @param {string} params.locale - user's locale for resolving level names (e.g. 'en')
 * @returns {Promise<Object>} result with success status, warnings, and recursive stats
 */
export async function classifyPage({
  pageId,
  spaceKey,
  levelId,
  accountId,
  recursive = false,
  locale = 'en',
}) {
  // Load effective config for this space
  const spConfig = await getSpaceConfig(spaceKey);
  const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);

  // Find the requested level in the effective config
  const level = effectiveConfig.levels.find((l) => l.id === levelId);
  if (!level) {
    return {
      success: false,
      error: 'invalid_level',
      message: 'Unknown classification level.',
    };
  }

  // Check if the level is allowed
  if (!level.allowed) {
    const lang = locale.substring(0, 2);
    const errorMsg =
      level.errorMessage?.[lang] ||
      level.errorMessage?.en ||
      'This classification level is not allowed.';
    return { success: false, error: 'level_disallowed', message: errorMsg };
  }

  // Read current classification for audit trail
  const currentClassification = await getClassification(pageId);
  const previousLevel = currentClassification?.level || null;

  // Skip entirely if already at this level and not recursive
  if (previousLevel === levelId && !recursive) {
    return { success: true, unchanged: true };
  }

  // Build classification and byline data
  const now = new Date().toISOString();
  const lang = locale.substring(0, 2);
  const levelName = level.name?.[lang] || level.name?.en || levelId;

  const classificationData = {
    level: levelId,
    classifiedBy: accountId,
    classifiedAt: now,
  };

  const bylineData = {
    title: levelName,
    tooltip: levelName,
  };

  // Only write + log the parent page if the level actually changed
  if (previousLevel !== levelId) {
    const writeSuccess = await setClassification(
      pageId,
      classificationData,
      bylineData,
    );
    if (!writeSuccess) {
      return {
        success: false,
        error: 'write_failed',
        message: 'Failed to save classification.',
      };
    }

    await appendHistory(pageId, {
      from: previousLevel,
      to: levelId,
      by: accountId,
      at: now,
    });
  }

  // Check restriction mismatch warning
  let restrictionWarning = null;
  if (level.requiresProtection) {
    const isProtected = await hasViewRestrictions(pageId);
    if (!isProtected) {
      restrictionWarning = 'requires_protection';
    }
  }

  // Handle recursive classification for child pages
  let recursiveResult = null;
  if (recursive) {
    recursiveResult = await classifyDescendants({
      pageId,
      spaceKey,
      levelId,
      accountId,
      locale,
      level,
      startTime: Date.now(),
    });
    // Include the parent page in the count only if it actually changed
    if (previousLevel !== levelId) {
      recursiveResult.classified += 1;
    }
  }

  // Ping any open stats panels to refresh — cheap no-op when nobody's listening.
  if (previousLevel !== levelId || recursive) {
    await publishGlobal('classification-changed', {
      source: recursive ? 'recursive-sync' : 'classify',
      spaceKey,
    });
  }

  return {
    success: true,
    classification: classificationData,
    restrictionWarning,
    recursiveResult,
  };
}

/**
 * Finds descendant pages that need reclassification using CQL.
 * Uses the indexed culmat_classification_level search alias to filter server-side.
 *
 * @param {string} pageId - ancestor page ID
 * @param {string} levelId - target level (pages already at this level are excluded)
 * @param {number} limit - 0 for count only, >0 for paginated results
 * @param {number} startIndex - pagination offset
 * @returns {Promise<{results: Array, totalSize: number}>}
 */
export async function findDescendantsToClassify(
  pageId,
  levelId,
  limit = 0,
  startIndex = 0,
  { asApp: useApp = false } = {},
) {
  const cql = `ancestor=${pageId} AND type=page AND culmat_classification_level != "${levelId}"`;
  return await cqlPageSearch(cql, limit, startIndex, useApp);
}

/**
 * Finds all descendants of a page using plain CQL (no content-property alias).
 * Caller paginates via `fetchAllPages` in the consumer.
 */
export async function findDescendants(
  pageId,
  limit = 0,
  startIndex = 0,
  { asApp: useApp = false } = {},
) {
  const cql = `ancestor=${pageId} AND type=page`;
  return await cqlPageSearch(cql, limit, startIndex, useApp);
}

/**
 * Finds all pages classified with a specific level (for reclassification / deletion warning).
 */
export async function findPagesByLevel(
  levelId,
  limit = 0,
  startIndex = 0,
  { asApp: useApp = false, spaceKey = null } = {},
) {
  const cql = `type=page AND culmat_classification_level = "${levelId}"${buildSpaceFilter(spaceKey)}`;
  return await cqlPageSearch(cql, limit, startIndex, useApp);
}

/**
 * Shared CQL page search helper.
 *
 * Extensive debug logging is intentional: Confluence's CQL search has
 * reproducibly dropped specific pages (e.g. Leaf-C-30 from a 71-page
 * subtree). Logging the exact CQL, pagination parameters, the returned
 * totalSize, and the full ID list lets us see exactly where the drop
 * happens (first batch? second batch? totalSize mismatch?).
 */
async function cqlPageSearch(cql, limit, startIndex, useApp) {
  const requester = getRequester(useApp);
  const response = await requester.requestConfluence(
    route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&start=${startIndex}`,
    { headers: { Accept: 'application/json' } },
  );
  if (!response.ok) {
    console.error(
      `[cqlPageSearch] HTTP ${response.status} for cql="${cql}" limit=${limit} start=${startIndex}`,
    );
    return { results: [], totalSize: 0 };
  }
  const data = await response.json();
  const results = (data.results || []).map((r) => ({
    id: String(r.content.id),
    title: r.content.title,
  }));
  const totalSize = data.totalSize || 0;
  console.log(
    `[cqlPageSearch] cql="${cql}" limit=${limit} start=${startIndex} -> totalSize=${totalSize} results=${results.length} ids=[${results.map((r) => r.id).join(',')}]`,
  );
  return { results, totalSize };
}

/**
 * Classifies a single page — writes content property + byline + audit log.
 * Used by both sync classifyDescendants and the async consumer.
 *
 * @param {Object} params
 * @returns {Promise<boolean>} true if successful
 */
export async function classifySinglePage({
  childPageId,
  spaceKey: _spaceKey,
  levelId,
  accountId,
  locale,
  level,
  asApp: useApp = false,
}) {
  const lang = (locale || 'en').substring(0, 2);
  const levelName = level.name?.[lang] || level.name?.en || levelId;
  const now = new Date().toISOString();
  const opts = { asApp: useApp };

  // Read current level for skip-detection + history.
  const currentClassification = await getClassification(childPageId, opts);
  const previousLevel = currentClassification?.level || null;

  // Skip if already at target — caller pre-fetches without filtering, so this
  // takes the place of the server-side `!=` CQL filter (which is unreliable).
  if (previousLevel === levelId) {
    return null;
  }

  const classificationData = {
    level: levelId,
    classifiedBy: accountId,
    classifiedAt: now,
  };
  const bylineData = { title: levelName, tooltip: levelName };

  const success = await setClassification(
    childPageId,
    classificationData,
    bylineData,
    opts,
  );
  if (!success) return false;

  await appendHistory(
    childPageId,
    {
      from: previousLevel,
      to: levelId,
      by: accountId,
      at: now,
    },
    opts,
  );

  return true;
}

/**
 * Classifies descendants of a page using CQL to find only pages that need changes.
 * Stops if approaching the Forge function timeout (25s).
 *
 * @param {Object} params
 * @returns {Promise<Object>} { classified, failed, timedOut }
 */
async function classifyDescendants({
  pageId,
  spaceKey,
  levelId,
  accountId,
  locale,
  level,
  startTime,
}) {
  const MAX_DURATION_MS = 20000; // Stop 5 seconds before the 25s Forge timeout

  let classified = 0;
  let failed = 0;
  // Track processed pages — CQL index updates are async, so a page we just
  // classified may still appear in the next CQL batch. Skip it to avoid
  // double-counting and redundant writes.
  const processed = new Set();

  // Always fetch from startIndex=0 because classified pages eventually drop
  // out of the CQL result set once the index catches up.
  while (true) {
    if (Date.now() - startTime > MAX_DURATION_MS) {
      console.warn(
        `Recursive classification timed out after ${classified} descendants`,
      );
      return { classified, failed, timedOut: true };
    }

    const { results } = await findDescendantsToClassify(pageId, levelId, 25, 0);
    // Filter out pages we already processed in a previous batch
    const unprocessed = results.filter((p) => !processed.has(p.id));
    if (unprocessed.length === 0) break;

    for (const page of unprocessed) {
      if (Date.now() - startTime > MAX_DURATION_MS) {
        return { classified, failed, timedOut: true };
      }

      processed.add(page.id);
      try {
        const success = await classifySinglePage({
          childPageId: page.id,
          spaceKey,
          levelId,
          accountId,
          locale,
          level,
        });
        if (success === true) {
          classified++;
        } else if (success === false) {
          failed++;
        }
        // success === null means the page was already at target (index lag
        // can resurface a page we just classified) — silently skip.
      } catch (error) {
        console.error(`Failed to classify descendant page ${page.id}:`, error);
        failed++;
      }
    }
  }

  return { classified, failed, timedOut: false };
}
