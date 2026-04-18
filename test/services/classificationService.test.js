import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all dependencies
const mockGetEffectiveConfig = vi.fn();
const mockGetSpaceConfig = vi.fn();
const mockGetClassification = vi.fn();
const mockSetClassification = vi.fn();
const mockAppendHistory = vi.fn();
const mockHasViewRestrictions = vi.fn();

vi.mock('../../src/storage/configStore', () => ({
  getEffectiveConfig: (...args) => mockGetEffectiveConfig(...args),
}));

vi.mock('../../src/storage/spaceConfigStore', () => ({
  getSpaceConfig: (...args) => mockGetSpaceConfig(...args),
}));

vi.mock('../../src/services/contentPropertyService', () => ({
  getClassification: (...args) => mockGetClassification(...args),
  setClassification: (...args) => mockSetClassification(...args),
  appendHistory: (...args) => mockAppendHistory(...args),
}));

vi.mock('../../src/services/restrictionService', () => ({
  hasViewRestrictions: (...args) => mockHasViewRestrictions(...args),
}));

// Mock @forge/api for the recursive child page fetching
const mockRequestConfluence = vi.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({ results: [], totalSize: 0, _links: {} }),
});
vi.mock('@forge/api', () => ({
  default: {
    asApp: () => ({ requestConfluence: mockRequestConfluence }),
    asUser: () => ({ requestConfluence: mockRequestConfluence }),
  },
  route: (strings, ...values) =>
    strings.reduce((acc, str, i) => acc + str + (values[i] || ''), ''),
}));

vi.mock('@forge/realtime', () => ({
  publishGlobal: vi.fn().mockResolvedValue(undefined),
}));

const {
  getPageClassification,
  classifyPage,
  classifySinglePage,
  findDescendants,
} = await import('../../src/services/classificationService');

const effectiveConfig = {
  levels: [
    {
      id: 'public',
      name: { en: 'Public' },
      color: 'green',
      description: { en: 'Public info.' },
      allowed: true,
      requiresProtection: false,
      sortOrder: 0,
      errorMessage: null,
    },
    {
      id: 'internal',
      name: { en: 'Internal' },
      color: 'yellow',
      description: { en: 'Internal info.' },
      allowed: true,
      requiresProtection: false,
      sortOrder: 1,
      errorMessage: null,
    },
    {
      id: 'confidential',
      name: { en: 'Confidential' },
      color: 'orange',
      description: { en: 'Confidential info.' },
      allowed: true,
      requiresProtection: true,
      sortOrder: 2,
      errorMessage: null,
    },
    {
      id: 'secret',
      name: { en: 'Secret', de: 'Geheim' },
      color: 'red',
      description: { en: 'Secret info.' },
      allowed: false,
      requiresProtection: false,
      sortOrder: 3,
      errorMessage: { en: 'Secret not allowed.', de: 'Geheim nicht erlaubt.' },
    },
  ],
  defaultLevelId: 'internal',
  contacts: [],
  links: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSpaceConfig.mockResolvedValue(null);
  mockGetEffectiveConfig.mockResolvedValue(effectiveConfig);
  mockSetClassification.mockResolvedValue(true);
  mockAppendHistory.mockResolvedValue(undefined);
});

describe('getPageClassification', () => {
  it('should return classification and config', async () => {
    mockGetClassification.mockResolvedValue({ level: 'internal' });

    const result = await getPageClassification('123', 'DEV');
    expect(result.classification).toEqual({ level: 'internal' });
    expect(result.config).toEqual(effectiveConfig);
  });

  it('should return null classification for unclassified pages', async () => {
    mockGetClassification.mockResolvedValue(null);

    const result = await getPageClassification('123', 'DEV');
    expect(result.classification).toBeNull();
    expect(result.config).toBeTruthy();
  });
});

