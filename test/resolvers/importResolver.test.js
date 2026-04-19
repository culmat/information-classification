import { describe, it, expect, vi, beforeEach } from 'vitest';

// Admin-check bypassed so we only cover the business logic here.
vi.mock('../../src/utils/adminAuth', () => ({
  isConfluenceAdmin: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../src/services/labelService', () => ({
  countPagesByLabels: vi.fn(),
  getAllLabels: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../src/storage/configStore', () => ({
  getGlobalConfig: vi.fn().mockResolvedValue({ levels: [] }),
}));

vi.mock('../../src/utils/jobQueue', () => ({
  enqueueJob: vi.fn().mockResolvedValue({ jobId: 'job-abc' }),
}));

// `api.asUser().requestConfluence(...)` is called by the shared `cqlCount`
// helper inside importResolver for every count query. We capture the URLs
// so the CQL-correctness assertions can read them back.
const mockRequestConfluence = vi.fn();
vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestConfluence: mockRequestConfluence }) },
  route: (strings, ...values) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), ''),
}));

const { countLabelPagesResolver, countLevelGapResolver } =
  await import('../../src/resolvers/importResolver');
const { countPagesByLabels } = await import('../../src/services/labelService');

function mockSearchResponses(totals) {
  // Each call returns a fake Response with the next totalSize in the list.
  let i = 0;
  mockRequestConfluence.mockImplementation(async () => ({
    ok: true,
    json: async () => ({ totalSize: totals[i++] ?? 0 }),
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('countLabelPagesResolver', () => {
  it('returns labelled/alreadyClassified/toClassify with CQL strings', async () => {
    countPagesByLabels.mockResolvedValueOnce({ totalSize: 100 });
    // One extra CQL query for "alreadyClassified".
    mockSearchResponses([80]);

    const result = await countLabelPagesResolver({
      context: { accountId: 'admin' },
      payload: {
        labels: ['pii', 'confidential-data'],
        levelId: 'confidential',
        spaceKey: 'IC',
      },
    });

    expect(result.success).toBe(true);
    expect(result.labelled).toBe(100);
    expect(result.alreadyClassified).toBe(80);
    expect(result.toClassify).toBe(20); // max(0, 100 - 80)

    // CQL shape + scoping.
    expect(result.cql.labelled).toContain('label = "pii"');
    expect(result.cql.labelled).toContain('label = "confidential-data"');
    expect(result.cql.labelled).toMatch(/space="IC"/);
    expect(result.cql.alreadyClassified).toContain(
      'culmat_classification_level = "confidential"',
    );
    expect(result.cql.toClassify).toContain(
      'culmat_classification_level != "confidential"',
    );
  });

  it('clamps toClassify at 0 when alreadyClassified > labelled (index lag)', async () => {
    countPagesByLabels.mockResolvedValueOnce({ totalSize: 5 });
    mockSearchResponses([7]); // weird but possible during CQL index drift

    const result = await countLabelPagesResolver({
      context: { accountId: 'admin' },
      payload: { labels: ['x'], levelId: 'public' },
    });

    expect(result.toClassify).toBe(0);
  });

  it('returns labelled-only when levelId is omitted (back-compat)', async () => {
    countPagesByLabels.mockResolvedValueOnce({ totalSize: 42 });

    const result = await countLabelPagesResolver({
      context: { accountId: 'admin' },
      payload: { labels: ['foo'] },
    });

    expect(result.labelled).toBe(42);
    expect(result.toClassify).toBe(42);
    expect(result.cql.alreadyClassified).toBe('');
    expect(result.cql.toClassify).toBe('');
    // No additional CQL call made beyond the labelService one.
    expect(mockRequestConfluence).not.toHaveBeenCalled();
  });

  it('returns zero-record when labels is empty', async () => {
    const result = await countLabelPagesResolver({
      context: { accountId: 'admin' },
      payload: { labels: [] },
    });
    expect(result.labelled).toBe(0);
    expect(result.toClassify).toBe(0);
  });
});

describe('countLevelGapResolver', () => {
  it('returns classified/alreadyLabelled/toLabel with CQL strings', async () => {
    // Two CQL counts: classified, alreadyLabelled.
    mockSearchResponses([200, 150]);

    const result = await countLevelGapResolver({
      context: { accountId: 'admin' },
      payload: {
        levelId: 'confidential',
        labelName: 'confidential',
        spaceKey: 'IC',
      },
    });

    expect(result.success).toBe(true);
    expect(result.classified).toBe(200);
    expect(result.alreadyLabelled).toBe(150);
    expect(result.toLabel).toBe(50);
    expect(result.cql.classified).toContain(
      'culmat_classification_level = "confidential"',
    );
    expect(result.cql.classified).toMatch(/space="IC"/);
    expect(result.cql.alreadyLabelled).toContain('label = "confidential"');
    expect(result.cql.toLabel).toContain('label != "confidential"');
  });

  it('treats blank/missing labelName as opt-out: classified shown, toLabel=0', async () => {
    mockSearchResponses([200]);

    const result = await countLevelGapResolver({
      context: { accountId: 'admin' },
      payload: { levelId: 'public' },
    });

    expect(result.classified).toBe(200);
    // Blank label = "don't export this level" → no work for this row.
    expect(result.toLabel).toBe(0);
    expect(result.alreadyLabelled).toBe(0);
    expect(result.cql.alreadyLabelled).toBe('');
    expect(result.cql.toLabel).toBe('');
    // Only the classified CQL is queried — the invalid value never flows
    // into a CQL string.
    expect(mockRequestConfluence).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['leading whitespace', '  s'],
    ['space inside label', 'foo bar'],
    ['quote attempting CQL injection', 'bad"name'],
  ])(
    'treats invalid labelName (%s) as opt-out: classified shown, toLabel=0',
    async (_desc, labelName) => {
      mockSearchResponses([200]);

      const result = await countLevelGapResolver({
        context: { accountId: 'admin' },
        payload: { levelId: 'public', labelName },
      });

      expect(result.success).toBe(true);
      expect(result.classified).toBe(200);
      expect(result.toLabel).toBe(0);
      expect(result.alreadyLabelled).toBe(0);
      expect(result.cql.alreadyLabelled).toBe('');
      expect(result.cql.toLabel).toBe('');
      // Invalid label never gets interpolated into a CQL query.
      expect(mockRequestConfluence).toHaveBeenCalledTimes(1);
      const [url] = mockRequestConfluence.mock.calls[0];
      expect(url).not.toContain(labelName);
    },
  );

  it('rejects missing levelId', async () => {
    const result = await countLevelGapResolver({
      context: { accountId: 'admin' },
      payload: {},
    });
    expect(result.success).toBe(false);
  });
});
