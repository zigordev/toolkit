import { afterEach, describe, expect, it, vi } from 'vitest';
import { signedInUser } from './auth.ts';

const auth = vi.hoisted(() => ({ getUser: vi.fn() }));
const log = vi.hoisted(() => ({ warn: vi.fn() }));

vi.mock('@zigordev/auth/next', () => ({ createNextAuth: () => ({ getUser: auth.getUser }) }));
vi.mock('./config.ts', () => ({ getConfig: () => ({ API_URL: 'http://template-api:3000' }) }));
vi.mock('./logger.ts', () => ({ getLogger: () => log }));

afterEach(() => {
  auth.getUser.mockReset();
  log.warn.mockClear();
});

describe('the person signed in', () => {
  it('is the user of the session, or nobody', async () => {
    auth.getUser.mockResolvedValueOnce({ name: 'Ada Lovelace', email: 'ada@example.com' });
    await expect(signedInUser()).resolves.toEqual({
      name: 'Ada Lovelace',
      email: 'ada@example.com',
    });

    auth.getUser.mockResolvedValueOnce(null);
    await expect(signedInUser()).resolves.toBeNull();
    expect(log.warn).not.toHaveBeenCalled();
  });

  it('is nobody while the API cannot say, and the log says why', async () => {
    const failure = new Error('connect ECONNREFUSED');
    auth.getUser.mockRejectedValueOnce(failure);

    await expect(signedInUser()).resolves.toBeNull();

    expect(log.warn).toHaveBeenCalledWith({ event: 'api.unreachable', error: failure });
  });
});
