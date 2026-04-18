import { describe, it, expect } from 'vitest';
import {
  localize,
  interpolate,
  formatEta,
  formatSessionEta,
} from '../../src/shared/i18n';

describe('localize', () => {
  it('returns the value for the matching locale', () => {
    expect(localize({ en: 'Hello', de: 'Hallo' }, 'de')).toBe('Hallo');
  });

  it('extracts 2-char prefix from full locale string', () => {
    expect(localize({ en: 'Hello', de: 'Hallo' }, 'de-DE')).toBe('Hallo');
  });

  it('falls back to English when locale is missing', () => {
    expect(localize({ en: 'Hello' }, 'fr')).toBe('Hello');
  });

  it('falls back to first value when no English key', () => {
    expect(localize({ ja: 'こんにちは' }, 'fr')).toBe('こんにちは');
  });

  it('returns string as-is if input is a plain string', () => {
    expect(localize('plain', 'en')).toBe('plain');
  });

  it('returns empty string for null input', () => {
    expect(localize(null, 'en')).toBe('');
  });

  it('returns empty string for undefined input', () => {
    expect(localize(undefined, 'en')).toBe('');
  });

  it('returns empty string for empty string input', () => {
    expect(localize('', 'en')).toBe('');
  });

  it('defaults to English when locale is null', () => {
    expect(localize({ en: 'Hello', de: 'Hallo' }, null)).toBe('Hello');
  });
});

describe('interpolate', () => {
  it('replaces placeholders with values', () => {
    expect(interpolate('Hello {name}!', { name: 'World' })).toBe(
      'Hello World!',
    );
  });

  it('replaces multiple placeholders', () => {
    expect(interpolate('{a} and {b}', { a: '1', b: '2' })).toBe('1 and 2');
  });

  it('keeps placeholder when value is missing', () => {
    expect(interpolate('Hello {name}!', {})).toBe('Hello {name}!');
  });

  it('returns empty string for null template', () => {
    expect(interpolate(null, { a: '1' })).toBe('');
  });

  it('returns empty string for undefined template', () => {
    expect(interpolate(undefined, {})).toBe('');
  });

  it('handles zero and false as valid values', () => {
    expect(interpolate('{n} items', { n: 0 })).toBe('0 items');
  });
});

describe('formatEta', () => {
  const t = (key) => {
    const map = {
      'classify.async_eta_min': '~{minutes} min',
      'classify.async_eta_sec': '~{seconds} sec',
    };
    return map[key] || key;
  };

  it('returns empty string when classified is 0', () => {
    expect(formatEta(Date.now() - 5000, 0, 100, t)).toBe('');
  });

  it('returns empty string when startedAt is null', () => {
    expect(formatEta(null, 50, 100, t)).toBe('');
  });

  it('formats as seconds when under 60', () => {
    // 10s elapsed, 50 of 100 done → ~10s remaining
    const startedAt = Date.now() - 10000;
    const result = formatEta(startedAt, 50, 100, t);
    expect(result).toMatch(/~\d+ sec/);
  });

  it('formats as minutes when 60 or more seconds', () => {
    // 60s elapsed, 10 of 100 done → ~540s remaining → ~9 min
    const startedAt = Date.now() - 60000;
    const result = formatEta(startedAt, 10, 100, t);
    expect(result).toMatch(/~\d+ min/);
  });
});

describe('formatSessionEta', () => {
  const t = (key) => {
    const map = {
      'classify.async_eta_min': '~{minutes} min',
      'classify.async_eta_sec': '~{seconds} sec',
    };
    return map[key] || key;
  };

  // Bug #3 guard: fresh job, <3 pages classified and ~0s elapsed → no
  // "~0 sec remaining" flash.
  it('returns empty string in the warm-up window (too few pages)', () => {
    const sessionStartedAt = Date.now() - 5000; // 5s elapsed
    expect(formatSessionEta(sessionStartedAt, 1, 100, t)).toBe('');
    expect(formatSessionEta(sessionStartedAt, 2, 100, t)).toBe('');
  });

  it('returns empty string in the warm-up window (too little elapsed time)', () => {
    const sessionStartedAt = Date.now() - 500; // 0.5s elapsed
    expect(formatSessionEta(sessionStartedAt, 10, 100, t)).toBe('');
  });

  // Bug #2 guard: computes rate from SESSION, not from original job start.
  // Resume scenario: sessionStartedAt is recent, sessionProgressed is recent.
  it('extrapolates from the current session only (ignoring pause gaps)', () => {
    // Simulated resume: session started 10s ago, 5 pages done this session,
    // 95 remaining → rate = 0.5 pages/s → ~190s remaining → "~4 min" after
    // ceil-to-minute conversion.
    const sessionStartedAt = Date.now() - 10000;
    const result = formatSessionEta(sessionStartedAt, 5, 95, t);
    expect(result).toMatch(/~\d+ min/);
  });

  it('returns empty string when there is nothing remaining', () => {
    const sessionStartedAt = Date.now() - 10000;
    expect(formatSessionEta(sessionStartedAt, 10, 0, t)).toBe('');
  });

  it('returns empty string when sessionStartedAt is falsy', () => {
    expect(formatSessionEta(null, 10, 50, t)).toBe('');
    expect(formatSessionEta(0, 10, 50, t)).toBe('');
  });
});
