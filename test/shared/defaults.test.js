import { describe, it, expect } from 'vitest';
import { DEFAULT_LEVELS, getDefaultConfig } from '../../src/shared/defaults';
import { VALID_COLORS } from '../../src/shared/constants';

describe('DEFAULT_LEVELS', () => {
  it('should have exactly 4 default levels', () => {
    expect(DEFAULT_LEVELS).toHaveLength(4);
  });

  it('should have unique IDs', () => {
    const ids = DEFAULT_LEVELS.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('should have sequential sort orders', () => {
    const orders = DEFAULT_LEVELS.map((l) => l.sortOrder);
    expect(orders).toEqual([0, 1, 2, 3]);
  });

  it('should have valid colors for all levels', () => {
    for (const level of DEFAULT_LEVELS) {
      expect(VALID_COLORS).toContain(level.color);
    }
  });

  it('should have English names for all levels', () => {
    for (const level of DEFAULT_LEVELS) {
      expect(level.name.en).toBeTruthy();
    }
  });

  it('should have English descriptions for all levels', () => {
    for (const level of DEFAULT_LEVELS) {
      expect(level.description.en).toBeTruthy();
    }
  });

  it('should have at least one allowed level', () => {
    const allowed = DEFAULT_LEVELS.filter((l) => l.allowed);
    expect(allowed.length).toBeGreaterThan(0);
  });

  it('should mark secret as disallowed with error message', () => {
    const secret = DEFAULT_LEVELS.find((l) => l.id === 'secret');
    expect(secret.allowed).toBe(false);
    expect(secret.errorMessage).toBeTruthy();
    expect(secret.errorMessage.en).toBeTruthy();
  });

  it('should mark confidential as requiring protection', () => {
    const confidential = DEFAULT_LEVELS.find((l) => l.id === 'confidential');
    expect(confidential.requiresProtection).toBe(true);
  });

  it('should not require protection for public and internal', () => {
    const pub = DEFAULT_LEVELS.find((l) => l.id === 'public');
    const internal = DEFAULT_LEVELS.find((l) => l.id === 'internal');
    expect(pub.requiresProtection).toBe(false);
    expect(internal.requiresProtection).toBe(false);
  });
});

describe('getDefaultConfig', () => {
  it('should return a config with all default levels', () => {
    const config = getDefaultConfig();
    expect(config.levels).toHaveLength(4);
  });

  it('should default to internal', () => {
    const config = getDefaultConfig();
    expect(config.defaultLevelId).toBe('internal');
  });

  it('should have the default level reference an allowed level', () => {
    const config = getDefaultConfig();
    const defaultLevel = config.levels.find(
      (l) => l.id === config.defaultLevelId,
    );
    expect(defaultLevel).toBeTruthy();
    expect(defaultLevel.allowed).toBe(true);
  });

  it('should have empty contacts and links', () => {
    const config = getDefaultConfig();
    expect(config.contacts).toEqual([]);
    expect(config.links).toEqual([]);
  });

  it('should return a new object each time (no shared references)', () => {
    const a = getDefaultConfig();
    const b = getDefaultConfig();
    expect(a).not.toBe(b);
    expect(a.levels).not.toBe(b.levels);
  });
});
