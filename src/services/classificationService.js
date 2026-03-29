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

import api, { route } from '@forge/api';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import { logClassificationChange } from '../storage/auditStore';
import {
  getClassification,
  setClassification,
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
    } else if (!level.requiresProtection && isProtected && levelId !== 'confidential') {
      // Non-confidential page (e.g. Internal, Public) WITH restrictions — mismatch
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
    return { success: false, error: 'invalid_level', message: 'Unknown classification level.' };
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

  // Skip if already at this level and not recursive
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

  // Write classification to the page
  const writeSuccess = await setClassification(pageId, classificationData, bylineData);
  if (!writeSuccess) {
    return { success: false, error: 'write_failed', message: 'Failed to save classification.' };
  }

  // Log to audit trail
  await logClassificationChange({
    pageId: Number(pageId),
    spaceKey,
    previousLevel,
    newLevel: levelId,
    classifiedBy: accountId,
    recursive,
  });

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
    recursiveResult = await classifyChildPages({
      pageId,
      spaceKey,
      levelId,
      accountId,
      locale,
      level,
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
 * Recursively classifies all child pages of the given page.
 * Uses pagination to handle large page trees and tracks progress.
 * Stops if approaching the Forge function timeout (25s).
 *
 * @param {Object} params
 * @returns {Promise<Object>} { classified, failed, total }
 */
async function classifyChildPages({ pageId, spaceKey, levelId, accountId, locale, level }) {
  const startTime = Date.now();
  const MAX_DURATION_MS = 20000; // Stop 5 seconds before the 25s Forge timeout

  let classified = 0;
  let failed = 0;
  let cursor = null;

  const lang = locale.substring(0, 2);
  const levelName = level.name?.[lang] || level.name?.en || levelId;
  const now = new Date().toISOString();

  // Paginate through all child pages
  do {
    // Check if we're running out of time
    if (Date.now() - startTime > MAX_DURATION_MS) {
      console.warn(`Recursive classification timed out after ${classified} pages`);
      return { classified, failed, timedOut: true };
    }

    // Fetch a batch of child pages
    const url = cursor
      ? route`/wiki/api/v2/pages/${pageId}/children?limit=25&cursor=${cursor}`
      : route`/wiki/api/v2/pages/${pageId}/children?limit=25`;

    const response = await api.asApp().requestConfluence(url, {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      console.error('Failed to fetch child pages:', response.status);
      break;
    }

    const data = await response.json();
    const children = data.results || [];

    // Classify each child page
    for (const child of children) {
      // Time check per page
      if (Date.now() - startTime > MAX_DURATION_MS) {
        return { classified, failed, timedOut: true };
      }

      try {
        const childClassification = await getClassification(String(child.id));
        const childPreviousLevel = childClassification?.level || null;

        const classificationData = {
          level: levelId,
          classifiedBy: accountId,
          classifiedAt: now,
        };
        const bylineData = { title: levelName, tooltip: levelName };

        const success = await setClassification(
          String(child.id),
          classificationData,
          bylineData
        );

        if (success) {
          await logClassificationChange({
            pageId: Number(child.id),
            spaceKey,
            previousLevel: childPreviousLevel,
            newLevel: levelId,
            classifiedBy: accountId,
            recursive: true,
          });
          classified++;
        } else {
          failed++;
        }
      } catch (error) {
        console.error(`Failed to classify child page ${child.id}:`, error);
        failed++;
      }
    }

    // Get cursor for next page of results
    cursor = data._links?.next ? new URL(data._links.next, 'https://placeholder').searchParams.get('cursor') : null;
  } while (cursor);

  return { classified, failed, timedOut: false };
}
