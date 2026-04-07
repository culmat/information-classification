/**
 * Centralized constants for property keys, KVS keys, and app identifiers.
 * All storage keys and property names are defined here to prevent typos
 * and make it easy to find where data lives.
 */

// Content property keys — stored on each Confluence page
export const CONTENT_PROPERTY_KEY = 'culmat_page_classification';
export const BYLINE_PROPERTY_KEY = 'culmat_page_classification_byline';
export const HISTORY_PROPERTY_KEY = 'culmat_page_classification_history';

// Maximum history entries per page before FIFO kicks in (~32KB limit / ~100 bytes per entry)
export const MAX_HISTORY_ENTRIES = 300;

// KVS keys — stored in Forge app-level storage
export const GLOBAL_CONFIG_KEY = 'config:global';
export const SPACE_CONFIG_KEY_PREFIX = 'config:space:';

// Build the space-specific KVS key
export const spaceConfigKey = (spaceKey) =>
  `${SPACE_CONFIG_KEY_PREFIX}${spaceKey}`;

// Async classification threshold — above this count, use background processing
export const ASYNC_THRESHOLD = 50;

/**
 * Builds a CQL space filter from a comma-separated space key string.
 * Returns '' for null/empty, ' AND space="X"' for single, ' AND space in ("X","Y")' for multiple.
 */
export function buildSpaceFilter(spaceKey) {
  if (!spaceKey) return '';
  const keys = spaceKey.split(',').map((k) => k.trim()).filter(Boolean);
  if (keys.length === 0) return '';
  if (keys.length === 1) return ` AND space="${keys[0]}"`;
  return ` AND space in (${keys.map((k) => `"${k}"`).join(',')})`;
}

// KVS key prefix for tracking active async classification jobs
export const ASYNC_JOB_KEY_PREFIX = 'async-job:';
export const asyncJobKey = (pageId) => `${ASYNC_JOB_KEY_PREFIX}${pageId}`;

// Lozenge color mapping — maps our level color names to Forge Lozenge appearances.
// Forge Lozenge renders with solid colored fill (green/blue/orange/red/grey backgrounds),
// compared to Tag which renders with colored outlines only.
// Lozenge supports 6 appearances: default (grey), inprogress (blue), moved (amber),
// new (purple), removed (red), success (green).
// All 21 Tag colors plus legacy aliases are mapped here so any stored color
// is always rendered with a meaningful Lozenge appearance.
export const COLOR_TO_LOZENGE = {
  // Green family → success (green background)
  green: 'success',
  greenLight: 'success',
  lime: 'success',
  limeLight: 'success',
  // Blue / teal family → inprogress (blue background)
  blue: 'inprogress',
  blueLight: 'inprogress',
  teal: 'inprogress',
  tealLight: 'inprogress',
  // Purple family → new (purple/blue background)
  purple: 'new',
  purpleLight: 'new',
  // Amber / orange / yellow family → moved (amber background)
  yellow: 'moved',
  yellowLight: 'moved',
  orange: 'moved',
  orangeLight: 'moved',
  // Red / magenta family → removed (red background)
  red: 'removed',
  redLight: 'removed',
  magenta: 'removed',
  magentaLight: 'removed',
  // Neutral → default (grey background)
  grey: 'default',
  greyLight: 'default',
  gray: 'default',      // legacy American spelling alias
  standard: 'default',
};

// Maps level color names to hex values for chart rendering (DonutChart colorPalette).
// Uses Atlassian design system accent colors.
export const COLOR_TO_HEX = {
  green: '#22A06B', greenLight: '#4BCE97',
  blue: '#1D7AFC', blueLight: '#579DFF',
  red: '#E2483D', redLight: '#F87168',
  yellow: '#CF9F02', yellowLight: '#F5CD47',
  purple: '#8270DB', purpleLight: '#9F8FEF',
  teal: '#1D9AAA', tealLight: '#60C6D2',
  orange: '#D97008', orangeLight: '#FAA53D',
  magenta: '#CD519D', magentaLight: '#E774BB',
  grey: '#758195', greyLight: '#8993A5',
  gray: '#758195',
  lime: '#5B7F24', limeLight: '#94C748',
  standard: '#758195',
};

export function colorToHex(color) {
  return COLOR_TO_HEX[color] || COLOR_TO_HEX[normalizeColor(color)] || '#758195';
}

// Converts a level color name to the matching Lozenge appearance string.
// Falls back to 'default' for any unrecognised color so the UI never breaks.
export function colorToLozenge(color) {
  return COLOR_TO_LOZENGE[color] || COLOR_TO_LOZENGE[normalizeColor(color)] || 'default';
}

// All named colors accepted by the Forge UI Kit <Tag> component.
// Tag offers 21 colors (vs Lozenge's 6), enabling better corporate design matching.
// Colors without a Lozenge mapping will fall back to 'default' appearance when
// rendered as a Lozenge (e.g. in older components).
export const TAG_COLORS = [
  'green', 'greenLight',
  'blue', 'blueLight',
  'red', 'redLight',
  'yellow', 'yellowLight',
  'purple', 'purpleLight',
  'teal', 'tealLight',
  'orange', 'orangeLight',
  'magenta', 'magentaLight',
  'grey', 'greyLight',
  'lime', 'limeLight',
  'standard',
];

// Selectable color options for the admin UI — value is the Tag color name,
// label is a human-readable display name shown in the Select dropdown.
export const COLOR_OPTIONS = TAG_COLORS.map((color) => ({
  label: color.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()),
  value: color,
}));

// Valid color options for classification levels (used in admin config validation).
// Includes all Tag colors plus 'gray' as a legacy alias for 'grey' (backward compat).
export const VALID_COLORS = [...TAG_COLORS, 'gray'];

// Normalizes legacy color names to their Tag-compatible equivalents.
// 'gray' (American) → 'grey' (Tag uses British spelling).
// Unknown colors fall back to 'standard'.
export function normalizeColor(color) {
  if (color === 'gray') return 'grey';
  if (TAG_COLORS.includes(color)) return color;
  return 'standard';
}
