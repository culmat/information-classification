/**
 * Resolvers for global admin configuration.
 * Access control: the confluence:globalSettings module restricts access
 * to Confluence admins at the module level — no additional auth check needed here.
 */

import api, { route } from '@forge/api';
import { Queue } from '@forge/events';
import { kvs } from '@forge/kvs';
import { getGlobalConfig, setGlobalConfig, getEffectiveConfig } from '../storage/configStore';
import { findPagesByLevel, classifySinglePage } from '../services/classificationService';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';
import { VALID_COLORS, asyncJobKey } from '../shared/constants';

/**
 * Resolver: getConfig
 * Returns the global classification configuration.
 */
export async function getConfigResolver(_req) {
  try {
    const config = await getGlobalConfig();
    return successResponse({ config });
  } catch (error) {
    console.error('Error getting config:', error);
    return errorResponse('Failed to get configuration', 500);
  }
}

/**
 * Resolver: setConfig
 * Updates the global classification configuration.
 * Validates the config before saving.
 */
export async function setConfigResolver(req) {
  const { config } = req.payload;
  if (!config) {
    return validationError('config is required');
  }

  // Validate the configuration
  const validationResult = validateConfig(config);
  if (!validationResult.valid) {
    return validationError(validationResult.error);
  }

  try {
    await setGlobalConfig(config);
    return successResponse({ config });
  } catch (error) {
    console.error('Error saving config:', error);
    return errorResponse('Failed to save configuration', 500);
  }
}

/**
 * Runs a CQL search and returns { totalSize, results }.
 */
async function cqlSearch(cql, limit = 0) {
  const response = await api.asUser().requestConfluence(
    route`/wiki/rest/api/search?cql=${cql}&limit=${limit}&expand=content.space`,
    { headers: { Accept: 'application/json' } }
  );
  if (!response.ok) return { totalSize: 0, results: [] };
  const data = await response.json();
  return {
    totalSize: data.totalSize || 0,
    results: (data.results || []).map((r) => ({
      id: String(r.content?.id),
      title: r.content?.title,
      spaceKey: r.content?.space?.key || r.resultGlobalContainer?.title,
      url: r.url || r.content?._links?.webui,
    })),
  };
}

/**
 * Resolver: getAuditData
 * Returns CQL-based classification statistics for the admin dashboard.
 * Distribution per level, total pages, coverage, and recently classified pages.
 */
export async function getAuditDataResolver(req) {
  try {
    const { spaceKey } = req.payload || {};
    const config = await getGlobalConfig();
    const levels = config.levels || [];
    const spaceFilter = spaceKey ? ` AND space="${spaceKey}"` : '';

    // Count pages per level + total pages in parallel
    const countPromises = levels.map((l) =>
      cqlSearch(`type=page${spaceFilter} AND culmat_classification_level="${l.id}"`)
        .then(({ totalSize }) => ({ level: l.id, count: totalSize }))
    );
    const totalPagesPromise = cqlSearch(`type=page${spaceFilter}`);
    // Build an OR query for all configured levels instead of "is not null",
    // which is not reliably supported by content property search aliases.
    const levelFilter = levels.map((l) => `culmat_classification_level="${l.id}"`).join(' OR ');
    const recentCql = levelFilter
      ? `type=page${spaceFilter} AND (${levelFilter}) ORDER BY lastModified DESC`
      : `type=page${spaceFilter}`;
    const recentPromise = cqlSearch(recentCql, 20);

    const [distribution, totalPagesResult, recentResult] = await Promise.all([
      Promise.all(countPromises),
      totalPagesPromise,
      recentPromise,
    ]);

    const classifiedPages = distribution.reduce((sum, d) => sum + d.count, 0);

    return successResponse({
      distribution,
      totalPages: totalPagesResult.totalSize,
      classifiedPages,
      recentPages: recentResult.results,
    });
  } catch (error) {
    console.error('Error getting audit data:', error);
    return errorResponse('Failed to get audit data', 500);
  }
}

/**
 * Validates the global configuration object.
 * Ensures data integrity before saving.
 *
 * @param {Object} config - the config to validate
 * @returns {{ valid: boolean, error?: string }}
 */
