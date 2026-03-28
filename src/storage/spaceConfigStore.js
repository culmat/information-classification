/**
 * Space-level configuration overrides using Forge KVS.
 * Space admins can restrict which globally-allowed levels are available in their space
 * and set a different default level.
 */

import { kvs } from '@forge/kvs';
import { spaceConfigKey } from '../shared/constants';

/**
 * Retrieves the space-level configuration override.
 *
 * @param {string} spaceKey - Confluence space key
 * @returns {Promise<Object|null>} space config or null if no override exists
 */
export async function getSpaceConfig(spaceKey) {
  return await kvs.get(spaceConfigKey(spaceKey));
}

/**
 * Saves a space-level configuration override.
 *
 * @param {string} spaceKey - Confluence space key
 * @param {Object} config - { allowedLevelIds: string[], defaultLevelId: string }
 * @returns {Promise<void>}
 */
export async function setSpaceConfig(spaceKey, config) {
  await kvs.set(spaceConfigKey(spaceKey), config);
}

/**
 * Removes the space-level override, reverting to global defaults.
 *
 * @param {string} spaceKey - Confluence space key
 * @returns {Promise<void>}
 */
export async function deleteSpaceConfig(spaceKey) {
  await kvs.delete(spaceConfigKey(spaceKey));
}
