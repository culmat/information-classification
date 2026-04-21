import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory KVS — the job store hits kvs get/set/delete a lot, so a real
// map is easier to reason about than per-key mocks.
const kvsStore = new Map();
const mockKvs = {
  get: vi.fn(async (key) => kvsStore.get(key) ?? null),
  set: vi.fn(async (key, value) => {
    kvsStore.set(key, value);
  }),
  delete: vi.fn(async (key) => {
    kvsStore.delete(key);
  }),
};
vi.mock('@forge/kvs', () => ({ kvs: mockKvs }));

const mockPublishGlobal = vi.fn().mockResolvedValue(undefined);
vi.mock('@forge/realtime', () => ({
  publishGlobal: (...args) => mockPublishGlobal(...args),
}));

const mockClassifyPage = vi.fn();
const mockClassifySinglePage = vi.fn();
const mockFindPagesByScope = vi.fn();

vi.mock('../../src/services/classificationService', () => ({
  classifyPage: (...args) => mockClassifyPage(...args),
  classifySinglePage: (...args) => mockClassifySinglePage(...args),
  findPagesByScope: (...args) => mockFindPagesByScope(...args),
}));

const mockGetAncestorIds = vi.fn().mockResolvedValue([]);
vi.mock('../../src/services/restrictionService', () => ({
  getAncestorIds: (...args) => mockGetAncestorIds(...args),
}));

vi.mock('@forge/api', () => ({
  default: {
    asUser: () => ({
      requestConfluence: vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({}),
      }),
    }),
  },
  route: (strings, ...values) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), ''),
}));

const effectiveConfig = {
  levels: [
    {
      id: 'public',
      name: { en: 'Public' },
      color: 'green',
      allowed: true,
      requiresProtection: false,
    },
    {
      id: 'internal',
      name: { en: 'Internal' },
      color: 'blue',
      allowed: true,
      requiresProtection: false,
    },
  ],
  defaultLevelId: 'internal',
};
vi.mock('../../src/storage/configStore', () => ({
  getEffectiveConfig: vi.fn(async () => effectiveConfig),
}));
vi.mock('../../src/storage/spaceConfigStore', () => ({
  getSpaceConfig: vi.fn(async () => null),
}));

const {
  startBulkClassifyResolver,
  processClassifyBatchResolver,
  cancelClassifyJobResolver,
  countBulkClassifyScopeResolver,
  getUserJobsResolver,
} = await import('../../src/resolvers/classifyJobResolver');

const PAGE = '557281';
const ACCOUNT = 'user-1';

function descendantsPayload(overrides = {}) {
  return {
    scope: { kind: 'descendants', rootPageId: PAGE },
    sourceLevelFilter: null,
    targetLevelId: 'public',
    spaceKey: 'IC',
    ...overrides,
  };
}

function fromLevelPayload(overrides = {}) {
  return {
    scope: { kind: 'fromLevel' },
    sourceLevelFilter: 'internal',
    targetLevelId: 'public',
    ...overrides,
  };
}

beforeEach(() => {
  kvsStore.clear();
  vi.clearAllMocks();
  mockClassifyPage.mockResolvedValue({ success: true, unchanged: false });
  mockClassifySinglePage.mockResolvedValue(true);
  mockFindPagesByScope.mockResolvedValue({ results: [], totalSize: 0 });
});

