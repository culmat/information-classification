import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetPageClassification = vi.fn();
const mockClassifyPage = vi.fn();
const mockKvsGet = vi.fn().mockResolvedValue(null);

vi.mock('@forge/kvs', () => ({
  kvs: { get: (...args) => mockKvsGet(...args), set: vi.fn(), delete: vi.fn() },
}));

vi.mock('../../src/services/classificationService', () => ({
  getPageClassification: (...args) => mockGetPageClassification(...args),
  classifyPage: (...args) => mockClassifyPage(...args),
}));

const { getClassificationResolver, setClassificationResolver } = await import(
  '../../src/resolvers/classifyResolver'
);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getClassificationResolver', () => {
  it('should reject missing pageId', async () => {
    const result = await getClassificationResolver({
      context: {},
      payload: { spaceKey: 'DEV' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing spaceKey', async () => {
    const result = await getClassificationResolver({
      context: {},
      payload: { pageId: '123' },
    });
    expect(result.success).toBe(false);
  });

  it('should return classification and config', async () => {
    const mockResult = {
      classification: { level: 'internal' },
      config: { levels: [], defaultLevelId: 'internal' },
    };
    mockGetPageClassification.mockResolvedValue(mockResult);

    const result = await getClassificationResolver({
      context: {},
      payload: { pageId: '123', spaceKey: 'DEV' },
    });

    expect(result.success).toBe(true);
    expect(result.classification).toEqual({ level: 'internal' });
    expect(result.config).toBeTruthy();
  });
});

describe('setClassificationResolver', () => {
  it('should reject missing pageId', async () => {
    const result = await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { spaceKey: 'DEV', levelId: 'public' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing spaceKey', async () => {
    const result = await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', levelId: 'public' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject missing levelId', async () => {
    const result = await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', spaceKey: 'DEV' },
    });
    expect(result.success).toBe(false);
  });

  it('should reject unauthenticated requests', async () => {
    const result = await setClassificationResolver({
      context: {},
      payload: { pageId: '123', spaceKey: 'DEV', levelId: 'public' },
    });
    expect(result.success).toBe(false);
    expect(result.status).toBe(401);
  });

  it('should call classifyPage with correct parameters', async () => {
    mockClassifyPage.mockResolvedValue({ success: true, classification: { level: 'public' } });

    const result = await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: {
        pageId: '456',
        spaceKey: 'DEV',
        levelId: 'public',
        recursive: true,
        locale: 'de',
      },
    });

    expect(result.success).toBe(true);
    expect(mockClassifyPage).toHaveBeenCalledWith({
      pageId: '456',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-123',
      recursive: true,
      locale: 'de',
    });
  });

  it('should return error when classifyPage fails', async () => {
    mockClassifyPage.mockResolvedValue({
      success: false,
      error: 'level_disallowed',
      message: 'Not allowed.',
    });

    const result = await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', spaceKey: 'DEV', levelId: 'secret' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Not allowed.');
  });

  it('should default recursive to false', async () => {
    mockClassifyPage.mockResolvedValue({ success: true });

    await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', spaceKey: 'DEV', levelId: 'public' },
    });

    expect(mockClassifyPage).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: false })
    );
  });

  it('should default locale to en', async () => {
    mockClassifyPage.mockResolvedValue({ success: true });

    await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', spaceKey: 'DEV', levelId: 'public' },
    });

    expect(mockClassifyPage).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' })
    );
  });
});
