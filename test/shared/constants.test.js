import { describe, it, expect } from 'vitest';
import {
  CONTENT_PROPERTY_KEY,
  BYLINE_PROPERTY_KEY,
  GLOBAL_CONFIG_KEY,
  SPACE_CONFIG_KEY_PREFIX,
  spaceConfigKey,
  COLOR_TO_LOZENGE,
  VALID_COLORS,
} from '../../src/shared/constants';

describe('constants', () => {
  it('should have distinct content property keys', () => {
    expect(CONTENT_PROPERTY_KEY).not.toBe(BYLINE_PROPERTY_KEY);
  });

  it('should have the culmat prefix on property keys', () => {
    expect(CONTENT_PROPERTY_KEY).toMatch(/^culmat_/);
    expect(BYLINE_PROPERTY_KEY).toMatch(/^culmat_/);
  });

  it('should build space config keys correctly', () => {
    expect(spaceConfigKey('DEV')).toBe(`${SPACE_CONFIG_KEY_PREFIX}DEV`);
    expect(spaceConfigKey('my-space')).toBe(`${SPACE_CONFIG_KEY_PREFIX}my-space`);
  });

  it('should have valid lozenge appearances for all colors', () => {
    const validAppearances = ['default', 'inprogress', 'moved', 'new', 'removed', 'success'];
    for (const color of VALID_COLORS) {
      expect(validAppearances).toContain(COLOR_TO_LOZENGE[color]);
    }
  });

  it('should include all expected colors', () => {
    expect(VALID_COLORS).toContain('green');
    expect(VALID_COLORS).toContain('yellow');
    expect(VALID_COLORS).toContain('orange');
    expect(VALID_COLORS).toContain('red');
    expect(VALID_COLORS).toContain('blue');
    expect(VALID_COLORS).toContain('gray');
  });
});
