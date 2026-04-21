/**
 * Configuration store using Forge Key-Value Storage (KVS).
 * Handles reading and writing the global classification config.
 *
 * The global config contains:
 * - levels: array of classification level definitions
 * - defaultLevelId: which level to show for unclassified pages
 * - contacts: array of contact persons (global or per-level)
 * - links: array of reference links (global or per-level)
 */

import { kvs } from '@forge/kvs';
import { GLOBAL_CONFIG_KEY } from '../shared/constants';

const EMPTY_CONFIG = Object.freeze({
  languages: [{ code: 'en', label: 'English' }],
  levels: [],
  defaultLevelId: null,
  contacts: [],
  links: [],
});

/**
 * Retrieves the global classification configuration.
 * Returns an explicit empty shape when no config has been saved yet so callers
 * can render an onboarding state. Does not write to KVS on read.
 *
 * @returns {Promise<Object>} the global config object
 */
export async function getGlobalConfig() {
  const config = await kvs.get(GLOBAL_CONFIG_KEY);
  if (!config) return structuredClone(EMPTY_CONFIG);

  // Ensure languages field exists (handles configs created before this feature)
  if (!config.languages) {
    config.languages = [{ code: 'en', label: 'English' }];
  }

  return config;
}

/**
 * Saves the global classification configuration.
 * Should only be called after validation (see configResolver).
 *
 * @param {Object} config - the full config object to save
 * @returns {Promise<void>}
 */
export async function setGlobalConfig(config) {
  await kvs.set(GLOBAL_CONFIG_KEY, config);
}

/**
 * Returns the effective levels for a given space.
 * Merges global config with space overrides: space can only restrict
 * the global set (disable levels), not add new ones.
 *
 * @param {string|null} spaceKey - the space key, or null for global
 * @param {Object|null} spaceConfig - pre-fetched space config, or null
 * @returns {Promise<{levels: Array, defaultLevelId: string, contacts: Array, links: Array}>}
 */
export async function getEffectiveConfig(spaceKey, spaceConfig) {
  const globalConfig = await getGlobalConfig();

  // No space override — return global config as-is
  if (!spaceKey || !spaceConfig) {
    return globalConfig;
  }

  // Filter global levels to only those allowed in this space
  const allowedInSpace = new Set(spaceConfig.allowedLevelIds || []);
  const filteredLevels = globalConfig.levels.map((level) => ({
    ...level,
    // A level is effectively allowed only if it's allowed globally AND in the space
    allowed: level.allowed && allowedInSpace.has(level.id),
  }));

  // Use space default if set and valid, otherwise fall back to global default
  const spaceDefault = spaceConfig.defaultLevelId;
  const effectiveDefault = filteredLevels.some(
    (l) => l.id === spaceDefault && l.allowed,
  )
    ? spaceDefault
    : globalConfig.defaultLevelId;

  return {
    ...globalConfig,
    levels: filteredLevels,
    defaultLevelId: effectiveDefault,
  };
}
