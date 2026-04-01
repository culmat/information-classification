/**
 * Default classification levels and configuration.
 * Applied on first use when no admin configuration exists yet.
 * These defaults follow the ISO 27001 information classification scheme.
 */

/**
 * Reference list of commonly used languages for the admin dropdown.
 * Admins pick from this list when configuring content languages.
 */
export const SUPPORTED_LANGUAGES = {
  en: 'English',
  de: 'Deutsch',
  fr: 'Français',
  it: 'Italiano',
  es: 'Español',
  pt: 'Português',
  nl: 'Nederlands',
  pl: 'Polski',
  cs: 'Čeština',
  da: 'Dansk',
  fi: 'Suomi',
  hu: 'Magyar',
  no: 'Norsk',
  ro: 'Română',
  sv: 'Svenska',
  ja: '日本語',
  ko: '한국어',
  zh: '中文',
  ru: 'Русский',
  uk: 'Українська',
};

export const DEFAULT_LEVELS = [
  {
    id: 'public',
    name: { en: 'Public' },
    color: 'green',
    description: {
      en: 'Public information is intended for general publication. It is not subject to any restrictions.',
    },
    sortOrder: 0,
    allowed: true,
    requiresProtection: false,
    errorMessage: null,
  },
  {
    id: 'internal',
    name: { en: 'Internal' },
    color: 'blue',
    description: {
      en: 'Internal information is available to all employees. Release to third parties is only permitted in the course of normal business activities.',
    },
    sortOrder: 1,
    allowed: true,
    requiresProtection: false,
    errorMessage: null,
  },
  {
    id: 'confidential',
    name: { en: 'Confidential' },
    color: 'orange',
    description: {
      en: 'Confidential information is only available to authorized personnel for specific business purposes.',
    },
    sortOrder: 2,
    allowed: true,
    requiresProtection: true,
    errorMessage: null,
  },
  {
    id: 'secret',
    name: { en: 'Secret' },
    color: 'red',
    description: {
      en: 'Secret information is only available to a tightly limited group of employees.',
    },
    sortOrder: 3,
    allowed: false,
    requiresProtection: false,
    errorMessage: {
      en: 'Secret data must not be stored in Confluence, as it requires encrypted storage.',
    },
  },
];

/**
 * Returns the full default configuration object.
 * Used to initialize the global config on first app use.
 */
export function getDefaultConfig() {
  return {
    languages: [{ code: 'en', label: 'English' }],
    levels: structuredClone(DEFAULT_LEVELS),
    defaultLevelId: 'internal',
    contacts: [],
    links: [],
  };
}
