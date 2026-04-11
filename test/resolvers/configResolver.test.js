import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetGlobalConfig = vi.fn();
const mockSetGlobalConfig = vi.fn();
vi.mock('../../src/storage/configStore', () => ({
  getGlobalConfig: (...args) => mockGetGlobalConfig(...args),
  setGlobalConfig: (...args) => mockSetGlobalConfig(...args),
}));

vi.mock('@forge/api', () => ({
  default: {
    asUser: () => ({
      requestConfluence: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ totalSize: 0, results: [] }),
      }),
    }),
  },
  route: (strings, ...values) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] || ''), ''),
}));

// Mock admin auth — all test callers are treated as admins
vi.mock('../../src/utils/adminAuth', () => ({
  isConfluenceAdmin: vi.fn().mockResolvedValue(true),
}));

const { getConfigResolver, setConfigResolver } =
  await import('../../src/resolvers/configResolver');

beforeEach(() => {
  vi.clearAllMocks();
});

const adminReq = (payload = {}) => ({
  context: { accountId: 'admin-123' },
  payload,
});

describe('getConfigResolver', () => {
  it('should return config', async () => {
    const config = { levels: [], defaultLevelId: 'internal' };
    mockGetGlobalConfig.mockResolvedValue(config);

    const result = await getConfigResolver(adminReq());
    expect(result.success).toBe(true);
    expect(result.config).toEqual(config);
  });
});

const langs = [{ code: 'en', label: 'English' }];

describe('setConfigResolver — validation', () => {
  it('should reject missing config', async () => {
    const result = await setConfigResolver(adminReq({}));
    expect(result.success).toBe(false);
  });

  it('should reject empty levels array', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: { languages: langs, levels: [], defaultLevelId: 'x' },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at least one/i);
  });

  it('should reject config with no allowed levels', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          languages: langs,
          levels: [
            {
              id: 'secret',
              name: { en: 'Secret' },
              color: 'red',
              allowed: false,
            },
          ],
          defaultLevelId: 'secret',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowed/i);
  });

  it('should reject config where default is not an allowed level', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          languages: langs,
          levels: [
            {
              id: 'public',
              name: { en: 'Public' },
              color: 'green',
              allowed: true,
            },
            {
              id: 'secret',
              name: { en: 'Secret' },
              color: 'red',
              allowed: false,
            },
          ],
          defaultLevelId: 'secret',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/default.*allowed/i);
  });

  it('should reject duplicate level IDs', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          languages: langs,
          levels: [
            {
              id: 'public',
              name: { en: 'Public' },
              color: 'green',
              allowed: true,
            },
            {
              id: 'public',
              name: { en: 'Public 2' },
              color: 'blue',
              allowed: true,
            },
          ],
          defaultLevelId: 'public',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unique/i);
  });

  it('should reject invalid color', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          languages: langs,
          levels: [
            {
              id: 'custom',
              name: { en: 'Custom' },
              color: 'pink',
              allowed: true,
            },
          ],
          defaultLevelId: 'custom',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/color/i);
  });

  it('should reject level without English name', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          languages: langs,
          levels: [
            {
              id: 'custom',
              name: { de: 'Benutzerdefiniert' },
              color: 'green',
              allowed: true,
            },
          ],
          defaultLevelId: 'custom',
        },
      }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/english name/i);
  });

  it('should accept valid config and save it', async () => {
    mockSetGlobalConfig.mockResolvedValue(undefined);

    const config = {
      languages: langs,
      levels: [
        { id: 'public', name: { en: 'Public' }, color: 'green', allowed: true },
        {
          id: 'internal',
          name: { en: 'Internal' },
          color: 'yellow',
          allowed: true,
        },
      ],
      defaultLevelId: 'internal',
      contacts: [],
      links: [],
    };

    const result = await setConfigResolver(adminReq({ config }));
    expect(result.success).toBe(true);
    expect(mockSetGlobalConfig).toHaveBeenCalledWith(config);
  });

  it('should reject non-array contacts', async () => {
    const config = {
      languages: langs,
      levels: [
        { id: 'pub', name: { en: 'Public' }, color: 'green', allowed: true },
      ],
      defaultLevelId: 'pub',
      contacts: 'not-an-array',
    };
    const result = await setConfigResolver(adminReq({ config }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/contacts.*array/i);
  });

  it('should reject non-array links', async () => {
    const config = {
      languages: langs,
      levels: [
        { id: 'pub', name: { en: 'Public' }, color: 'green', allowed: true },
      ],
      defaultLevelId: 'pub',
      links: 'not-an-array',
    };
    const result = await setConfigResolver(adminReq({ config }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/links.*array/i);
  });
});
