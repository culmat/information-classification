import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockGetPageClassification = vi.fn();
const mockClassifyPage = vi.fn();
const mockKvsGet = vi.fn().mockResolvedValue(null);
const mockKvsDelete = vi.fn().mockResolvedValue(undefined);
const mockEnqueueJob = vi.fn().mockResolvedValue({ jobId: 'job-abc' });
const mockGetHistory = vi
  .fn()
  .mockResolvedValue({ truncated: false, entries: [] });

vi.mock('@forge/kvs', () => ({
  kvs: {
    get: (...args) => mockKvsGet(...args),
    set: vi.fn(),
    delete: (...args) => mockKvsDelete(...args),
  },
}));

vi.mock('@forge/events', () => ({
  Queue: vi.fn().mockImplementation(() => ({
    push: vi.fn().mockResolvedValue({ jobId: 'job-abc' }),
  })),
}));

const mockFindDescendantsToClassify = vi
  .fn()
  .mockResolvedValue({ results: [], totalSize: 0 });
const mockFindDescendants = vi
  .fn()
  .mockResolvedValue({ results: [], totalSize: 0 });

vi.mock('../../src/services/classificationService', () => ({
  getPageClassification: (...args) => mockGetPageClassification(...args),
  classifyPage: (...args) => mockClassifyPage(...args),
  findDescendantsToClassify: (...args) =>
    mockFindDescendantsToClassify(...args),
  findDescendants: (...args) => mockFindDescendants(...args),
}));

vi.mock('../../src/services/contentPropertyService', () => ({
  getClassification: vi.fn().mockResolvedValue(null),
  getHistory: (...args) => mockGetHistory(...args),
}));

vi.mock('../../src/utils/jobQueue', () => ({
  enqueueJob: (...args) => mockEnqueueJob(...args),
}));

vi.mock('../../src/storage/configStore', () => ({
  getEffectiveConfig: vi.fn().mockResolvedValue({ levels: [] }),
}));

vi.mock('../../src/storage/spaceConfigStore', () => ({
  getSpaceConfig: vi.fn().mockResolvedValue(null),
}));

const { getClassificationResolver, setClassificationResolver } =
  await import('../../src/resolvers/classifyResolver');

beforeEach(() => {
  vi.clearAllMocks();
  mockFindDescendantsToClassify.mockResolvedValue({
    results: [],
    totalSize: 0,
  });
  mockFindDescendants.mockResolvedValue({ results: [], totalSize: 0 });
  mockEnqueueJob.mockResolvedValue({ jobId: 'job-abc' });
  // Default: no active job — individual tests override with kvs.get mock.
  mockKvsGet.mockResolvedValue(null);
  mockGetPageClassification.mockResolvedValue({
    classification: null,
    config: { levels: [], defaultLevelId: 'internal' },
  });
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

  describe('stale-job clearance', () => {
    // Regression guards for the stuck-dialog bug: when the async consumer
    // dies mid-job (tunnel reload, retry exhaustion) the KVS entry persists
    // and the byline dialog gets stuck on "Classified 0 of N". We treat any
    // job with no progress update in STALE_JOB_MS (10 minutes) as dead.
    const now = Date.now();
    const ONE_MIN = 60 * 1000;

    it('returns activeJob when it is fresh (startedAt 1 min ago)', async () => {
      mockKvsGet.mockResolvedValue({
        jobId: 'job-abc',
        total: 72,
        startedAt: now - 1 * ONE_MIN,
        classified: 0,
        failed: 0,
      });

      const result = await getClassificationResolver({
        context: {},
        payload: { pageId: '123', spaceKey: 'DEV' },
      });

      expect(result.activeJob).toBeTruthy();
      expect(result.activeJob.jobId).toBe('job-abc');
      expect(mockKvsDelete).not.toHaveBeenCalled();
    });

    it('clears activeJob when startedAt is >10 min ago and no lastProgressAt', async () => {
      mockKvsGet.mockResolvedValue({
        jobId: 'job-abc',
        total: 72,
        startedAt: now - 15 * ONE_MIN,
        classified: 0,
        failed: 0,
      });

      const result = await getClassificationResolver({
        context: {},
        payload: { pageId: '123', spaceKey: 'DEV' },
      });

      expect(result.activeJob).toBeNull();
      expect(mockKvsDelete).toHaveBeenCalledOnce();
    });

    it('keeps activeJob when lastProgressAt is recent (even if startedAt is old)', async () => {
      mockKvsGet.mockResolvedValue({
        total: 72,
        startedAt: now - 30 * ONE_MIN,
        classified: 40,
        failed: 0,
        lastProgressAt: now - 1 * ONE_MIN,
      });

      const result = await getClassificationResolver({
        context: {},
        payload: { pageId: '123', spaceKey: 'DEV' },
      });

      expect(result.activeJob).toBeTruthy();
      expect(result.activeJob.classified).toBe(40);
      expect(mockKvsDelete).not.toHaveBeenCalled();
    });
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
    mockClassifyPage.mockResolvedValue({
      success: true,
      classification: { level: 'public' },
    });

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
    // Recursive flag ignored — resolver only handles single-page now.
    expect(mockClassifyPage).toHaveBeenCalledWith({
      pageId: '456',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-123',
      recursive: false,
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
      expect.objectContaining({ recursive: false }),
    );
  });

  it('should default locale to en', async () => {
    mockClassifyPage.mockResolvedValue({ success: true });

    await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: { pageId: '123', spaceKey: 'DEV', levelId: 'public' },
    });

    expect(mockClassifyPage).toHaveBeenCalledWith(
      expect.objectContaining({ locale: 'en' }),
    );
  });

  // The async-queue recursive branch was retired — recursive classification
  // now runs client-side via startRecursiveClassify / processClassifyBatch
  // (see classifyJobResolver.test.js). setClassification only handles the
  // single-page path now; any `recursive: true` payload is ignored here.
  it('always classifies non-recursively (recursive flag ignored)', async () => {
    mockClassifyPage.mockResolvedValue({ success: true });

    await setClassificationResolver({
      context: { accountId: 'user-123' },
      payload: {
        pageId: '557281',
        spaceKey: 'IC',
        levelId: 'confidential',
        recursive: true, // intentional — resolver should ignore it
      },
    });

    expect(mockClassifyPage).toHaveBeenCalledWith(
      expect.objectContaining({ recursive: false }),
    );
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });
});