describe('startBulkClassifyResolver (descendants)', () => {
  it('classifies root, seeds discovery, and writes KVS state', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => ({
      id: String(1000 + i),
      title: `p${i}`,
    }));
    mockFindPagesByScope.mockResolvedValueOnce({ results: ids, totalSize: 25 });

    const result = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: descendantsPayload(),
    });

    expect(result.success).toBe(true);
    expect(result.promoted).toBe(true);
    expect(result.classified).toBe(1); // root counted
    expect(result.totalEstimate).toBe(26);
    expect(result.discoveryDone).toBe(true);
    expect(mockClassifyPage).toHaveBeenCalledOnce();

    const index = kvsStore.get(`user-jobs:${ACCOUNT}`);
    expect(index.activeJobId).toBe(result.jobId);
    expect(index.queuedJobIds).toEqual([]);
    const header = kvsStore.get(`job:${ACCOUNT}:${result.jobId}`);
    expect(header.status).toBe('active');
    expect(header.totalChunks).toBe(9);
  });

  it('sets discoveryCursor when more descendants remain', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => ({
      id: String(1000 + i),
      title: 't',
    }));
    mockFindPagesByScope.mockResolvedValueOnce({
      results: ids,
      totalSize: 500,
    });

    const result = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: descendantsPayload(),
    });

    const header = kvsStore.get(`job:${ACCOUNT}:${result.jobId}`);
    expect(header.discoveryCursor).toBe(200);
    expect(header.totalEstimate).toBe(500);
    expect(header.chunkSize).toBe(20);
    expect(header.totalChunks).toBe(10);
  });

  it('rejects on overlapping descendants from a prior ancestor job', async () => {
    // user A starts an ancestor job.
    mockGetAncestorIds.mockResolvedValueOnce([]);
    const a = await startBulkClassifyResolver({
      context: { accountId: 'other-user' },
      payload: {
        ...descendantsPayload(),
        scope: { kind: 'descendants', rootPageId: 'ANCESTOR' },
      },
    });
    expect(a.success).toBe(true);

    // user B tries to classify a descendant of that ancestor.
    mockGetAncestorIds.mockResolvedValueOnce(['ANCESTOR']);
    const b = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: descendantsPayload(),
    });
    expect(b.success).toBe(false);
    expect(b.error).toBe('scope_conflict');
  });
});

describe('startBulkClassifyResolver (fromLevel)', () => {
  it('seeds site-wide discovery with level filter', async () => {
    const ids = Array.from({ length: 5 }, (_, i) => ({
      id: String(2000 + i),
      title: 'x',
    }));
    mockFindPagesByScope.mockResolvedValueOnce({ results: ids, totalSize: 5 });

    const result = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: fromLevelPayload(),
    });

    expect(result.success).toBe(true);
    expect(result.promoted).toBe(true);
    // No root classification for fromLevel.
    expect(mockClassifyPage).not.toHaveBeenCalled();
    expect(result.totalEstimate).toBe(5);
    const header = kvsStore.get(`job:${ACCOUNT}:${result.jobId}`);
    expect(header.scope).toEqual({ kind: 'fromLevel' });
    expect(header.sourceLevelFilter).toBe('internal');
  });

  it('requires sourceLevelFilter for fromLevel scope', async () => {
    const result = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { ...fromLevelPayload(), sourceLevelFilter: null },
    });
    expect(result.success).toBe(false);
  });

  it('blocks a second fromLevel job with the same source across users', async () => {
    mockFindPagesByScope.mockResolvedValueOnce({ results: [], totalSize: 0 });
    const a = await startBulkClassifyResolver({
      context: { accountId: 'user-a' },
      payload: fromLevelPayload(),
    });
    expect(a.success).toBe(true);

    const b = await startBulkClassifyResolver({
      context: { accountId: 'user-b' },
      payload: fromLevelPayload(),
    });
    expect(b.success).toBe(false);
    expect(b.error).toBe('scope_conflict');
  });
});

describe('per-user queue', () => {
  it('queues a second job behind an active one for the same user', async () => {
    mockFindPagesByScope
      .mockResolvedValueOnce({ results: [], totalSize: 0 })
      .mockResolvedValueOnce({ results: [], totalSize: 0 });

    const a = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: fromLevelPayload({ sourceLevelFilter: 'internal' }),
    });
    expect(a.promoted).toBe(true);

    // Same user queues a non-overlapping fromLevel job (different source).
    const b = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: fromLevelPayload({
        sourceLevelFilter: 'public',
        targetLevelId: 'internal',
      }),
    });
    expect(b.success).toBe(true);
    expect(b.promoted).toBe(false);
    expect(b.queuePosition).toBe(1);

    const index = kvsStore.get(`user-jobs:${ACCOUNT}`);
    expect(index.activeJobId).toBe(a.jobId);
    expect(index.queuedJobIds).toEqual([b.jobId]);
  });

  it('onJobComplete promotes the next queued job', async () => {
    mockFindPagesByScope
      .mockResolvedValueOnce({ results: [], totalSize: 0 })
      .mockResolvedValueOnce({ results: [], totalSize: 0 });

    const a = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: fromLevelPayload({ sourceLevelFilter: 'internal' }),
    });
    const b = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: fromLevelPayload({
        sourceLevelFilter: 'public',
        targetLevelId: 'internal',
      }),
    });
    expect(b.promoted).toBe(false);

    // Cancel the active one — b should promote automatically.
    const cancel = await cancelClassifyJobResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: a.jobId },
    });
    expect(cancel.success).toBe(true);
    expect(cancel.promotedNextJobId).toBe(b.jobId);

    const index = kvsStore.get(`user-jobs:${ACCOUNT}`);
    expect(index.activeJobId).toBe(b.jobId);
    expect(index.queuedJobIds).toEqual([]);
  });
});

