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

// Lozenge color mapping — maps our level color names to Forge Lozenge appearances
// Forge Lozenge supports: default (gray), inprogress (blue), moved (yellow),
// new (purple), removed (red), success (green)
export const COLOR_TO_LOZENGE = {
  green: 'success',
  yellow: 'moved',
  orange: 'new',
  red: 'removed',
  blue: 'inprogress',
  gray: 'default',
};

// Valid color options for classification levels (used in admin config validation)
export const VALID_COLORS = Object.keys(COLOR_TO_LOZENGE);
