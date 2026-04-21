import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory KVS shared across helpers + resolver.
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

const mockAddLabelToPage = vi.fn();
const mockRemoveLabelFromPage = vi.fn();
vi.mock('../../src/services/labelService', () => ({
  addLabelToPage: (...args) => mockAddLabelToPage(...args),
  removeLabelFromPage: (...args) => mockRemoveLabelFromPage(...args),
}));

const mockClassifySinglePage = vi.fn();
vi.mock('../../src/services/classificationService', () => ({
  classifySinglePage: (...args) => mockClassifySinglePage(...args),
}));

// Discovery + estimate now go through api.asUser().requestConfluence() so the
// gap CQL predicates can be built directly. Each test configures an ordered
// queue of `{results, totalSize}` responses via `queueCql()`.
const cqlQueue = [];
function queueCql(responses) {
  for (const r of responses) cqlQueue.push(r);
}
const mockRequestConfluence = vi.fn(async () => {
  const next = cqlQueue.shift() || { results: [], totalSize: 0 };
  return {
    ok: true,
    json: async () => ({
      results: (next.results || []).map((r) => ({
        content: { id: r.id, title: r.title },
      })),
      totalSize: next.totalSize || 0,
    }),
  };
});
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestConfluence: mockRequestConfluence }) },
  route: (strings, ...values) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), ''),
}));

const mockGetClassification = vi.fn();
vi.mock('../../src/services/contentPropertyService', () => ({
  getClassification: (...args) => mockGetClassification(...args),
}));

const globalConfig = {
  levels: [
    { id: 'public', allowed: true },
    { id: 'internal', allowed: true },
    { id: 'confidential', allowed: true },
  ],
};
const effectiveConfig = {
  levels: [
    { id: 'public', allowed: true },
    { id: 'internal', allowed: true },
    { id: 'confidential', allowed: true },
  ],
};
vi.mock('../../src/storage/configStore', () => ({
  getGlobalConfig: vi.fn(async () => globalConfig),
  getEffectiveConfig: vi.fn(async () => effectiveConfig),
}));
vi.mock('../../src/storage/spaceConfigStore', () => ({
  getSpaceConfig: vi.fn(async () => null),
}));

const {
  startLabelImportResolver,
  startLabelExportResolver,
  processLabelBatchResolver,
  cancelLabelJobResolver,
} = await import('../../src/resolvers/labelJobResolver');

const ACCOUNT = 'admin-1';

beforeEach(() => {
  kvsStore.clear();
  cqlQueue.length = 0;
  vi.clearAllMocks();
  mockAddLabelToPage.mockResolvedValue(true);
  mockRemoveLabelFromPage.mockResolvedValue(true);
  mockClassifySinglePage.mockResolvedValue(true);
  mockGetClassification.mockResolvedValue(null);
});

describe('startLabelImportResolver', () => {
  it('rejects empty mappings', async () => {
    const result = await startLabelImportResolver({
      context: { accountId: ACCOUNT },
      payload: { mappings: [] },
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid labels (CQL-injection defence)', async () => {
    const result = await startLabelImportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labels: ['bad"name'] }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('returns count=0 when no pages match any label', async () => {
    // Every findPagesByLabel call returns zero.
    const result = await startLabelImportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labels: ['foo'] }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.count).toBe(0);
  });

  it('seeds a job and writes header + first chunks on a small label set', async () => {
    // Three CQL calls: labelled estimate (5), alreadyAtTarget estimate (0),
    // first-discovery (5 ids).
    const ids = Array.from({ length: 5 }, (_, i) => ({
      id: String(1000 + i),
      title: `p${i}`,
    }));
    queueCql([
      { results: [], totalSize: 5 },
      { results: [], totalSize: 0 },
      { results: ids, totalSize: 5 },
    ]);

    const result = await startLabelImportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labels: ['foo'] }],
        removeLabels: true,
      },
    });

    expect(result.success).toBe(true);
    expect(result.jobId).toMatch(/^label-import-/);
    expect(result.promoted).toBe(true);
    expect(result.totalEstimate).toBe(5);
    expect(result.discoveryDone).toBe(true);

    const header = kvsStore.get(`job:${ACCOUNT}:${result.jobId}`);
    expect(header).toBeTruthy();
    expect(header.jobKind).toBe('label-import');
    expect(header.removeLabels).toBe(true);
    expect(header.totalChunks).toBeGreaterThan(0);
    expect(header.status).toBe('active');
    const index = kvsStore.get(`user-jobs:${ACCOUNT}`);
    expect(index.activeJobId).toBe(result.jobId);
    expect(index.queuedJobIds).toEqual([]);
  });
});

