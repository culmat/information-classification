import { describe, it, expect } from 'vitest';
import {
  successResponse,
  errorResponse,
  validationError,
} from '../../src/utils/responseHelper';

describe('successResponse', () => {
  it('should return success: true with no extra data', () => {
    expect(successResponse()).toEqual({ success: true });
  });

  it('should merge additional data', () => {
    const result = successResponse({ foo: 'bar', count: 42 });
    expect(result).toEqual({ success: true, foo: 'bar', count: 42 });
  });
});

describe('errorResponse', () => {
  it('should return success: false with error message', () => {
    const result = errorResponse('Something broke');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Something broke');
    expect(result.status).toBe(400);
  });

  it('should accept custom status code', () => {
    const result = errorResponse('Not found', 404);
    expect(result.status).toBe(404);
  });
});

describe('validationError', () => {
  it('should return a 400 error', () => {
    const result = validationError('Invalid input');
    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid input');
    expect(result.status).toBe(400);
  });
});
