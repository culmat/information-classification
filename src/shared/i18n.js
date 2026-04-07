/**
 * Shared internationalization helpers used by all frontend modules.
 */

/**
 * Resolves a localized string from a { lang: text } object.
 * Falls back to English if the user's language isn't available.
 */
export function localize(obj, locale) {
  if (!obj || typeof obj === 'string') return obj || '';
  const lang = (locale || 'en').substring(0, 2);
  return obj[lang] || obj.en || Object.values(obj)[0] || '';
}

/**
 * Interpolates {placeholder} values in a template string.
 * Example: interpolate('Hello {name}!', { name: 'World' }) => 'Hello World!'
 */
export function interpolate(template, values) {
  if (!template) return '';
  return template.replace(/\{(\w+)\}/g, (_, key) => values[key] ?? `{${key}}`);
}
