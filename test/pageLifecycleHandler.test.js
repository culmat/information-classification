import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockDeleteAuditForPage = vi.fn();

vi.mock('../src/storage/auditStore', () => ({
  deleteAuditForPage: (...args) => mockDeleteAuditForPage(...args),
}));

const { handler } = await import('../src/pageLifecycleHandler');

beforeEach(() => {
  vi.clearAllMocks();
});

describe('pageLifecycleHandler', () => {
  it('should delete audit entries when page is permanently deleted', async () => {
    mockDeleteAuditForPage.mockResolvedValue(3);

    await handler({
      eventType: 'avi:confluence:deleted:page',
      content: { id: '12345' },
    });

    expect(mockDeleteAuditForPage).toHaveBeenCalledWith('12345');
  });

  it('should not delete audit entries when page is trashed', async () => {
    await handler({
      eventType: 'avi:confluence:trashed:page',
      content: { id: '12345' },
    });

    expect(mockDeleteAuditForPage).not.toHaveBeenCalled();
  });

  it('should handle missing page ID gracefully', async () => {
    await handler({
      eventType: 'avi:confluence:deleted:page',
      content: {},
    });

    expect(mockDeleteAuditForPage).not.toHaveBeenCalled();
  });

  it('should handle missing content gracefully', async () => {
    await handler({
      eventType: 'avi:confluence:deleted:page',
    });

    expect(mockDeleteAuditForPage).not.toHaveBeenCalled();
  });
});
