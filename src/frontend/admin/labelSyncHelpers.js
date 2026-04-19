/**
 * Shared helpers for label-sync (import/export) UI components.
 */

export function formatMappingLabels(mappings, jobKind) {
  const seen = new Set();
  for (const m of mappings || []) {
    if (jobKind === 'label-import') {
      for (const l of m.labels || []) if (l) seen.add(l);
    } else if (m?.labelName) {
      seen.add(m.labelName);
    }
  }
  return Array.from(seen).join(', ');
}
