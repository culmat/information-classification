import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetGlobalConfig = vi.fn();
const mockSetGlobalConfig = vi.fn();
const mockIsConfluenceAdmin = vi.fn();
const mockGetAuditStatistics = vi.fn();
const mockGetRecentAuditEntries = vi.fn();

vi.mock('../../src/storage/configStore', () => ({
  getGlobalConfig: (...args) => mockGetGlobalConfig(...args),
  setGlobalConfig: (...args) => mockSetGlobalConfig(...args),
}));

vi.mock('../../src/utils/adminAuth', () => ({
  isConfluenceAdmin: (...args) => mockIsConfluenceAdmin(...args),
}));

vi.mock('../../src/storage/auditStore', () => ({
  getAuditStatistics: (...args) => mockGetAuditStatistics(...args),
  getRecentAuditEntries: (...args) => mockGetRecentAuditEntries(...args),
}));

const { getConfigResolver, setConfigResolver } = await import(
  '../../src/resolvers/configResolver'
);

beforeEach(() => {
  vi.clearAllMocks();
});

const adminReq = (payload = {}) => ({
  context: { accountId: 'admin-123' },
  payload,
});

const nonAdminReq = (payload = {}) => ({
  context: { accountId: 'user-456' },
  payload,
});

describe('getConfigResolver', () => {
  it('should reject non-admin users', async () => {
    mockIsConfluenceAdmin.mockResolvedValue(false);
    const result = await getConfigResolver(nonAdminReq());
    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
  });

  it('should return config for admin users', async () => {
    mockIsConfluenceAdmin.mockResolvedValue(true);
    const config = { levels: [], defaultLevelId: 'internal' };
    mockGetGlobalConfig.mockResolvedValue(config);

    const result = await getConfigResolver(adminReq());
    expect(result.success).toBe(true);
    expect(result.config).toEqual(config);
  });
});

describe('setConfigResolver — validation', () => {
  beforeEach(() => {
    mockIsConfluenceAdmin.mockResolvedValue(true);
  });

  it('should reject missing config', async () => {
    const result = await setConfigResolver(adminReq({}));
    expect(result.success).toBe(false);
  });

  it('should reject empty levels array', async () => {
    const result = await setConfigResolver(
      adminReq({ config: { levels: [], defaultLevelId: 'x' } })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/at least one/i);
  });

  it('should reject config with no allowed levels', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          levels: [
            { id: 'secret', name: { en: 'Secret' }, color: 'red', allowed: false },
          ],
          defaultLevelId: 'secret',
        },
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/allowed/i);
  });

  it('should reject config where default is not an allowed level', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          levels: [
            { id: 'public', name: { en: 'Public' }, color: 'green', allowed: true },
            { id: 'secret', name: { en: 'Secret' }, color: 'red', allowed: false },
          ],
          defaultLevelId: 'secret',
        },
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/default.*allowed/i);
  });

  it('should reject duplicate level IDs', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          levels: [
            { id: 'public', name: { en: 'Public' }, color: 'green', allowed: true },
            { id: 'public', name: { en: 'Public 2' }, color: 'blue', allowed: true },
          ],
          defaultLevelId: 'public',
        },
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/unique/i);
  });

  it('should reject invalid color', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          levels: [
            { id: 'custom', name: { en: 'Custom' }, color: 'pink', allowed: true },
          ],
          defaultLevelId: 'custom',
        },
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/color/i);
  });

  it('should reject level without English name', async () => {
    const result = await setConfigResolver(
      adminReq({
        config: {
          levels: [
            { id: 'custom', name: { de: 'Benutzerdefiniert' }, color: 'green', allowed: true },
          ],
          defaultLevelId: 'custom',
        },
      })
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/english name/i);
  });

  it('should accept valid config and save it', async () => {
    mockSetGlobalConfig.mockResolvedValue(undefined);

    const config = {
      levels: [
        { id: 'public', name: { en: 'Public' }, color: 'green', allowed: true },
        { id: 'internal', name: { en: 'Internal' }, color: 'yellow', allowed: true },
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
      levels: [{ id: 'pub', name: { en: 'Public' }, color: 'green', allowed: true }],
      defaultLevelId: 'pub',
      contacts: 'not-an-array',
    };
    const result = await setConfigResolver(adminReq({ config }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/contacts.*array/i);
  });

  it('should reject non-array links', async () => {
    const config = {
      levels: [{ id: 'pub', name: { en: 'Public' }, color: 'green', allowed: true }],
      defaultLevelId: 'pub',
      links: 'not-an-array',
    };
    const result = await setConfigResolver(adminReq({ config }));
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/links.*array/i);
  });

  it('should reject non-admin users for setConfig', async () => {
    mockIsConfluenceAdmin.mockResolvedValue(false);
    const result = await setConfigResolver(
      nonAdminReq({ config: { levels: [], defaultLevelId: 'x' } })
    );
    expect(result.success).toBe(false);
    expect(result.status).toBe(403);
  });
});
