/**
 * Default classification levels and configuration.
 * Applied on first use when no admin configuration exists yet.
 * These defaults follow the ISO 27001 / Baloise information classification scheme.
 */

export const DEFAULT_LEVELS = [
  {
    id: 'public',
    name: { en: 'Public', de: 'Öffentlich', fr: 'Public', ja: '公開' },
    color: 'green',
    description: {
      en: 'Public information is intended for general publication. It is not subject to any restrictions.',
      de: 'Öffentliche Informationen unterliegen keinen Einschränkungen in der Weitergabe.',
      fr: 'Les informations publiques sont destinées à la publication générale. Elles ne sont soumises à aucune restriction.',
      ja: '公開情報は一般公開を目的としています。制限はありません。',
    },
    sortOrder: 0,
    allowed: true,
    requiresProtection: false,
    errorMessage: null,
  },
  {
    id: 'internal',
    name: { en: 'Internal', de: 'Intern', fr: 'Interne', ja: '社内' },
    color: 'blue',
    description: {
      en: 'Internal information is available to all employees. Release to third parties is only permitted in the course of normal business activities.',
      de: 'Interne Informationen stehen grundsätzlich allen Mitarbeitenden zur Verfügung.',
      fr: 'Les informations internes sont disponibles pour tous les employés.',
      ja: '社内情報は全従業員が利用できます。',
    },
    sortOrder: 1,
    allowed: true,
    requiresProtection: false,
    errorMessage: null,
  },
  {
    id: 'confidential',
    name: { en: 'Confidential', de: 'Vertraulich', fr: 'Confidentiel', ja: '機密' },
    color: 'orange',
    description: {
      en: 'Confidential information is only available to authorized personnel for specific business purposes.',
      de: 'Vertrauliche Informationen stehen nur bestimmten Mitarbeitenden zur Ausübung ihrer Funktion zur Verfügung.',
      fr: 'Les informations confidentielles ne sont disponibles que pour le personnel autorisé.',
      ja: '機密情報は、特定の業務目的のために承認された担当者のみが利用できます。',
    },
    sortOrder: 2,
    allowed: true,
    requiresProtection: true,
    errorMessage: null,
  },
  {
    id: 'secret',
    name: { en: 'Secret', de: 'Geheim', fr: 'Secret', ja: '極秘' },
    color: 'red',
    description: {
      en: 'Secret information is only available to a tightly limited group of employees.',
      de: 'Geheime Informationen stehen nur einem eng begrenzten Kreis von Mitarbeitern zur Verfügung.',
      fr: 'Les informations secrètes ne sont disponibles que pour un groupe très restreint.',
      ja: '極秘情報は、厳しく制限された従業員のみが利用できます。',
    },
    sortOrder: 3,
    allowed: false,
    requiresProtection: false,
    errorMessage: {
      en: 'Secret data must not be stored in Confluence, as it requires encrypted storage.',
      de: 'Geheime Informationen dürfen nicht in Confluence gespeichert werden, da sie Datenträgerverschlüsselung voraussetzen.',
      fr: 'Les données secrètes ne doivent pas être stockées dans Confluence car elles nécessitent un stockage chiffré.',
      ja: '極秘データは暗号化ストレージが必要なため、Confluenceに保存してはなりません。',
    },
  },
];

/**
 * Returns the full default configuration object.
 * Used to initialize the global config on first app use.
 */
export function getDefaultConfig() {
  return {
    levels: structuredClone(DEFAULT_LEVELS),
    defaultLevelId: 'internal',
    contacts: [],
    links: [],
  };
}
