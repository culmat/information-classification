import { describe, it, expect } from 'vitest';
import {
  CONTENT_PROPERTY_KEY,
  BYLINE_PROPERTY_KEY,
  GLOBAL_CONFIG_KEY,
  SPACE_CONFIG_KEY_PREFIX,
  spaceConfigKey,
  COLOR_TO_LOZENGE,
  TAG_COLORS,
  COLOR_OPTIONS,
  VALID_COLORS,
  normalizeColor,
  colorToLozenge,
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
    expect(spaceConfigKey('my-space')).toBe(
      `${SPACE_CONFIG_KEY_PREFIX}my-space`,
    );
  });

  it('should have valid lozenge appearances for all lozenge-mapped colors', () => {
    const validAppearances = [
      'default',
      'inprogress',
      'moved',
      'new',
      'removed',
      'success',
    ];
    for (const color of Object.keys(COLOR_TO_LOZENGE)) {
      expect(validAppearances).toContain(COLOR_TO_LOZENGE[color]);
    }
  });

  it('should map all 21 Tag colors in COLOR_TO_LOZENGE', () => {
    for (const color of TAG_COLORS) {
      expect(COLOR_TO_LOZENGE).toHaveProperty(color);
    }
  });

  it('COLOR_TO_LOZENGE should map key color families correctly', () => {
    expect(COLOR_TO_LOZENGE.green).toBe('success');
    expect(COLOR_TO_LOZENGE.blue).toBe('inprogress');
    expect(COLOR_TO_LOZENGE.orange).toBe('moved');
    expect(COLOR_TO_LOZENGE.red).toBe('removed');
    expect(COLOR_TO_LOZENGE.purple).toBe('new');
    expect(COLOR_TO_LOZENGE.grey).toBe('default');
  });

  it('should include all original colors in VALID_COLORS', () => {
    expect(VALID_COLORS).toContain('green');
    expect(VALID_COLORS).toContain('yellow');
    expect(VALID_COLORS).toContain('orange');
    expect(VALID_COLORS).toContain('red');
    expect(VALID_COLORS).toContain('blue');
  });

  it('should have 21 Tag colors', () => {
    expect(TAG_COLORS).toHaveLength(21);
  });

  it('should include all Tag color variants', () => {
    // Spot-check some of the expanded colors
    expect(TAG_COLORS).toContain('greenLight');
    expect(TAG_COLORS).toContain('teal');
    expect(TAG_COLORS).toContain('purple');
    expect(TAG_COLORS).toContain('magenta');
    expect(TAG_COLORS).toContain('lime');
    expect(TAG_COLORS).toContain('standard');
  });

  it('should have VALID_COLORS covering TAG_COLORS plus legacy gray', () => {
    expect(VALID_COLORS).toEqual(expect.arrayContaining(TAG_COLORS));
    expect(VALID_COLORS).toContain('gray');
    expect(VALID_COLORS).toHaveLength(TAG_COLORS.length + 1);
  });

  it('should have COLOR_OPTIONS for each Tag color', () => {
    expect(COLOR_OPTIONS).toHaveLength(TAG_COLORS.length);
    for (const option of COLOR_OPTIONS) {
      expect(option).toHaveProperty('label');
      expect(option).toHaveProperty('value');
      expect(TAG_COLORS).toContain(option.value);
    }
  });

  it('should normalize gray to grey', () => {
    expect(normalizeColor('gray')).toBe('grey');
  });

  it('should pass through valid Tag colors unchanged', () => {
    expect(normalizeColor('green')).toBe('green');
    expect(normalizeColor('teal')).toBe('teal');
    expect(normalizeColor('purpleLight')).toBe('purpleLight');
  });

  it('should fall back to standard for unknown colors', () => {
    expect(normalizeColor('pink')).toBe('standard');
    expect(normalizeColor(undefined)).toBe('standard');
  });

  it('colorToLozenge should map known colors to Lozenge appearances', () => {
    expect(colorToLozenge('green')).toBe('success');
    expect(colorToLozenge('blue')).toBe('inprogress');
    expect(colorToLozenge('orange')).toBe('moved');
    expect(colorToLozenge('red')).toBe('removed');
    expect(colorToLozenge('purple')).toBe('new');
    expect(colorToLozenge('grey')).toBe('default');
  });

  it('colorToLozenge should handle legacy gray via normalizeColor fallback', () => {
    // 'gray' is in COLOR_TO_LOZENGE directly so it resolves without normalizeColor
    expect(colorToLozenge('gray')).toBe('default');
  });

  it('colorToLozenge should fall back to default for unknown colors', () => {
    expect(colorToLozenge('hotpink')).toBe('default');
    expect(colorToLozenge(undefined)).toBe('default');
  });
});
