import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @forge/kvs before importing the module under test
const mockStorage = {
  get: vi.fn(),
  set: vi.fn(),
};
vi.mock('@forge/kvs', () => ({
  kvs: mockStorage,
}));

// Import after mocking
const { getGlobalConfig, setGlobalConfig, getEffectiveConfig } =
  await import('../../src/storage/configStore');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getGlobalConfig', () => {
  it('returns existing config from storage as-is', async () => {
    const existing = {
      languages: [{ code: 'en', label: 'English' }],
      levels: [{ id: 'custom' }],
      defaultLevelId: 'custom',
    };
    mockStorage.get.mockResolvedValue(existing);

    const result = await getGlobalConfig();
    expect(result).toEqual(existing);
    expect(mockStorage.set).not.toHaveBeenCalled();
  });

  it('returns an empty-shape config when storage is empty, without writing', async () => {
    mockStorage.get.mockResolvedValue(null);

    const result = await getGlobalConfig();
    expect(result.levels).toEqual([]);
    expect(result.defaultLevelId).toBeNull();
    expect(result.contacts).toEqual([]);
    expect(result.links).toEqual([]);
    expect(result.languages).toEqual([{ code: 'en', label: 'English' }]);
    expect(mockStorage.set).not.toHaveBeenCalled();
  });

  it('backfills missing languages field on legacy stored configs', async () => {
    mockStorage.get.mockResolvedValue({
      levels: [{ id: 'public' }],
      defaultLevelId: 'public',
    });

    const result = await getGlobalConfig();
    expect(result.languages).toEqual([{ code: 'en', label: 'English' }]);
  });
});

describe('setGlobalConfig', () => {
  it('should save config to storage', async () => {
    const config = { levels: [], defaultLevelId: null };
    await setGlobalConfig(config);
    expect(mockStorage.set).toHaveBeenCalledWith('config:global', config);
  });
});

describe('getEffectiveConfig', () => {
  const globalConfig = {
    languages: [{ code: 'en', label: 'English' }],
    levels: [
      { id: 'public', allowed: true, sortOrder: 0 },
      { id: 'internal', allowed: true, sortOrder: 1 },
      { id: 'confidential', allowed: true, sortOrder: 2 },
      { id: 'secret', allowed: false, sortOrder: 3 },
    ],
    defaultLevelId: 'internal',
    contacts: [],
    links: [],
  };

  it('should return global config when no space key is provided', async () => {
    mockStorage.get.mockResolvedValue(globalConfig);

    const result = await getEffectiveConfig(null, null);
    expect(result).toEqual(globalConfig);
  });

  it('should return global config when no space override exists', async () => {
    mockStorage.get.mockResolvedValue(globalConfig);

    const result = await getEffectiveConfig('DEV', null);
    expect(result).toEqual(globalConfig);
  });

  it('should filter levels based on space override', async () => {
    mockStorage.get.mockResolvedValue(globalConfig);

    const spaceConfig = {
      allowedLevelIds: ['public', 'internal'],
      defaultLevelId: 'internal',
    };

    const result = await getEffectiveConfig('DEV', spaceConfig);

    expect(result.levels.find((l) => l.id === 'public').allowed).toBe(true);
    expect(result.levels.find((l) => l.id === 'internal').allowed).toBe(true);
    expect(result.levels.find((l) => l.id === 'confidential').allowed).toBe(
      false,
    );
    expect(result.levels.find((l) => l.id === 'secret').allowed).toBe(false);
  });

  it('should use space default level when valid', async () => {
    mockStorage.get.mockResolvedValue(globalConfig);

    const spaceConfig = {
      allowedLevelIds: ['public', 'internal'],
      defaultLevelId: 'public',
    };

    const result = await getEffectiveConfig('DEV', spaceConfig);
    expect(result.defaultLevelId).toBe('public');
  });

  it('should fall back to global default when space default is invalid', async () => {
    mockStorage.get.mockResolvedValue(globalConfig);

    const spaceConfig = {
      allowedLevelIds: ['public'],
      defaultLevelId: 'internal',
    };

    const result = await getEffectiveConfig('DEV', spaceConfig);
    expect(result.defaultLevelId).toBe('internal');
  });
});
