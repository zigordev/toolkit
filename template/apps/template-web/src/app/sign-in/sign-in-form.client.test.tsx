import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { SignInForm } from './sign-in-form.client.tsx';

const auth = vi.hoisted(() => ({
  signIn: { email: vi.fn(), social: vi.fn(), passkey: vi.fn() },
}));
const navigate = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock('../../lib/auth-client.ts', () => ({ getAuthClient: () => auth }));
vi.mock('../../lib/navigate.ts', () => navigate);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');

async function signIn(email: string, password: string): Promise<void> {
  await userEvent.fill(page.getByRole('textbox', { name: t('signIn.email') }), email);
  await userEvent.fill(page.getByLabelText(t('signIn.password')), password);
  await userEvent.click(page.getByRole('button', { name: t('signIn.submit') }));
}

describe('the sign-in form', () => {
  it('asks for the email and the password before it sends anything', async () => {
    await render(<SignInForm next="/notes" />);

    await userEvent.click(page.getByRole('button', { name: t('signIn.submit') }));

    await expect.element(page.getByText(t('fields.required')).first()).toBeVisible();
    expect(auth.signIn.email).not.toHaveBeenCalled();
  });

  it('signs in with the password and goes on to the next page', async () => {
    auth.signIn.email.mockResolvedValue({ data: {}, error: null });
    await render(<SignInForm next="/notes" />);

    await signIn('ada@example.com', 'secret');

    await vi.waitFor(() => expect(navigate.go).toHaveBeenCalledWith('/notes'));
    expect(auth.signIn.email).toHaveBeenCalledWith({
      email: 'ada@example.com',
      password: 'secret',
    });
  });

  it('says that the email or the password is wrong', async () => {
    auth.signIn.email.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD' },
    });
    await render(<SignInForm next="/notes" />);

    await signIn('ada@example.com', 'wrong');

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('problems.wrongCredentials'));
    expect(navigate.go).not.toHaveBeenCalled();
  });

  it('starts Google, and says so when it is not available', async () => {
    auth.signIn.social.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: {} });
    await render(<SignInForm next="/notes" />);
    const google = page.getByRole('button', { name: t('signIn.google') });

    await userEvent.click(google);
    expect(auth.signIn.social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/notes' });
    await userEvent.click(google);

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('signIn.googleFailed'));
  });

  it('signs in with a passkey, and says so when the passkey did not work', async () => {
    auth.signIn.passkey.mockResolvedValueOnce({ error: { code: 'X' } }).mockResolvedValueOnce({});
    await render(<SignInForm next="/notes" />);
    const passkey = page.getByRole('button', { name: t('signIn.passkey') });

    await userEvent.click(passkey);
    await expect.element(page.getByRole('alert')).toHaveTextContent(t('signIn.passkeyFailed'));
    await userEvent.click(passkey);

    await vi.waitFor(() => expect(navigate.go).toHaveBeenCalledWith('/notes'));
    await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
  });
});
