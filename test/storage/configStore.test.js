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
const { getDefaultConfig } = await import('../../src/shared/defaults');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getGlobalConfig', () => {
  it('should return existing config from storage', async () => {
    const existing = { levels: [{ id: 'custom' }], defaultLevelId: 'custom' };
    mockStorage.get.mockResolvedValue(existing);

    const result = await getGlobalConfig();
    expect(result).toEqual(existing);
    expect(mockStorage.set).not.toHaveBeenCalled();
  });

  it('should initialize with defaults when no config exists', async () => {
    mockStorage.get.mockResolvedValue(null);

    const result = await getGlobalConfig();
    expect(result.levels).toHaveLength(4);
    expect(result.defaultLevelId).toBe('internal');
    expect(mockStorage.set).toHaveBeenCalledOnce();
  });

  it('should save defaults on first-time initialization', async () => {
    mockStorage.get.mockResolvedValue(null);

    await getGlobalConfig();
    const savedConfig = mockStorage.set.mock.calls[0][1];
    expect(savedConfig.levels).toHaveLength(4);
    expect(savedConfig.defaultLevelId).toBe('internal');
  });
});

describe('setGlobalConfig', () => {
  it('should save config to storage', async () => {
    const config = { levels: [], defaultLevelId: 'test' };
    await setGlobalConfig(config);
    expect(mockStorage.set).toHaveBeenCalledWith('config:global', config);
  });
});

describe('getEffectiveConfig', () => {
  const globalConfig = {
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

    // public and internal should be allowed
    expect(result.levels.find((l) => l.id === 'public').allowed).toBe(true);
    expect(result.levels.find((l) => l.id === 'internal').allowed).toBe(true);
    // confidential should be disallowed (not in space allowedLevelIds)
    expect(result.levels.find((l) => l.id === 'confidential').allowed).toBe(
      false,
    );
    // secret remains disallowed (globally disallowed AND not in space list)
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
      defaultLevelId: 'internal', // internal is not in space allowed list
    };

    const result = await getEffectiveConfig('DEV', spaceConfig);
    // internal is not allowed in space, so fall back to global default
    expect(result.defaultLevelId).toBe('internal'); // global default
  });
});
