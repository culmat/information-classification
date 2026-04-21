/**
 * Bootstrap templates for the classification config.
 * Applied only when an admin explicitly picks one during first-run setup.
 * The app ships empty — these are opt-in starting points, not silent defaults.
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

const ISO27001_LEVELS = [
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

const NIST_LEVELS = [
  {
    id: 'public',
    name: { en: 'Public' },
    color: 'green',
    description: {
      en: 'Public information can be freely disclosed without risk to the organization.',
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
      en: 'Internal information is intended for use within the organization. Unauthorized disclosure would have limited adverse effect.',
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
      en: 'Confidential information (including Controlled Unclassified Information) requires safeguards. Unauthorized disclosure would have serious adverse effect.',
    },
    sortOrder: 2,
    allowed: true,
    requiresProtection: true,
    errorMessage: null,
  },
  {
    id: 'restricted',
    name: { en: 'Restricted' },
    color: 'red',
    description: {
      en: 'Restricted information has severe or catastrophic impact if disclosed. Access is granted only on a strict need-to-know basis.',
    },
    sortOrder: 3,
    allowed: true,
    requiresProtection: true,
    errorMessage: null,
  },
];

const GOVERNMENT_LEVELS = [
  {
    id: 'unclassified',
    name: { en: 'Unclassified' },
    color: 'green',
    description: {
      en: 'Unclassified information is not subject to national-security classification controls.',
    },
    sortOrder: 0,
    allowed: true,
    requiresProtection: false,
    errorMessage: null,
  },
  {
    id: 'confidential',
    name: { en: 'Confidential' },
    color: 'blue',
    description: {
      en: 'Confidential information could reasonably be expected to cause damage to national security if disclosed.',
    },
    sortOrder: 1,
    allowed: true,
    requiresProtection: true,
    errorMessage: null,
  },
  {
    id: 'secret',
    name: { en: 'Secret' },
    color: 'orange',
    description: {
      en: 'Secret information could reasonably be expected to cause serious damage to national security if disclosed.',
    },
    sortOrder: 2,
    allowed: false,
    requiresProtection: false,
    errorMessage: {
      en: 'Secret data must not be stored in Confluence without accredited, encrypted storage.',
    },
  },
  {
    id: 'top-secret',
    name: { en: 'Top Secret' },
    color: 'red',
    description: {
      en: 'Top Secret information could reasonably be expected to cause exceptionally grave damage to national security if disclosed.',
    },
    sortOrder: 3,
    allowed: false,
    requiresProtection: false,
    errorMessage: {
      en: 'Top Secret data must not be stored in Confluence — it requires dedicated accredited systems.',
    },
  },
];

/**
 * Registry of bootstrap templates. Keys are template ids used over the wire
 * between the admin UI and the apply-template resolver.
 *
 * Each entry provides:
 * - labelKey: i18n key for the display name in the wizard
 * - levels: the starting levels array (deep-cloned on use)
 * - defaultLevelId: which level to pre-select as the default
 */
export const TEMPLATES = {
  iso27001: {
    labelKey: 'admin.bootstrap.template.iso27001',
    levels: ISO27001_LEVELS,
    defaultLevelId: 'internal',
  },
  nist: {
    labelKey: 'admin.bootstrap.template.nist',
    levels: NIST_LEVELS,
    defaultLevelId: 'internal',
  },
  government: {
    labelKey: 'admin.bootstrap.template.government',
    levels: GOVERNMENT_LEVELS,
    defaultLevelId: 'unclassified',
  },
};

/**
 * Returns a fresh config object populated from the named template.
 * Throws if `templateId` is unknown so the caller surfaces a validation error
 * rather than silently saving a malformed config.
 */
export function buildConfigFromTemplate(templateId) {
  const template = TEMPLATES[templateId];
  if (!template) {
    throw new Error(`Unknown template: ${templateId}`);
  }
  return {
    languages: [{ code: 'en', label: 'English' }],
    levels: structuredClone(template.levels),
    defaultLevelId: template.defaultLevelId,
    contacts: [],
    links: [],
  };
}