describe('processClassifyBatchResolver', () => {
  async function seedJob() {
    const ids = Array.from({ length: 6 }, (_, i) => ({
      id: String(3000 + i),
      title: 'x',
    }));
    mockFindPagesByScope.mockResolvedValueOnce({ results: ids, totalSize: 6 });
    const start = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: descendantsPayload(),
    });
    return start.jobId;
  }

  it('classifies a chunk per invoke and advances nextChunkIdx', async () => {
    const jobId = await seedJob();
    mockFindPagesByScope.mockResolvedValue({ results: [], totalSize: 6 });
    mockClassifySinglePage.mockResolvedValue(true);

    const result = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId },
    });
    expect(result.success).toBe(true);
    expect(result.done).toBe(false);
    // Chunk 0 drained; classified should have increased from 1 (root) by 3.
    expect(result.classified).toBeGreaterThan(1);
  });

  it('returns done:true when cancelled, promotes next if any', async () => {
    const jobId = await seedJob();
    const header = kvsStore.get(`job:${ACCOUNT}:${jobId}`);
    header.status = 'cancelled';
    kvsStore.set(`job:${ACCOUNT}:${jobId}`, header);

    const result = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId },
    });
    expect(result.success).toBe(true);
    expect(result.done).toBe(true);
    expect(result.cancelled).toBe(true);
  });

  it('aborts if the target level was deleted mid-job', async () => {
    const jobId = await seedJob();
    const { getEffectiveConfig } =
      await import('../../src/storage/configStore');
    getEffectiveConfig.mockResolvedValueOnce({ levels: [] });

    const result = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId },
    });
    expect(result.done).toBe(true);
    expect(result.aborted).toBe('level_deleted');
  });
});

describe('getUserJobsResolver', () => {
  it('returns active + queued jobs and GCs orphan entries', async () => {
    kvsStore.set(`user-jobs:${ACCOUNT}`, {
      activeJobId: 'orphan',
      queuedJobIds: [],
    });
    const result = await getUserJobsResolver({
      context: { accountId: ACCOUNT },
    });
    expect(result.success).toBe(true);
    expect(result.activeJob).toBeNull();
    expect(result.queuedJobs).toEqual([]);
  });

  it('annotates bulk-classify descendants with isSelf/isAncestor', async () => {
    mockFindPagesByScope.mockResolvedValueOnce({ results: [], totalSize: 0 });
    const a = await startBulkClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: descendantsPayload(),
    });
    mockGetAncestorIds.mockResolvedValueOnce(['ancestor-xyz']);
    const result = await getUserJobsResolver({
      context: { accountId: ACCOUNT },
      payload: { currentPageId: PAGE },
    });
    expect(result.activeJob.jobId).toBe(a.jobId);
    expect(result.activeJob.isSelf).toBe(true);
  });
});

describe('countBulkClassifyScopeResolver', () => {
  it('returns the CQL totalSize for the scope', async () => {
    mockFindPagesByScope.mockResolvedValueOnce({ results: [], totalSize: 123 });
    const result = await countBulkClassifyScopeResolver({
      context: { accountId: ACCOUNT },
      payload: { scope: { kind: 'fromLevel' }, sourceLevelFilter: 'internal' },
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(123);
  });
});
