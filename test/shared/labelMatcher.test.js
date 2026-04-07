import { describe, it, expect } from 'vitest';
import { matchLabelsToLevels } from '../../src/shared/labelMatcher';

const levels = [
  { id: 'public', name: { en: 'Public' } },
  { id: 'internal', name: { en: 'Internal' } },
  { id: 'confidential', name: { en: 'Confidential' } },
];

describe('matchLabelsToLevels', () => {
  it('matches labels to levels by exact ID (case-insensitive)', () => {
    const labels = [{ name: 'Internal', count: 10 }];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].levelId).toBe('internal');
    expect(results[0].matchType).toBe('exact');
  });

  it('returns null levelId for unmatched labels', () => {
    const labels = [{ name: 'unknown-label', count: 5 }];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].levelId).toBeNull();
    expect(results[0].matchType).toBeNull();
  });

  it('sorts matched labels before unmatched', () => {
    const labels = [
      { name: 'unknown', count: 100 },
      { name: 'public', count: 1 },
    ];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].label).toBe('public');
    expect(results[1].label).toBe('unknown');
  });

  it('sorts by count descending within matched group', () => {
    const labels = [
      { name: 'public', count: 5 },
      { name: 'internal', count: 20 },
    ];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].label).toBe('internal');
    expect(results[1].label).toBe('public');
  });

  it('sorts by count descending within unmatched group', () => {
    const labels = [
      { name: 'foo', count: 3 },
      { name: 'bar', count: 10 },
    ];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].label).toBe('bar');
    expect(results[1].label).toBe('foo');
  });

  it('handles empty labels array', () => {
    expect(matchLabelsToLevels([], levels)).toEqual([]);
  });

  it('handles empty levels array', () => {
    const labels = [{ name: 'public', count: 5 }];
    const results = matchLabelsToLevels(labels, []);

    expect(results[0].levelId).toBeNull();
  });

  it('matches case-insensitively (uppercase label)', () => {
    const labels = [{ name: 'PUBLIC', count: 5 }];
    const results = matchLabelsToLevels(labels, levels);

    expect(results[0].levelId).toBe('public');
  });
});