describe('startLabelExportResolver', () => {
  it('rejects invalid labelName', async () => {
    const result = await startLabelExportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labelName: 'foo bar' }],
      },
    });
    expect(result.success).toBe(false);
  });

  it('seeds an export job on a small classified set', async () => {
    // classified=3, alreadyLabelled=0 → gap=3; then first-discovery yields 3.
    const ids = Array.from({ length: 3 }, (_, i) => ({
      id: String(2000 + i),
      title: `p${i}`,
    }));
    queueCql([
      { results: [], totalSize: 3 },
      { results: [], totalSize: 0 },
      { results: ids, totalSize: 3 },
    ]);

    const result = await startLabelExportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labelName: 'public' }],
      },
    });
    expect(result.success).toBe(true);
    expect(result.jobId).toMatch(/^label-export-/);
    expect(result.promoted).toBe(true);
    expect(result.totalEstimate).toBe(3);

    const header = kvsStore.get(`job:${ACCOUNT}:${result.jobId}`);
    expect(header.jobKind).toBe('label-export');
  });
});

describe('processLabelBatchResolver', () => {
  it('returns {done:true, missing:true} for an unknown jobId', async () => {
    const result = await processLabelBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: 'nope' },
    });
    expect(result.done).toBe(true);
    expect(result.missing).toBe(true);
  });

  it('runs one batch of export work and marks done when chunk chain is drained', async () => {
    const ids = Array.from({ length: 3 }, (_, i) => ({
      id: String(3000 + i),
      title: `p${i}`,
    }));
    // estimate (classified=3, alreadyLabelled=0) + first discovery (3 ids)
    queueCql([
      { results: [], totalSize: 3 },
      { results: [], totalSize: 0 },
      { results: ids, totalSize: 3 },
    ]);

    const start = await startLabelExportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labelName: 'public' }],
      },
    });
    // Drain — keep invoking until done.
    let lastBatch;
    for (let i = 0; i < 10; i++) {
      lastBatch = await processLabelBatchResolver({
        context: { accountId: ACCOUNT },
        payload: { jobId: start.jobId },
      });
      if (lastBatch.done) break;
    }
    expect(lastBatch.done).toBe(true);
    expect(lastBatch.classified).toBe(3);
    expect(mockAddLabelToPage).toHaveBeenCalledTimes(3);
    // Job cleared on completion.
    expect(kvsStore.get(`job:${ACCOUNT}:${start.jobId}`)).toBeUndefined();
  });

  it('aborts import job when the target level has been deleted mid-flight', async () => {
    const ids = [{ id: '4000', title: 'p' }];
    queueCql([
      { results: [], totalSize: 1 },
      { results: [], totalSize: 0 },
      { results: ids, totalSize: 1 },
    ]);
    const start = await startLabelImportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labels: ['foo'] }],
      },
    });
    // Simulate config change: public level removed from the effective config.
    effectiveConfig.levels = effectiveConfig.levels.filter(
      (l) => l.id !== 'public',
    );

    const batch = await processLabelBatchResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: start.jobId },
    });
    expect(batch.done).toBe(true);
    expect(batch.aborted).toBe('level_deleted');

    // Restore for other tests.
    effectiveConfig.levels = [
      { id: 'public', allowed: true },
      { id: 'internal', allowed: true },
      { id: 'confidential', allowed: true },
    ];
  });
});

describe('cancelLabelJobResolver', () => {
  it('deletes job state and returns last counters', async () => {
    const ids = [{ id: '5000', title: 'p' }];
    queueCql([
      { results: [], totalSize: 1 },
      { results: [], totalSize: 0 },
      { results: ids, totalSize: 1 },
    ]);
    const start = await startLabelExportResolver({
      context: { accountId: ACCOUNT },
      payload: {
        mappings: [{ levelId: 'public', labelName: 'public' }],
      },
    });
    const result = await cancelLabelJobResolver({
      context: { accountId: ACCOUNT },
      payload: { jobId: start.jobId },
    });
    expect(result.cancelled).toBe(true);
    expect(result.jobKind).toBe('label-export');
    expect(kvsStore.get(`job:${ACCOUNT}:${start.jobId}`)).toBeUndefined();
  });
});
