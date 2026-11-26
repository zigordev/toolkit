import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { SignUpForm } from './sign-up-form.client.tsx';

const auth = vi.hoisted(() => ({ signUp: { email: vi.fn() } }));

vi.mock('../../lib/auth-client.ts', () => ({ getAuthClient: () => auth }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');

async function fill(name: string, email: string, password: string): Promise<void> {
  await userEvent.fill(page.getByRole('textbox', { name: t('signUp.name') }), name);
  await userEvent.fill(page.getByRole('textbox', { name: t('signUp.email') }), email);
  await userEvent.fill(page.getByLabelText(t('signUp.password')), password);
  await userEvent.click(page.getByRole('button', { name: t('signUp.submit') }));
}

describe('the sign-up form', () => {
  it('says what is wrong under each field, and sends nothing', async () => {
    await render(<SignUpForm />);

    await userEvent.click(page.getByRole('button', { name: t('signUp.submit') }));

    await expect.element(page.getByText(t('fields.required')).first()).toBeVisible();
    expect(auth.signUp.email).not.toHaveBeenCalled();
  });

  it('names an address that is not one, and a password that is too short', async () => {
    await render(<SignUpForm />);

    await fill('Ada', 'not-an-address', 'short');

    await expect.element(page.getByText(t('fields.email'))).toBeVisible();
    await expect.element(page.getByText(t('fields.tooShort', { min: 15 }))).toBeVisible();
    expect(auth.signUp.email).not.toHaveBeenCalled();
  });

  it('sends the account and says the link is in the inbox', async () => {
    auth.signUp.email.mockResolvedValue({ data: {}, error: null });
    await render(<SignUpForm />);

    await fill(' Ada ', 'ada@example.com', 'correct horse battery');

    await expect.element(page.getByRole('status')).toHaveTextContent(t('signUp.sent'));
    expect(auth.signUp.email).toHaveBeenCalledWith({
      name: 'Ada',
      email: 'ada@example.com',
      password: 'correct horse battery',
      callbackURL: '/account',
    });
  });

  it('says so when the account was not created', async () => {
    auth.signUp.email.mockResolvedValue({ data: null, error: {} });
    await render(<SignUpForm />);

    await fill('Ada', 'ada@example.com', 'correct horse battery');

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('signUp.failed'));
  });
});
