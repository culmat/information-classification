/**
 * Resolvers for classification operations.
 * Handles reading and writing page classifications.
 */

import { getPageClassification, classifyPage } from '../services/classificationService';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';

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
    return successResponse(result);
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
  const { pageId, spaceKey, levelId, recursive, locale } = req.payload;
  const accountId = req.context.accountId;

  if (!pageId || !spaceKey || !levelId) {
    return validationError('pageId, spaceKey, and levelId are required');
  }

  if (!accountId) {
    return errorResponse('Authentication required', 401);
  }

  try {
    const result = await classifyPage({
      pageId: String(pageId),
      spaceKey,
      levelId,
      accountId,
      recursive: recursive === true,
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
