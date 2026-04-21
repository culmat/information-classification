/**
 * Resolvers for classification operations.
 * Handles reading and writing page classifications.
 */

import { Queue } from '@forge/events';
import {
  getPageClassification,
  classifyPage,
  findDescendantsToClassify,
} from '../services/classificationService';
import { getHistory } from '../services/contentPropertyService';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../utils/responseHelper';

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
    const result = await getPageClassification(String(pageId), spaceKey);

    // Strip admin-only fields — minimize data sent to all users.
    // Keep levels intact (including errorMessage, which the classify dialog
    // shows in a red SectionMessage when a disallowed level is selected).
    const config = { ...result.config };
    delete config.languages;

    // Skip the history read when no levels are configured — the popup is
    // rendered as an empty no-op in that case and the history is unused.
    if (!config.levels?.length) {
      return successResponse({
        ...result,
        config,
        history: { truncated: false, entries: [] },
      });
    }

    const history = await getHistory(String(pageId));

    // Client-driven classify-job state lives in its own KVS namespace and is
    // retrieved via getUserPendingJobs when the modal opens. This resolver
    // no longer reports an `activeJob` field.
    return successResponse({
      ...result,
      config,
      history,
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
