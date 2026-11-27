import { describe, expect, it, vi } from 'vitest';
import { createApi } from './api';

describe('createApi', () => {
  it('gives the template’s typed client with its query hooks', () => {
    const api = createApi();

    expect(typeof api.client.GET).toBe('function');
    expect(typeof api.useQuery).toBe('function');
    expect(typeof api.useMutation).toBe('function');
  });

  it('sends every request through the fetch it is given', async () => {
    const fetcher = vi.fn(async () => Response.json({ message: 'Hello' }));

    const { data } = await createApi(fetcher).client.GET('/api/v1/hello');

    expect(data).toEqual({ message: 'Hello' });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
