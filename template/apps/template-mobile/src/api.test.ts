import { describe, expect, it } from 'vitest';
import { api } from './api';

describe('the API hooks', () => {
  it('give typed queries and mutations on the template’s client', () => {
    expect(typeof api.useQuery).toBe('function');
    expect(typeof api.useMutation).toBe('function');
  });
});
