import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRequestConfluence = vi.fn();

vi.mock('@forge/api', () => ({
  default: {
    asApp: () => ({ requestConfluence: mockRequestConfluence }),
    asUser: () => ({ requestConfluence: mockRequestConfluence }),
  },
  route: (strings, ...values) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] || ''), ''),
}));

const { getClassification, setClassification, getHistory, appendHistory } =
  await import('../../src/services/contentPropertyService');

// Helper to build a mock response
function mockResponse(ok, body, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('getClassification', () => {
  it('returns classification object when property exists', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, {
        results: [
          {
            id: 'prop-1',
            value: { level: 'internal', classifiedBy: 'user-1' },
            version: { number: 3 },
          },
        ],
      }),
    );

    const result = await getClassification('123');
    expect(result).toEqual({ level: 'internal', classifiedBy: 'user-1' });
  });

  it('returns null for unclassified page (empty results)', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, { results: [] }),
    );

    const result = await getClassification('123');
    expect(result).toBeNull();
  });

  it('returns null on 404 response', async () => {
    mockRequestConfluence.mockResolvedValue(mockResponse(false, {}, 404));

    const result = await getClassification('123');
    expect(result).toBeNull();
  });

  it('returns null on API error', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(false, 'Server error', 500),
    );

    const result = await getClassification('123');
    expect(result).toBeNull();
  });

  it('returns null when results have no value field', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, { results: [{ id: 'prop-1' }] }),
    );

    const result = await getClassification('123');
    expect(result).toBeNull();
  });

  it('returns null on network exception', async () => {
    mockRequestConfluence.mockRejectedValue(new Error('Network error'));

    const result = await getClassification('123');
    expect(result).toBeNull();
  });

  it('uses asApp requester when option is set', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, { results: [] }),
    );

    await getClassification('123', { asApp: true });
    expect(mockRequestConfluence).toHaveBeenCalledOnce();
  });
});

describe('getHistory', () => {
  it('returns history entries when property exists', async () => {
    const entries = [
      { from: null, to: 'public', by: 'user-1', at: 1000 },
      { from: 'public', to: 'internal', by: 'user-2', at: 2000 },
    ];
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, {
        results: [{ id: 'prop-1', value: { truncated: false, entries } }],
      }),
    );

    const result = await getHistory('123');
    expect(result.entries).toEqual(entries);
    expect(result.truncated).toBe(false);
  });

  it('returns empty entries for page with no history', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, { results: [] }),
    );

    const result = await getHistory('123');
    expect(result.entries).toEqual([]);
    expect(result.truncated).toBe(false);
  });

  it('preserves truncated flag from stored data', async () => {
    mockRequestConfluence.mockResolvedValue(
      mockResponse(true, {
        results: [
          { id: 'prop-1', value: { truncated: true, entries: [{ to: 'x' }] } },
        ],
      }),
    );

    const result = await getHistory('123');
    expect(result.truncated).toBe(true);
    expect(result.entries).toHaveLength(1);
  });
});

describe('setClassification', () => {
  it('creates both properties when neither exists', async () => {
    // Two list calls (one per property) return empty, then two creates succeed
    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // list classification
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // list byline
      .mockResolvedValueOnce(mockResponse(true, {})) // create classification
      .mockResolvedValueOnce(mockResponse(true, {})); // create byline

    const result = await setClassification(
      '123',
      { level: 'public', classifiedBy: 'user-1' },
      { title: 'Public' },
    );

    expect(result).toBe(true);
    // 4 API calls: 2 list + 2 create
    expect(mockRequestConfluence).toHaveBeenCalledTimes(4);
  });

  it('updates both properties when they exist (with version increment)', async () => {
    const existingProp = (id, version) => ({
      results: [{ id, version: { number: version } }],
    });

    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(true, existingProp('p1', 5))) // list classification
      .mockResolvedValueOnce(mockResponse(true, existingProp('p2', 3))) // list byline
      .mockResolvedValueOnce(mockResponse(true, {})) // update classification
      .mockResolvedValueOnce(mockResponse(true, {})); // update byline

    const result = await setClassification(
      '123',
      { level: 'internal' },
      { title: 'Internal' },
    );

    expect(result).toBe(true);

    // Verify PUT calls include incremented version numbers
    const putCalls = mockRequestConfluence.mock.calls.filter(
      (call) => call[1]?.method === 'PUT',
    );
    expect(putCalls).toHaveLength(2);

    const classBody = JSON.parse(putCalls[0][1].body);
    expect(classBody.version.number).toBe(6); // 5 + 1

    const bylineBody = JSON.parse(putCalls[1][1].body);
    expect(bylineBody.version.number).toBe(4); // 3 + 1
  });

  it('returns false when classification property write fails', async () => {
    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // list classification
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // list byline
      .mockResolvedValueOnce(mockResponse(false, 'Conflict', 409)) // create classification fails
      .mockResolvedValueOnce(mockResponse(true, {})); // create byline succeeds

    const result = await setClassification(
      '123',
      { level: 'public' },
      { title: 'Public' },
    );

    expect(result).toBe(false);
  });

  it('returns false when list call fails', async () => {
    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(false, 'Error', 500)) // list classification fails
      .mockResolvedValueOnce(mockResponse(true, { results: [] })); // list byline

    const result = await setClassification(
      '123',
      { level: 'public' },
      { title: 'Public' },
    );

    expect(result).toBe(false);
  });

  it('defaults to version 1 when existing property has no version', async () => {
    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(true, { results: [{ id: 'p1' }] })) // list (no version field)
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // list byline
      .mockResolvedValueOnce(mockResponse(true, {})) // update classification
      .mockResolvedValueOnce(mockResponse(true, {})); // create byline

    await setClassification('123', { level: 'public' }, { title: 'Public' });

    const putCall = mockRequestConfluence.mock.calls.find(
      (call) => call[1]?.method === 'PUT',
    );
    const body = JSON.parse(putCall[1].body);
    expect(body.version.number).toBe(2); // default 1 + 1
  });
});

