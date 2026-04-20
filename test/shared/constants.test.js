import { describe, it, expect } from 'vitest';
import {
  CONTENT_PROPERTY_KEY,
  BYLINE_PROPERTY_KEY,
  GLOBAL_CONFIG_KEY,
  SPACE_CONFIG_KEY_PREFIX,
  spaceConfigKey,
  COLOR_TO_LOZENGE,
  COLOR_TO_HEX,
  LEVEL_COLORS,
  COLOR_OPTIONS,
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

  it('should have 7 canonical level colors', () => {
    expect(LEVEL_COLORS).toEqual([
      'green',
      'blue',
      'red',
      'yellow',
      'purple',
      'orange',
      'grey',
    ]);
  });

  it('should map every LEVEL_COLOR in COLOR_TO_LOZENGE and COLOR_TO_HEX', () => {
    for (const color of LEVEL_COLORS) {
      expect(COLOR_TO_LOZENGE).toHaveProperty(color);
      expect(COLOR_TO_HEX).toHaveProperty(color);
    }
  });

  it('should have valid lozenge appearances for all mapped colors', () => {
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

  it('COLOR_TO_LOZENGE should map key color families correctly', () => {
    expect(COLOR_TO_LOZENGE.green).toBe('success');
    expect(COLOR_TO_LOZENGE.blue).toBe('inprogress');
    expect(COLOR_TO_LOZENGE.orange).toBe('moved');
    expect(COLOR_TO_LOZENGE.red).toBe('removed');
    expect(COLOR_TO_LOZENGE.purple).toBe('new');
    expect(COLOR_TO_LOZENGE.grey).toBe('default');
  });

  it('COLOR_OPTIONS values should equal LEVEL_COLORS in order', () => {
    expect(COLOR_OPTIONS.map((o) => o.value)).toEqual(LEVEL_COLORS);
    for (const option of COLOR_OPTIONS) {
      expect(option).toHaveProperty('label');
      expect(option).toHaveProperty('value');
    }
  });

  it('colorToLozenge should map known colors to Lozenge appearances', () => {
    expect(colorToLozenge('green')).toBe('success');
    expect(colorToLozenge('blue')).toBe('inprogress');
    expect(colorToLozenge('orange')).toBe('moved');
    expect(colorToLozenge('red')).toBe('removed');
    expect(colorToLozenge('purple')).toBe('new');
    expect(colorToLozenge('grey')).toBe('default');
  });

  it('colorToLozenge should fall back to default for unknown colors', () => {
    expect(colorToLozenge('hotpink')).toBe('default');
    expect(colorToLozenge(undefined)).toBe('default');
  });
});