function validateConfig(config) {
  // Validate languages — English is always hardcoded at position 0
  if (!Array.isArray(config.languages) || config.languages.length === 0) {
    return { valid: false, error: 'At least one content language is required.' };
  }
  const langCodes = config.languages.map((l) => l.code);
  if (new Set(langCodes).size !== langCodes.length) {
    return { valid: false, error: 'Duplicate language codes are not allowed.' };
  }
  for (const lang of config.languages) {
    if (!lang.code || typeof lang.code !== 'string' || !lang.label || typeof lang.label !== 'string') {
      return { valid: false, error: 'Each language must have a code and label.' };
    }
  }

  // Must have levels array
  if (!Array.isArray(config.levels) || config.levels.length === 0) {
    return { valid: false, error: 'At least one classification level is required.' };
  }

  // At least one level must be allowed
  const allowedLevels = config.levels.filter((l) => l.allowed);
  if (allowedLevels.length === 0) {
    return { valid: false, error: 'At least one classification level must be allowed.' };
  }

  // Default level must exist and be allowed
  const defaultLevel = config.levels.find((l) => l.id === config.defaultLevelId);
  if (!defaultLevel) {
    return { valid: false, error: 'Default level must reference an existing level.' };
  }
  if (!defaultLevel.allowed) {
    return { valid: false, error: 'Default level must be an allowed level.' };
  }

  // Level IDs must be unique
  const ids = config.levels.map((l) => l.id);
  if (new Set(ids).size !== ids.length) {
    return { valid: false, error: 'Classification level IDs must be unique.' };
  }

  // Validate each level
  for (const level of config.levels) {
    if (!level.id || typeof level.id !== 'string') {
      return { valid: false, error: 'Each level must have a string ID.' };
    }
    if (!level.name || typeof level.name !== 'object') {
      return { valid: false, error: `Level "${level.id}" must have a name object with language keys.` };
    }
    if (!level.name.en) {
      return { valid: false, error: `Level "${level.id}" must have an English name.` };
    }
    if (!VALID_COLORS.includes(level.color)) {
      return { valid: false, error: `Level "${level.id}" has invalid color "${level.color}". Valid: ${VALID_COLORS.join(', ')}` };
    }
  }

  // Validate contacts (optional)
  if (config.contacts && !Array.isArray(config.contacts)) {
    return { valid: false, error: 'Contacts must be an array.' };
  }

  // Validate links (optional)
  if (config.links && !Array.isArray(config.links)) {
    return { valid: false, error: 'Links must be an array.' };
  }

  return { valid: true };
}

/**
 * Resolver: countLevelUsage
 * Returns the number of pages classified with a given level.
 */
export async function countLevelUsageResolver(req) {
  const { levelId } = req.payload || {};
  if (!levelId) return validationError('levelId is required');

  try {
    const { totalSize } = await findPagesByLevel(levelId, 0);
    return successResponse({ count: totalSize });
  } catch (error) {
    console.error('Error counting level usage:', error);
    return errorResponse('Failed to count pages', 500);
  }
}

/**
 * Resolver: reclassifyLevel
 * Reclassifies all pages from one level to another via the async queue.
 */
export async function reclassifyLevelResolver(req) {
  const { fromLevelId, toLevelId } = req.payload || {};
  const accountId = req.context.accountId;
  const locale = req.context.locale || 'en';

  if (!fromLevelId || !toLevelId) return validationError('fromLevelId and toLevelId are required');
  if (fromLevelId === toLevelId) return validationError('fromLevelId and toLevelId must differ');

  try {
    const { totalSize } = await findPagesByLevel(fromLevelId, 0);
    if (totalSize === 0) return successResponse({ count: 0 });

    const queue = new Queue({ key: 'classification-queue' });
    const { jobId } = await queue.push({
      body: { fromLevelId, toLevelId, accountId, locale, totalToClassify: totalSize },
      concurrency: { key: `reclassify-${fromLevelId}`, limit: 1 },
    });

    await kvs.set(asyncJobKey(`reclassify-${fromLevelId}`), {
      jobId,
      levelId: toLevelId,
      total: totalSize,
      startedAt: Date.now(),
      classified: 0,
      failed: 0,
    });

    return successResponse({ count: totalSize, asyncJobId: jobId });
  } catch (error) {
    console.error('Error reclassifying level:', error);
    return errorResponse('Failed to start reclassification', 500);
  }
}
