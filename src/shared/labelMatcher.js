/**
 * Label-to-level matching for the import wizard.
 * Matches Confluence page labels to configured classification levels
 * using exact case-insensitive matching on level IDs.
 */

/**
 * Matches all labels against configured levels by exact ID match (case-insensitive).
 *
 * @param {Array<{name: string, count: number}>} labels - labels with page counts
 * @param {Array} levels - configured classification levels
 * @returns {Array<{label: string, count: number, levelId: string|null, matchType: string|null}>}
 *   Sorted: matched first (by count desc), then unmatched (by count desc).
 */
export function matchLabelsToLevels(labels, levels) {
  const levelIdMap = new Map(levels.map((l) => [l.id.toLowerCase(), l.id]));

  const results = labels.map(({ name, count }) => {
    const matched = levelIdMap.get(name.toLowerCase());
    return {
      label: name,
      count,
      levelId: matched || null,
      matchType: matched ? 'exact' : null,
    };
  });

  // Matched first (by count desc), then unmatched (by count desc)
  results.sort((a, b) => {
    if (a.matchType && !b.matchType) return -1;
    if (!a.matchType && b.matchType) return 1;
    return b.count - a.count;
  });

  return results;
}
