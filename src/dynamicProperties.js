/**
 * Dynamic properties handler for the contentBylineItem module.
 * Called by Confluence to determine the byline title/icon before the popup opens.
 * Returns the current classification level name (e.g. "Internal") so the byline
 * shows the actual classification instead of the static app name.
 *
 * This is a standalone function (not a resolver) because dynamicProperties
 * uses a different invocation pattern than @forge/resolver.
 */

import { getEffectiveConfig } from './storage/configStore';
import { getSpaceConfig } from './storage/spaceConfigStore';
import { getClassification } from './services/contentPropertyService';

/**
 * Resolve a localized string from a { lang: text } object.
 */
function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

export async function handler(req) {
  try {
    const pageId = req?.context?.extension?.content?.id;
    const spaceKey = req?.context?.extension?.space?.key;
    const locale = req?.context?.locale || 'en';

    if (!pageId || !spaceKey) {
      return { title: 'Classification' };
    }

    const spConfig = await getSpaceConfig(spaceKey);
    const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);
    const classification = await getClassification(String(pageId));

    const levelId = classification?.level || effectiveConfig.defaultLevelId;
    const level = effectiveConfig.levels.find((l) => l.id === levelId);

    if (!level) {
      return { title: effectiveConfig.defaultLevelId || 'Unclassified' };
    }

    return {
      title: localize(level.name, locale),
      tooltip: localize(level.name, locale),
    };
  } catch (error) {
    console.error('Error in dynamicProperties:', error);
    return { title: 'Classification' };
  }
}
