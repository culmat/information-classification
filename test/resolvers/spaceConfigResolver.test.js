import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetSpaceConfig = vi.fn();
const mockSetSpaceConfig = vi.fn();
const mockDeleteSpaceConfig = vi.fn();
const mockGetGlobalConfig = vi.fn();

vi.mock('../../src/storage/spaceConfigStore', () => ({
  getSpaceConfig: (...args) => mockGetSpaceConfig(...args),
  setSpaceConfig: (...args) => mockSetSpaceConfig(...args),
  deleteSpaceConfig: (...args) => mockDeleteSpaceConfig(...args),
}));

vi.mock('../../src/storage/configStore', () => ({
  getGlobalConfig: (...args) => mockGetGlobalConfig(...args),
}));

// Mock admin auth — all test callers are treated as space admins
vi.mock('../../src/utils/adminAuth', () => ({
  isSpaceAdmin: vi.fn().mockResolvedValue(true),
}));

const {
  getSpaceConfigResolver,
  setSpaceConfigResolver,
  resetSpaceConfigResolver,
} = await import('../../src/resolvers/spaceConfigResolver');

const globalConfig = {
  levels: [
    { id: 'public', allowed: true },
    { id: 'internal', allowed: true },
    { id: 'confidential', allowed: true },
    { id: 'secret', allowed: false },
  ],
  defaultLevelId: 'internal',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetGlobalConfig.mockResolvedValue(globalConfig);
});

const req = (payload = {}) => ({
  context: { accountId: 'user-123' },
  payload,
});

describe('getSpaceConfigResolver', () => {
  it('should reject missing spaceKey', async () => {
    const result = await getSpaceConfigResolver(req({}));
    expect(result.success).toBe(false);
  });

  it('should return space config and global config', async () => {
    const spConfig = { allowedLevelIds: ['public'], defaultLevelId: 'public' };
    mockGetSpaceConfig.mockResolvedValue(spConfig);

    const result = await getSpaceConfigResolver(req({ spaceKey: 'DEV' }));
    expect(result.success).toBe(true);
    expect(result.spaceConfig).toEqual(spConfig);
    expect(result.globalConfig).toEqual(globalConfig);
  });

  it('should return null spaceConfig when no override exists', async () => {
    mockGetSpaceConfig.mockResolvedValue(null);

    const result = await getSpaceConfigResolver(req({ spaceKey: 'DEV' }));
    expect(result.success).toBe(true);
    expect(result.spaceConfig).toBeNull();
  });
});

describe('setSpaceConfigResolver', () => {
  it('should reject missing spaceKey', async () => {
    const result = await setSpaceConfigResolver(req({ config: {} }));
    expect(result.success).toBe(false);
  });

  it('should reject missing config', async () => {
    const result = await setSpaceConfigResolver(req({ spaceKey: 'DEV' }));
    expect(result.success).toBe(false);
  });

  it('should reject levels not globally allowed', async () => {
    const result = await setSpaceConfigResolver(
      req({
        spaceKey: 'DEV',
        config: {
          allowedLevelIds: ['public', 'secret'], // secret is globally disallowed
          defaultLevelId: 'public',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not globally allowed/i);
  });

  it('should reject default not in allowed set', async () => {
    const result = await setSpaceConfigResolver(
      req({
        spaceKey: 'DEV',
        config: {
          allowedLevelIds: ['public'],
          defaultLevelId: 'internal', // not in allowed list
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowed levels/i);
  });

  it('should save valid space config', async () => {
    mockSetSpaceConfig.mockResolvedValue(undefined);

    const config = {
      allowedLevelIds: ['public', 'internal'],
      defaultLevelId: 'internal',
    };

    const result = await setSpaceConfigResolver(
      req({ spaceKey: 'DEV', config }),
    );
    expect(result.success).toBe(true);
    expect(mockSetSpaceConfig).toHaveBeenCalledWith('DEV', config);
  });
});

describe('resetSpaceConfigResolver', () => {
  it('should reject missing spaceKey', async () => {
    const result = await resetSpaceConfigResolver(req({}));
    expect(result.success).toBe(false);
  });

  it('should delete space config', async () => {
    mockDeleteSpaceConfig.mockResolvedValue(undefined);

    const result = await resetSpaceConfigResolver(req({ spaceKey: 'DEV' }));
    expect(result.success).toBe(true);
    expect(mockDeleteSpaceConfig).toHaveBeenCalledWith('DEV');
  });
});
