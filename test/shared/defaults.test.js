import { describe, it, expect } from 'vitest';
import { TEMPLATES, buildConfigFromTemplate } from '../../src/shared/defaults';
import { LEVEL_COLORS } from '../../src/shared/constants';

const TEMPLATE_IDS = Object.keys(TEMPLATES);

describe('TEMPLATES registry', () => {
  it('exposes iso27001, nist, and government', () => {
    expect(TEMPLATE_IDS).toEqual(
      expect.arrayContaining(['iso27001', 'nist', 'government']),
    );
  });

  it.each(TEMPLATE_IDS)('%s template has a labelKey', (id) => {
    expect(TEMPLATES[id].labelKey).toMatch(/^admin\.bootstrap\.template\./);
  });

  it.each(TEMPLATE_IDS)('%s template has unique level IDs', (id) => {
    const ids = TEMPLATES[id].levels.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(TEMPLATE_IDS)('%s template has sequential sort orders', (id) => {
    const orders = TEMPLATES[id].levels.map((l) => l.sortOrder);
    expect(orders).toEqual(orders.map((_, i) => i));
  });

  it.each(TEMPLATE_IDS)('%s template uses valid colors', (id) => {
    for (const level of TEMPLATES[id].levels) {
      expect(LEVEL_COLORS).toContain(level.color);
    }
  });

  it.each(TEMPLATE_IDS)(
    '%s template has English names and descriptions',
    (id) => {
      for (const level of TEMPLATES[id].levels) {
        expect(level.name.en).toBeTruthy();
        expect(level.description.en).toBeTruthy();
      }
    },
  );

  it.each(TEMPLATE_IDS)(
    '%s defaultLevelId references an allowed level',
    (id) => {
      const { levels, defaultLevelId } = TEMPLATES[id];
      const def = levels.find((l) => l.id === defaultLevelId);
      expect(def).toBeTruthy();
      expect(def.allowed).toBe(true);
    },
  );

  it('iso27001 marks secret as disallowed with error message', () => {
    const secret = TEMPLATES.iso27001.levels.find((l) => l.id === 'secret');
    expect(secret.allowed).toBe(false);
    expect(secret.errorMessage?.en).toBeTruthy();
  });
});

describe('buildConfigFromTemplate', () => {
  it.each(TEMPLATE_IDS)(
    '%s returns a full config passing schema basics',
    (id) => {
      const config = buildConfigFromTemplate(id);
      expect(config.levels.length).toBeGreaterThan(0);
      expect(config.languages[0].code).toBe('en');
      expect(config.contacts).toEqual([]);
      expect(config.links).toEqual([]);
      expect(
        config.levels.find((l) => l.id === config.defaultLevelId),
      ).toBeTruthy();
    },
  );

  it('returns a new object each call (no shared references)', () => {
    const a = buildConfigFromTemplate('iso27001');
    const b = buildConfigFromTemplate('iso27001');
    expect(a).not.toBe(b);
    expect(a.levels).not.toBe(b.levels);
  });

  it('throws on unknown template id', () => {
    expect(() => buildConfigFromTemplate('bogus')).toThrow(/Unknown template/);
  });
});
