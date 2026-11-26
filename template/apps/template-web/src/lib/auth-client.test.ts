import { describe, expect, it, vi } from 'vitest';
import { getAuthClient } from './auth-client.ts';

const auth = vi.hoisted(() => ({
  createAuthClient: vi.fn((options: { readonly onTwoFactorRedirect: () => void }) => ({ options })),
}));
const navigate = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock('@zigordev/auth/client', () => auth);
vi.mock('./navigate.ts', () => navigate);

describe('the auth client', () => {
  it('is made once, and sends a person with a second step to the two-factor page', () => {
    const client = getAuthClient();

    expect(getAuthClient()).toBe(client);
    expect(auth.createAuthClient).toHaveBeenCalledOnce();
    auth.createAuthClient.mock.lastCall?.[0].onTwoFactorRedirect();
    expect(navigate.go).toHaveBeenCalledWith('/two-factor');
  });
});
