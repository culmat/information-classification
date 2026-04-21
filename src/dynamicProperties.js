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
import { localize } from './shared/i18n';

// Localized fallback for the byline title when no concrete level can be
// resolved. Confluence renders the static manifest title ("Information
// Classification") if we return an empty string, so always emit a
// classification-shaped label instead. Kept inline because this handler runs
// outside @forge/react's translation system.
const UNCLASSIFIED_LABEL = {
  en: 'Unclassified',
  de: 'Nicht klassifiziert',
  fr: 'Non classifié',
  ja: '未分類',
};

function unclassified(locale) {
  return { title: localize(UNCLASSIFIED_LABEL, locale) };
}

export async function handler(req) {
  const locale = req?.context?.locale || 'en';
  try {
    const pageId = req?.context?.extension?.content?.id;
    const spaceKey = req?.context?.extension?.space?.key;

    if (!pageId || !spaceKey) {
      return unclassified(locale);
    }

    const spConfig = await getSpaceConfig(spaceKey);
    const effectiveConfig = await getEffectiveConfig(spaceKey, spConfig);

    // No levels configured — stay silent. Skip the classification and
    // restriction reads so page views cost zero extra round-trips until
    // an admin actually sets up the app.
    if (!effectiveConfig.levels?.length) {
      return unclassified(locale);
    }

    const classification = await getClassification(String(pageId));

    const levelId = classification?.level || effectiveConfig.defaultLevelId;
    const level = effectiveConfig.levels.find((l) => l.id === levelId);

    if (!level) {
      return unclassified(locale);
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
    return unclassified(locale);
  }
}
