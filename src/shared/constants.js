/**
 * Centralized constants for property keys, KVS keys, and app identifiers.
 * All storage keys and property names are defined here to prevent typos
 * and make it easy to find where data lives.
 */

// Content property keys — stored on each Confluence page
export const CONTENT_PROPERTY_KEY = 'culmat_page_classification';
export const BYLINE_PROPERTY_KEY = 'culmat_page_classification_byline';

// KVS keys — stored in Forge app-level storage
export const GLOBAL_CONFIG_KEY = 'config:global';
export const SPACE_CONFIG_KEY_PREFIX = 'config:space:';

// Build the space-specific KVS key
export const spaceConfigKey = (spaceKey) =>
  `${SPACE_CONFIG_KEY_PREFIX}${spaceKey}`;

// Async classification threshold — above this count, use background processing
export const ASYNC_THRESHOLD = 50;

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
