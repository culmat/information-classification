/**
 * Resolvers for classification operations.
 * Handles reading and writing page classifications.
 */

import { getPageClassification, classifyPage } from '../services/classificationService';
import { getEffectiveConfig } from '../storage/configStore';
import { getSpaceConfig } from '../storage/spaceConfigStore';
import { getClassification } from '../services/contentPropertyService';
import { getAuditLogForPage } from '../storage/auditStore';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';

/**
 * Helper to resolve a localized string from a { lang: text } object.
 */
function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

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
    const [result, recentHistory] = await Promise.all([
      getPageClassification(String(pageId), spaceKey),
      getAuditLogForPage(pageId, 3).catch(() => []),
    ]);
    return successResponse({ ...result, recentHistory });
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
