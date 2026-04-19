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
 * Validates a single Confluence space key.
 * Space keys are uppercase alphanumeric with optional underscores/hyphens/tildes.
 * Rejects anything that could contain CQL operators or special characters.
 *
 * @param {string} key - a single space key
 * @returns {boolean} true if the key looks safe
 */
export function isValidSpaceKey(key) {
  return typeof key === 'string' && /^[A-Za-z0-9_~-]+$/.test(key);
}

/**
 * Validates a Confluence page label.
 * Confluence labels accept Unicode letters/digits plus `_ . : -` (colon is used
 * for prefixes like "global:foo"). Quotes, backslashes, and whitespace are
 * rejected to prevent CQL string-delimiter injection when the label is
 * interpolated into a CQL query like `label = "${labelName}"`.
 *
 * @param {string} label - a single label name
 * @returns {boolean} true if the label looks safe
 */
export function isValidLabel(label) {
  return (
    typeof label === 'string' &&
    label.length > 0 &&
    label.length <= 255 &&
    /^[\p{L}\p{N}_.:-]+$/u.test(label)
  );
}

/**
 * Builds a CQL space filter from a comma-separated space key string.
 * Returns '' for null/empty, ' AND space="X"' for single, ' AND space in ("X","Y")' for multiple.
 * Validates each key to prevent CQL injection.
 */
export function buildSpaceFilter(spaceKey) {
  if (!spaceKey) return '';
  const keys = spaceKey
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
  if (keys.length === 0) return '';

  // Reject any key that doesn't match the expected format
  for (const k of keys) {
    if (!isValidSpaceKey(k)) {
      console.warn(`Invalid space key rejected: ${k}`);
      return '';
    }
  }

  if (keys.length === 1) return ` AND space="${keys[0]}"`;
  return ` AND space in (${keys.map((k) => `"${k}"`).join(',')})`;
}

// KVS key prefix for tracking active async classification jobs
export const ASYNC_JOB_KEY_PREFIX = 'async-job:';
export const asyncJobKey = (pageId) => `${ASYNC_JOB_KEY_PREFIX}${pageId}`;

// Client-driven recursive classification tuning.
//
// Chunk size is DYNAMIC: computed per job from the total page estimate so
// small trees get tiny chunks (smooth progress, fast first update) and big
// trees get larger chunks (fewer invokes, less overhead dominating wall
// time). Targets ~15 batches per job inside [3, 20] bounds.
//
// Concurrency controls how many pages are classified in parallel inside a
// single invoke. 3 is empirically safe against Confluence rate limits and
// gives ~3× speedup per invoke; `requestWithRetry` absorbs any one-off 429s.
export const CLASSIFY_CONCURRENCY = 3;
const CLASSIFY_MIN_CHUNK = 3;
const CLASSIFY_MAX_CHUNK = 20;
const CLASSIFY_TARGET_BATCHES = 15;

export function computeClassifyChunkSize(totalPages) {
  const n = Number(totalPages) || 0;
  if (n <= 0) return CLASSIFY_MIN_CHUNK;
  const size = Math.ceil(n / CLASSIFY_TARGET_BATCHES);
  return Math.min(CLASSIFY_MAX_CHUNK, Math.max(CLASSIFY_MIN_CHUNK, size));
}

// KVS keys for the client-driven job state.
export const userJobsKey = (accountId) => `user-jobs:${accountId}`;
export const jobHeaderKey = (accountId, rootPageId) =>
  `job:${accountId}:${rootPageId}`;
export const jobChunkKey = (accountId, rootPageId, idx) =>
  `job:${accountId}:${rootPageId}:chunk:${idx}`;

// Stale-job clearance window — shared by the old async-queue jobs and the
// new client-driven jobs. If `lastProgressAt` is older than this, consider
// the job dead and garbage-collect it.
export const STALE_JOB_MS = 10 * 60 * 1000; // 10 minutes

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
  gray: 'default', // legacy American spelling alias
  standard: 'default',
};

// Maps level color names to hex values for chart rendering (DonutChart colorPalette).
// Uses Atlassian palette 400-level values (background.accent.{hue}.subtle) to match
// the Tag component's visual weight.
export const COLOR_TO_HEX = {
  green: '#4BCE97',
  greenLight: '#BAF3DB',
  blue: '#669DF1',
  blueLight: '#CFE1FD',
  red: '#F15B50',
  redLight: '#FFD5D2',
  yellow: '#EED12B',
  yellowLight: '#F5E989',
  purple: '#C97CF4',
  purpleLight: '#EED7FC',
  teal: '#6CC3E0',
  tealLight: '#C6EDFB',
  orange: '#FCA700',
  orangeLight: '#FCE4A6',
  magenta: '#E774BB',
  magentaLight: '#FDD0EC',
  grey: '#8C8F97',
  greyLight: '#DDDEE1',
  gray: '#8C8F97',
  lime: '#94C748',
  limeLight: '#D3F1A7',
  standard: '#8C8F97',
};

export function colorToHex(color) {
  return (
    COLOR_TO_HEX[color] || COLOR_TO_HEX[normalizeColor(color)] || '#758195'
  );
}

// Converts a level color name to the matching Lozenge appearance string.
// Falls back to 'default' for any unrecognised color so the UI never breaks.
export function colorToLozenge(color) {
  return (
    COLOR_TO_LOZENGE[color] ||
    COLOR_TO_LOZENGE[normalizeColor(color)] ||
    'default'
  );
}

// All named colors accepted by the Forge UI Kit <Tag> component.
// Tag offers 21 colors (vs Lozenge's 6), enabling better corporate design matching.
// Colors without a Lozenge mapping will fall back to 'default' appearance when
// rendered as a Lozenge (e.g. in older components).
export const TAG_COLORS = [
  'green',
  'greenLight',
  'blue',
  'blueLight',
  'red',
  'redLight',
  'yellow',
  'yellowLight',
  'purple',
  'purpleLight',
  'teal',
  'tealLight',
  'orange',
  'orangeLight',
  'magenta',
  'magentaLight',
  'grey',
  'greyLight',
  'lime',
  'limeLight',
  'standard',
];

// Selectable color options for the admin UI — simplified to base colors only.
// Light variants and duplicates are omitted to reduce clutter; they remain in
// TAG_COLORS / COLOR_TO_HEX / VALID_COLORS for backward compatibility with
// existing saved configs.
const SELECTABLE_COLORS = [
  'green',
  'blue',
  'red',
  'yellow',
  'purple',
  'orange',
  'grey',
];

// Unicode colored circles for visual hints in the Select dropdown.
// Not exact matches to the Atlassian palette, but close enough to help pick.
const COLOR_INDICATOR = {
  green: '\u{1F7E2}',
  blue: '\u{1F535}',
  red: '\u{1F534}',
  yellow: '\u{1F7E1}',
  purple: '\u{1F7E3}',
  orange: '\u{1F7E0}',
  grey: '\u26AA',
};

export const COLOR_OPTIONS = SELECTABLE_COLORS.map((color) => ({
  label: `${COLOR_INDICATOR[color] || ''} ${color.replace(/^./, (c) => c.toUpperCase())}`,
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
