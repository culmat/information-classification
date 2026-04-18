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
const mockFindDescendants = vi.fn();

vi.mock('../../src/services/classificationService', () => ({
  classifyPage: (...args) => mockClassifyPage(...args),
  classifySinglePage: (...args) => mockClassifySinglePage(...args),
  findDescendants: (...args) => mockFindDescendants(...args),
}));

const mockGetAncestorIds = vi.fn().mockResolvedValue([]);
vi.mock('../../src/services/restrictionService', () => ({
  getAncestorIds: (...args) => mockGetAncestorIds(...args),
}));

// @forge/api is used for the best-effort page title fetch; return null by
// default so existing tests don't need to care.
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
  startRecursiveClassifyResolver,
  processClassifyBatchResolver,
  cancelClassifyJobResolver,
  getUserPendingJobsResolver,
} = await import('../../src/resolvers/classifyJobResolver');

const PAGE = '557281';
const ACCOUNT = 'user-1';

beforeEach(() => {
  kvsStore.clear();
  vi.clearAllMocks();
  mockClassifyPage.mockResolvedValue({ success: true, unchanged: false });
  mockClassifySinglePage.mockResolvedValue(true);
  mockFindDescendants.mockResolvedValue({ results: [], totalSize: 0 });
});

describe('startRecursiveClassifyResolver', () => {
  it('classifies root, seeds discovery, and writes KVS state', async () => {
    const ids = Array.from({ length: 25 }, (_, i) => ({
      id: String(1000 + i),
      title: `p${i}`,
    }));
    mockFindDescendants.mockResolvedValueOnce({
      results: ids,
      totalSize: 25,
    });

    const result = await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    expect(result.success).toBe(true);
    expect(result.classified).toBe(1); // parent counted
    expect(result.totalEstimate).toBe(26); // 25 descendants + parent
    expect(result.discoveryDone).toBe(true);
    expect(mockClassifyPage).toHaveBeenCalledOnce();
    // Header + 3 chunks (25 / 10 = 2 full + 1 partial) + user-jobs entry.
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeTruthy();
    expect(kvsStore.get(`user-jobs:${ACCOUNT}`)).toEqual({
      rootPageIds: [PAGE],
    });
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}:chunk:0`).ids).toHaveLength(10);
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}:chunk:1`).ids).toHaveLength(10);
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}:chunk:2`).ids).toHaveLength(5);
  });

  it('sets discoveryCursor when more descendants remain', async () => {
    const ids = Array.from({ length: 200 }, (_, i) => ({
      id: String(1000 + i),
      title: 't',
    }));
    mockFindDescendants.mockResolvedValueOnce({
      results: ids,
      totalSize: 500,
    });

    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    const header = kvsStore.get(`job:${ACCOUNT}:${PAGE}`);
    expect(header.discoveryCursor).toBe(200);
    expect(header.totalEstimate).toBe(500);
    expect(header.totalChunks).toBe(20);
  });

  it('does NOT count parent when already at target', async () => {
    mockClassifyPage.mockResolvedValueOnce({ success: true, unchanged: true });
    mockFindDescendants.mockResolvedValueOnce({ results: [], totalSize: 0 });

    const result = await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'internal' },
    });

    expect(result.classified).toBe(0);
  });

  it('rejects when a non-stale job is already running on this root', async () => {
    kvsStore.set(`job:${ACCOUNT}:${PAGE}`, {
      status: 'active',
      startedAt: Date.now(),
      lastProgressAt: Date.now(),
    });

    const result = await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('job_in_progress');
    expect(mockClassifyPage).not.toHaveBeenCalled();
  });

  it('recovers a stale job (>10 min) before starting a new one', async () => {
    const ancient = Date.now() - 20 * 60 * 1000;
    kvsStore.set(`job:${ACCOUNT}:${PAGE}`, {
      status: 'active',
      startedAt: ancient,
      lastProgressAt: ancient,
      nextChunkIdx: 0,
      totalChunks: 1,
    });
    kvsStore.set(`job:${ACCOUNT}:${PAGE}:chunk:0`, { ids: ['old'] });
    kvsStore.set(`user-jobs:${ACCOUNT}`, { rootPageIds: [PAGE] });

    const result = await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    expect(result.success).toBe(true);
    // Fresh job seeded; no trace of the stale chunk remains unless new
    // discovery repopulated it (mockFindDescendants is default empty).
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}:chunk:0`)).toBeUndefined();
  });
});