describe('appendHistory', () => {
  it('appends entry to existing history', async () => {
    const existingEntries = [{ from: null, to: 'public', by: 'u1', at: 1000 }];

    // getHistory reads property, then upsertProperty reads+writes
    mockRequestConfluence
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [
            {
              id: 'h1',
              value: { truncated: false, entries: existingEntries },
              version: { number: 1 },
            },
          ],
        }),
      ) // getHistory
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [
            {
              id: 'h1',
              value: { truncated: false, entries: existingEntries },
              version: { number: 1 },
            },
          ],
        }),
      ) // upsert list
      .mockResolvedValueOnce(mockResponse(true, {})); // upsert update

    const newEntry = { from: 'public', to: 'internal', by: 'u2', at: 2000 };
    const result = await appendHistory('123', newEntry);

    expect(result).toBe(true);

    // Verify the PUT body contains both entries
    const putCall = mockRequestConfluence.mock.calls.find(
      (call) => call[1]?.method === 'PUT',
    );
    const body = JSON.parse(putCall[1].body);
    expect(body.value.entries).toHaveLength(2);
    expect(body.value.entries[1]).toEqual(newEntry);
    expect(body.value.truncated).toBe(false);
  });

  it('creates history property when none exists', async () => {
    mockRequestConfluence
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // getHistory
      .mockResolvedValueOnce(mockResponse(true, { results: [] })) // upsert list
      .mockResolvedValueOnce(mockResponse(true, {})); // upsert create

    const entry = { from: null, to: 'public', by: 'u1', at: 1000 };
    const result = await appendHistory('123', entry);

    expect(result).toBe(true);

    const postCall = mockRequestConfluence.mock.calls.find(
      (call) => call[1]?.method === 'POST',
    );
    const body = JSON.parse(postCall[1].body);
    expect(body.value.entries).toEqual([entry]);
    expect(body.value.truncated).toBe(false);
  });

  it('evicts oldest entries when exceeding MAX_HISTORY_ENTRIES', async () => {
    // Create 300 existing entries (at the limit)
    const existingEntries = Array.from({ length: 300 }, (_, i) => ({
      from: 'a',
      to: 'b',
      by: 'u1',
      at: i,
    }));

    mockRequestConfluence
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [
            {
              id: 'h1',
              value: { truncated: false, entries: existingEntries },
              version: { number: 1 },
            },
          ],
        }),
      ) // getHistory
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [
            {
              id: 'h1',
              value: {},
              version: { number: 1 },
            },
          ],
        }),
      ) // upsert list
      .mockResolvedValueOnce(mockResponse(true, {})); // upsert update

    const newEntry = { from: 'b', to: 'c', by: 'u2', at: 999 };
    const result = await appendHistory('123', newEntry);

    expect(result).toBe(true);

    const putCall = mockRequestConfluence.mock.calls.find(
      (call) => call[1]?.method === 'PUT',
    );
    const body = JSON.parse(putCall[1].body);
    // Should be exactly 300 (evicted oldest, added new)
    expect(body.value.entries).toHaveLength(300);
    expect(body.value.truncated).toBe(true);
    // The newest entry should be last
    expect(body.value.entries[299]).toEqual(newEntry);
    // The oldest entry (at: 0) should be evicted, entry at: 1 is now first
    expect(body.value.entries[0].at).toBe(1);
  });

  it('preserves existing entries when under the limit', async () => {
    const existingEntries = [
      { from: null, to: 'public', by: 'u1', at: 1000 },
      { from: 'public', to: 'internal', by: 'u2', at: 2000 },
    ];

    mockRequestConfluence
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [
            {
              id: 'h1',
              value: { truncated: false, entries: existingEntries },
              version: { number: 1 },
            },
          ],
        }),
      ) // getHistory
      .mockResolvedValueOnce(
        mockResponse(true, {
          results: [{ id: 'h1', version: { number: 1 } }],
        }),
      ) // upsert list
      .mockResolvedValueOnce(mockResponse(true, {})); // upsert update

    const newEntry = {
      from: 'internal',
      to: 'confidential',
      by: 'u3',
      at: 3000,
    };
    await appendHistory('123', newEntry);

    const putCall = mockRequestConfluence.mock.calls.find(
      (call) => call[1]?.method === 'PUT',
    );
    const body = JSON.parse(putCall[1].body);
    expect(body.value.entries).toHaveLength(3);
    expect(body.value.truncated).toBe(false);
  });
});
