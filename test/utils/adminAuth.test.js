import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockRequestConfluence = vi.fn();

vi.mock('@forge/api', () => ({
  default: { asUser: () => ({ requestConfluence: mockRequestConfluence }) },
  route: (strings, ...values) =>
    strings.reduce((acc, s, i) => acc + s + (values[i] ?? ''), ''),
}));

const { isConfluenceAdmin } = await import('../../src/utils/adminAuth');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('isConfluenceAdmin', () => {
  it('returns true when the admin probe succeeds (200)', async () => {
    mockRequestConfluence.mockResolvedValueOnce({ ok: true, status: 200 });
    expect(await isConfluenceAdmin('acc-123')).toBe(true);
  });

  it('returns false when the admin probe returns 403', async () => {
    mockRequestConfluence.mockResolvedValueOnce({ ok: false, status: 403 });
    expect(await isConfluenceAdmin('acc-123')).toBe(false);
  });

  it('returns false on other non-ok responses', async () => {
    mockRequestConfluence.mockResolvedValueOnce({ ok: false, status: 500 });
    expect(await isConfluenceAdmin('acc-123')).toBe(false);
  });

  it('returns false when the probe throws', async () => {
    mockRequestConfluence.mockRejectedValueOnce(new Error('network'));
    expect(await isConfluenceAdmin('acc-123')).toBe(false);
  });

  it('returns false when accountId is missing, without probing', async () => {
    expect(await isConfluenceAdmin(null)).toBe(false);
    expect(mockRequestConfluence).not.toHaveBeenCalled();
  });
});