describe('classifyPage', () => {
  it('should classify a page with an allowed level', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(false);

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.classification.level).toBe('public');
    expect(mockSetClassification).toHaveBeenCalledOnce();
    expect(mockAppendHistory).toHaveBeenCalledOnce();
  });

  it('should reject a disallowed level with configured error message', async () => {
    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'secret',
      accountId: 'user-1',
      locale: 'en',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('level_disallowed');
    expect(result.message).toBe('Secret not allowed.');
    expect(mockSetClassification).not.toHaveBeenCalled();
  });

  it('should return localized error message for disallowed level', async () => {
    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'secret',
      accountId: 'user-1',
      locale: 'de',
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe('Geheim nicht erlaubt.');
  });

  it('should reject unknown level', async () => {
    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'nonexistent',
      accountId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('invalid_level');
  });

  it('should return restriction warning when level requires protection and page is unprotected', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(false);

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.restrictionWarning).toBe('requires_protection');
  });

  it('should not warn when level requires protection and page IS protected', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(true);

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.restrictionWarning).toBeNull();
  });

  it('should not warn for levels that do not require protection', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(false);

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-1',
    });

    expect(result.success).toBe(true);
    expect(result.restrictionWarning).toBeNull();
  });

  it('should log the previous level in the audit trail', async () => {
    mockGetClassification.mockResolvedValue({ level: 'internal' });
    mockHasViewRestrictions.mockResolvedValue(false);

    await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
    });

    expect(mockAppendHistory).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        from: 'internal',
        to: 'confidential',
      }),
    );
  });

  it('should log null previous level for first classification', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(false);

    await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-1',
    });

    expect(mockAppendHistory).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({
        from: null,
        to: 'public',
      }),
    );
  });

  it('should return unchanged when level is same and not recursive', async () => {
    mockGetClassification.mockResolvedValue({ level: 'internal' });

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'internal',
      accountId: 'user-1',
      recursive: false,
    });

    expect(result.success).toBe(true);
    expect(result.unchanged).toBe(true);
    expect(mockSetClassification).not.toHaveBeenCalled();
  });

  it('should return error when write fails', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockSetClassification.mockResolvedValue(false);

    const result = await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('write_failed');
  });

  it('should log history when classifying recursively', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockHasViewRestrictions.mockResolvedValue(false);

    await classifyPage({
      pageId: '123',
      spaceKey: 'DEV',
      levelId: 'public',
      accountId: 'user-1',
      recursive: true,
    });

    expect(mockAppendHistory).toHaveBeenCalledWith(
      '123',
      expect.objectContaining({ from: null, to: 'public' }),
    );
  });
});

describe('classifySinglePage', () => {
  // Covers the recurring "last page not classified" bug: the async consumer
  // now pre-fetches descendants with plain CQL (no `!=` alias) and relies on
  // classifySinglePage to skip pages already at the target. The contract is:
  //   true  -> classified (count as changed)
  //   null  -> already at target (skipped — don't count)
  //   false -> write failed
  const level = {
    id: 'confidential',
    name: { en: 'Confidential' },
  };

  it('returns true when previousLevel differs and write succeeds', async () => {
    mockGetClassification.mockResolvedValue({ level: 'internal' });
    mockSetClassification.mockResolvedValue(true);

    const result = await classifySinglePage({
      childPageId: '999',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
      locale: 'en',
      level,
    });

    expect(result).toBe(true);
    expect(mockSetClassification).toHaveBeenCalledOnce();
    expect(mockAppendHistory).toHaveBeenCalledWith(
      '999',
      expect.objectContaining({ from: 'internal', to: 'confidential' }),
      expect.any(Object),
    );
  });

  it('returns null (skip) when page is already at target level', async () => {
    mockGetClassification.mockResolvedValue({ level: 'confidential' });

    const result = await classifySinglePage({
      childPageId: '999',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
      locale: 'en',
      level,
    });

    expect(result).toBeNull();
    expect(mockSetClassification).not.toHaveBeenCalled();
    expect(mockAppendHistory).not.toHaveBeenCalled();
  });

  it('returns true when page had no classification yet', async () => {
    mockGetClassification.mockResolvedValue(null);
    mockSetClassification.mockResolvedValue(true);

    const result = await classifySinglePage({
      childPageId: '999',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
      locale: 'en',
      level,
    });

    expect(result).toBe(true);
  });

  it('returns false when write fails', async () => {
    mockGetClassification.mockResolvedValue({ level: 'internal' });
    mockSetClassification.mockResolvedValue(false);

    const result = await classifySinglePage({
      childPageId: '999',
      spaceKey: 'DEV',
      levelId: 'confidential',
      accountId: 'user-1',
      locale: 'en',
      level,
    });

    expect(result).toBe(false);
    expect(mockAppendHistory).not.toHaveBeenCalled();
  });
});

describe('findDescendants', () => {
  // Regression guard: the query MUST be plain `ancestor=X AND type=page` —
  // no content-property alias (`culmat_classification_level`) because the
  // `!=` alias is unreliable under index lag, and no v2 endpoint (we tried
  // /pages/{id}/descendants and hit scope + depth + 400 issues).
  it('uses CQL `ancestor=X AND type=page` (no content-property alias)', async () => {
    mockRequestConfluence.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [], totalSize: 0 }),
    });

    await findDescendants('557281', 200, 0, { asApp: true });

    expect(mockRequestConfluence).toHaveBeenCalledOnce();
    const url = mockRequestConfluence.mock.calls[0][0];
    expect(url).toContain('/wiki/rest/api/search');
    expect(url).toContain('ancestor=557281');
    expect(url).toContain('type=page');
    expect(url).not.toContain('culmat_classification_level');
    expect(url).not.toContain('!=');
  });

  it('passes limit and start through to the search API', async () => {
    mockRequestConfluence.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ results: [], totalSize: 0 }),
    });

    await findDescendants('557281', 50, 100);

    const url = mockRequestConfluence.mock.calls[0][0];
    expect(url).toContain('limit=50');
    expect(url).toContain('start=100');
  });
});