describe('processClassifyBatchResolver', () => {
  async function seedJob({ ids = [], totalEstimate = ids.length } = {}) {
    mockFindDescendants.mockResolvedValueOnce({
      results: ids.map((id) => ({ id, title: id })),
      totalSize: totalEstimate,
    });
    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });
  }

  it('classifies a chunk per invoke and advances nextChunkIdx', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => String(100 + i));
    await seedJob({ ids });

    const before = kvsStore.get(`job:${ACCOUNT}:${PAGE}`);
    expect(before.nextChunkIdx).toBe(0);

    const batch = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(batch.success).toBe(true);
    expect(batch.classified).toBe(11); // 10 descendants + 1 parent (seeded)
    expect(batch.done).toBe(true);
    // Job deleted on completion.
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeUndefined();
    expect(kvsStore.get(`user-jobs:${ACCOUNT}`)).toBeUndefined();
  });

  it('publishes classification-changed when any descendant was classified', async () => {
    const ids = ['100', '101'];
    await seedJob({ ids });
    mockPublishGlobal.mockClear();

    await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    // Regression guard: open stats macros must get a ping per batch so the
    // chart refreshes during a long recursive job. One publish per batch is
    // all we need — the panel debounces incoming events.
    const changedCalls = mockPublishGlobal.mock.calls.filter(
      (c) => c[0] === 'classification-changed',
    );
    expect(changedCalls.length).toBe(1);
    expect(changedCalls[0][1]).toMatchObject({ source: 'recursive-client' });
  });

  it('does NOT publish classification-changed when the batch had 0 changes', async () => {
    const ids = ['100'];
    await seedJob({ ids });
    mockClassifySinglePage.mockResolvedValueOnce(null); // already at target
    mockPublishGlobal.mockClear();

    await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    const changedCalls = mockPublishGlobal.mock.calls.filter(
      (c) => c[0] === 'classification-changed',
    );
    expect(changedCalls.length).toBe(0);
  });

  it('treats classifySinglePage null as skipped (not failed)', async () => {
    const ids = ['100', '101', '102'];
    await seedJob({ ids });
    mockClassifySinglePage
      .mockResolvedValueOnce(null) // already at target
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false); // write failed

    const batch = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(batch.classified).toBe(2); // 1 parent + 1 descendant
    expect(batch.skipped).toBe(1);
    expect(batch.failed).toBe(1);
    expect(batch.done).toBe(true);
  });

  it('continues discovery across multiple batches', async () => {
    // Initial seed: 10 ids, totalSize 20 (more to discover).
    const firstIds = Array.from({ length: 10 }, (_, i) => ({
      id: String(i),
      title: 't',
    }));
    mockFindDescendants.mockResolvedValueOnce({
      results: firstIds,
      totalSize: 20,
    });
    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });
    const header = kvsStore.get(`job:${ACCOUNT}:${PAGE}`);
    expect(header.discoveryCursor).toBe(10);

    // Next batch's discovery returns the remaining 10 ids.
    const secondIds = Array.from({ length: 10 }, (_, i) => ({
      id: String(100 + i),
      title: 't',
    }));
    mockFindDescendants.mockResolvedValueOnce({
      results: secondIds,
      totalSize: 20,
    });
    const batch1 = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });
    expect(batch1.discoveryDone).toBe(true);
    expect(batch1.done).toBe(false); // still one chunk to classify

    const batch2 = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });
    expect(batch2.done).toBe(true);
    expect(batch2.classified).toBe(21); // 20 descendants + 1 parent
  });

  it('aborts if the target level was deleted mid-job', async () => {
    const ids = ['1', '2'];
    await seedJob({ ids });
    // Mutate the effective config so the target level is gone.
    const storageMock = await import('../../src/storage/configStore');
    storageMock.getEffectiveConfig.mockResolvedValueOnce({
      levels: [{ id: 'internal', allowed: true }],
      defaultLevelId: 'internal',
    });

    const batch = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(batch.done).toBe(true);
    expect(batch.aborted).toBe('level_deleted');
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeUndefined();
  });

  it('aborts if the target level is no longer allowed mid-job', async () => {
    const ids = ['1'];
    await seedJob({ ids });
    const storageMock = await import('../../src/storage/configStore');
    storageMock.getEffectiveConfig.mockResolvedValueOnce({
      levels: [
        { id: 'public', allowed: false },
        { id: 'internal', allowed: true },
      ],
      defaultLevelId: 'internal',
    });

    const batch = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(batch.aborted).toBe('level_disallowed');
  });

  it('returns done:true, cancelled:true if the header is marked cancelled', async () => {
    const ids = ['1', '2'];
    await seedJob({ ids });
    const header = kvsStore.get(`job:${ACCOUNT}:${PAGE}`);
    kvsStore.set(`job:${ACCOUNT}:${PAGE}`, { ...header, status: 'cancelled' });

    const batch = await processClassifyBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(batch.done).toBe(true);
    expect(batch.cancelled).toBe(true);
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeUndefined();
  });
});

