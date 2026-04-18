/**
 * Resolvers for classification operations.
 * Handles reading and writing page classifications.
 */

import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import {
  getPageClassification,
  classifyPage,
  findDescendantsToClassify,
} from '../services/classificationService';
import { asyncJobKey } from '../shared/constants';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import {
  getClassification,
  getHistory,
} from '../services/contentPropertyService';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';
import { localize } from '../shared/i18n';

/**
 * Resolver: getDynamicProperties
 * Called by Confluence to determine the byline title/icon before the popup opens.
 * Returns the current classification level name so the byline shows e.g. "Internal"
 * instead of the static app name.
 *
 * Context provides: extension.content.id, extension.space.key, locale
 */
export async function getDynamicPropertiesResolver(req) {
  try {
    const pageId = req.context?.extension?.content?.id;
    const spaceKey = req.context?.extension?.space?.key;
    const locale = req.context?.locale || 'en';

    if (!pageId || !spaceKey) {
      return { title: 'Classification' };
    }

    // Fetch effective config and current classification
    const spConfig = await getSpaceConfig(spaceKey);
    const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
    const classification = await getClassification(String(pageId));

    // Find the current level (or fall back to default)
    const levelId = classification?.level || effectiveConfig.defaultLevelId;
    const level = effectiveConfig.levels.find((l) => l.id === levelId);

    if (!level) {
      return { title: effectiveConfig.defaultLevelId || 'Unclassified' };
    }

    const levelName = localize(level.name, locale);

    return {
      title: levelName,
      tooltip: levelName,
    };
  } catch (error) {
    console.error('Error in getDynamicProperties:', error);
    return { title: 'Classification' };
  }
}

/**
 * Resolver: getClassification
 * Returns the current classification and effective config for a page.
 *
 * Expected payload: { pageId, spaceKey }
 */
export async function getClassificationResolver(req) {
  const { pageId, spaceKey } = req.payload;

  if (!pageId || !spaceKey) {
    return validationError('pageId and spaceKey are required');
  }

  try {
    const [result, history, activeJob] = await Promise.all([
      getPageClassification(String(pageId), spaceKey),
      getHistory(String(pageId)),
      kvs.get(asyncJobKey(String(pageId))),
    ]);

    // Strip admin-only fields — minimize data sent to all users.
    // Keep levels intact (including errorMessage, which the classify dialog
    // shows in a red SectionMessage when a disallowed level is selected).
    const config = { ...result.config };
    delete config.languages;

    // Stale-job clearance: if the async consumer died (tunnel reload, retry
    // exhaustion, etc.), the KVS entry persists and the byline dialog gets
    // stuck on "Classified 0 of N". Treat any job with no progress update in
    // STALE_JOB_MS as dead, delete the KVS entry, and hide it from the UI.
    const STALE_JOB_MS = 10 * 60 * 1000;
    let liveActiveJob = activeJob;
    if (
      activeJob &&
      Date.now() - (activeJob.lastProgressAt || activeJob.startedAt || 0) >
        STALE_JOB_MS
    ) {
      await kvs.delete(asyncJobKey(String(pageId)));
      liveActiveJob = null;
    }

    return successResponse({
      ...result,
      config,
      history,
      activeJob: liveActiveJob || null,
    });
  } catch (error) {
    console.error('Error getting classification:', error);
    return errorResponse('Failed to get classification', 500);
  }
}

/**
 * Resolver: setClassification
 * Classifies a page with the given level, optionally recursive.
 *
 * Expected payload: { pageId, spaceKey, levelId, recursive, locale }
 */
export async function setClassificationResolver(req) {
  const { pageId, spaceKey, levelId, locale } = req.payload;
  const accountId = req.context.accountId;

  if (!pageId || !spaceKey || !levelId) {
    return validationError('pageId, spaceKey, and levelId are required');
  }
  if (!accountId) {
    return errorResponse('Authentication required', 401);
  }

  // Recursive classification is now driven from the browser via
  // startRecursiveClassify + processClassifyBatch (so it runs asUser and
  // respects page restrictions). This resolver only handles single-page
  // classification.
  try {
    const result = await classifyPage({
      pageId: String(pageId),
      spaceKey,
      levelId,
      accountId,
      recursive: false,
      locale: locale || 'en',
    });

    if (!result.success) {
      return errorResponse(result.message, 400);
    }
    return successResponse(result);
  } catch (error) {
    console.error('Error setting classification:', error);
    return errorResponse('Failed to set classification', 500);
  }
}

/**
 * Resolver: countDescendants
 * Returns the count of descendant pages that need reclassification.
 * Called when the recursive toggle is activated in the UI.
 *
 * Expected payload: { pageId, levelId }
 */
export async function countDescendantsResolver(req) {
  const { pageId, levelId } = req.payload;

  if (!pageId || !levelId) {
    return validationError('pageId and levelId are required');
  }

  try {
    // Two cheap CQL queries: total descendants + those needing changes
    const [filtered, all] = await Promise.all([
      findDescendantsToClassify(pageId, levelId, 0),
      findDescendantsToClassify(pageId, '__none__', 0), // __none__ matches no level, so != returns all pages
    ]);
    return successResponse({
      toClassify: filtered.totalSize,
      totalDescendants: all.totalSize,
    });
  } catch (error) {
    console.error('Error counting descendants:', error);
    return errorResponse('Failed to count descendants', 500);
  }
}

/**
 * Resolver: getClassificationProgress
 * Returns the status of an async classification job (poll fallback).
 *
 * Expected payload: { jobId }
 */
export async function getClassificationProgressResolver(req) {
  const { jobId } = req.payload;

  if (!jobId) {
    return validationError('jobId is required');
  }

  try {
    const queue = new Queue({ key: 'classification-queue' });
    const stats = await queue.getJob(jobId).getStats();
    return successResponse(stats);
  } catch (error) {
    console.error('Error getting classification progress:', error);
    return errorResponse('Failed to get progress', 500);
  }
}
