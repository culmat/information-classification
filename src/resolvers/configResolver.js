/**
 * Resolvers for global admin configuration.
 * Access control: the confluence:globalSettings module restricts access
 * to Confluence admins at the module level — no additional auth check needed here.
 */

import { getGlobalConfig, setGlobalConfig } from '../storage/configStore';
import {
  getAuditStatistics,
  getRecentAuditEntries,
  getClassificationDistribution,
  getMonthlyTrend,
  getFilteredAuditEntries,
} from '../storage/auditStore';
import { successResponse, errorResponse, validationError } from '../utils/responseHelper';
import { VALID_COLORS } from '../shared/constants';

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
 * Resolver: getAuditData
 * Returns audit statistics and recent entries for the admin dashboard.
 */
export async function getAuditDataResolver(req) {
  try {
    const { startDate, endDate, limit } = req.payload || {};
    const [statistics, recentEntries, distribution, monthlyTrend] = await Promise.all([
      getAuditStatistics(),
      startDate || endDate
        ? getFilteredAuditEntries({ startDate, endDate, limit: limit || 100 })
        : getRecentAuditEntries(limit || 100),
      getClassificationDistribution(),
      getMonthlyTrend(12),
    ]);
    return successResponse({ statistics, recentEntries, distribution, monthlyTrend });
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