describe('cancelClassifyJobResolver', () => {
  it('deletes header + chunks + user-jobs entry', async () => {
    const ids = ['1', '2'];
    mockFindDescendants.mockResolvedValueOnce({
      results: ids.map((id) => ({ id, title: id })),
      totalSize: 2,
    });
    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeTruthy();

    const result = await cancelClassifyJobResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: PAGE },
    });

    expect(result.cancelled).toBe(true);
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}`)).toBeUndefined();
    expect(kvsStore.get(`job:${ACCOUNT}:${PAGE}:chunk:0`)).toBeUndefined();
    expect(kvsStore.get(`user-jobs:${ACCOUNT}`)).toBeUndefined();
  });
});

describe('getUserPendingJobsResolver', () => {
  it('returns live jobs and garbage-collects stale ones', async () => {
    // Live job.
    mockFindDescendants.mockResolvedValueOnce({
      results: [{ id: '1', title: 't' }],
      totalSize: 1,
    });
    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    // Stale job (planted manually).
    const ancient = Date.now() - 20 * 60 * 1000;
    kvsStore.set(`user-jobs:${ACCOUNT}`, {
      rootPageIds: [PAGE, 'stale-page'],
    });
    kvsStore.set(`job:${ACCOUNT}:stale-page`, {
      rootPageId: 'stale-page',
      startedAt: ancient,
      lastProgressAt: ancient,
      status: 'active',
      classified: 0,
      failed: 0,
      skipped: 0,
      totalEstimate: 0,
      parentClassified: 0,
      nextChunkIdx: 0,
      totalChunks: 0,
    });

    const result = await getUserPendingJobsResolver({
      context: { accountId: ACCOUNT },
    });

    expect(result.jobs).toHaveLength(1);
    expect(result.jobs[0].rootPageId).toBe(PAGE);
    expect(kvsStore.get(`job:${ACCOUNT}:stale-page`)).toBeUndefined();
  });

  it('removes orphan entries (in index but no header)', async () => {
    kvsStore.set(`user-jobs:${ACCOUNT}`, { rootPageIds: ['orphan'] });

    const result = await getUserPendingJobsResolver({
      context: { accountId: ACCOUNT },
    });

    expect(result.jobs).toHaveLength(0);
    expect(kvsStore.get(`user-jobs:${ACCOUNT}`)).toBeUndefined();
  });

  it('annotates jobs with isSelf / isAncestor relative to currentPageId', async () => {
    // Seed one job rooted at PAGE.
    mockFindDescendants.mockResolvedValueOnce({
      results: [{ id: '1', title: 't' }],
      totalSize: 1,
    });
    await startRecursiveClassifyResolver({
      context: { accountId: ACCOUNT },
      payload: { pageId: PAGE, spaceKey: 'IC', levelId: 'public' },
    });

    // Case 1: currentPageId IS the root → isSelf.
    let result = await getUserPendingJobsResolver({
      context: { accountId: ACCOUNT },
      payload: { currentPageId: PAGE },
    });
    expect(result.jobs[0].isSelf).toBe(true);
    expect(result.jobs[0].isAncestor).toBe(false);

    // Case 2: currentPageId is a descendant → isAncestor.
    mockGetAncestorIds.mockResolvedValueOnce([PAGE, '999']);
    result = await getUserPendingJobsResolver({
      context: { accountId: ACCOUNT },
      payload: { currentPageId: 'descendant-page' },
    });
    expect(result.jobs[0].isSelf).toBe(false);
    expect(result.jobs[0].isAncestor).toBe(true);

    // Case 3: currentPageId is unrelated → neither.
    mockGetAncestorIds.mockResolvedValueOnce(['999', '1000']);
    result = await getUserPendingJobsResolver({
      context: { accountId: ACCOUNT },
      payload: { currentPageId: 'unrelated' },
    });
    expect(result.jobs[0].isSelf).toBe(false);
    expect(result.jobs[0].isAncestor).toBe(false);
  });
});
