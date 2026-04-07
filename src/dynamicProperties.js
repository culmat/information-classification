/**
 * Dynamic properties handler for the contentBylineItem module.
 * Called by Confluence to determine the byline title/icon before the popup opens.
 * Returns the current classification level name (e.g. "Internal") so the byline
 * shows the actual classification instead of the static app name.
 *
 * Also checks for restriction mismatches and adds a warning indicator.
 */

import { getEffectiveConfig } from './storage/configStore';
import { getSpaceConfig } from './storage/spaceConfigStore';
import { getClassification } from './services/contentPropertyService';
import { hasViewRestrictions } from './services/restrictionService';

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

    const levelName = localize(level.name, locale);

    // Check restriction mismatch
    const isProtected = await hasViewRestrictions(String(pageId));
    let warning = false;
    if (level.requiresProtection && !isProtected) {
      warning = true; // needs protection but has none
    } else if (!level.requiresProtection && isProtected) {
      warning = true; // has protection but level doesn't require it
    }

    // Add warning indicator to byline title if mismatch detected
    const title = warning ? `\u26A0\uFE0F ${levelName}` : levelName;

    return {
      title,
      tooltip: warning ? `${levelName} — restriction mismatch` : levelName,
    };
  } catch (error) {
    console.error('Error in dynamicProperties:', error);
    return { title: 'Classification' };
  }
}
