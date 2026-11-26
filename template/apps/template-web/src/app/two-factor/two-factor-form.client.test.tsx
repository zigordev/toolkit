import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { TwoFactorForm } from './two-factor-form.client.tsx';

const auth = vi.hoisted(() => ({
  twoFactor: { verifyTotp: vi.fn(), verifyBackupCode: vi.fn() },
}));
const navigate = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock('../../lib/auth-client.ts', () => ({ getAuthClient: () => auth }));
vi.mock('../../lib/navigate.ts', () => navigate);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');

describe('the two-factor form', () => {
  it('asks for a code before it sends anything', async () => {
    await render(<TwoFactorForm />);

    await userEvent.click(page.getByRole('button', { name: t('twoFactor.submit') }));

    await expect.element(page.getByText(t('fields.required'))).toBeVisible();
    expect(auth.twoFactor.verifyTotp).not.toHaveBeenCalled();
  });

  it('checks the code of the app, trusts the device when asked, and goes on to the account', async () => {
    auth.twoFactor.verifyTotp.mockResolvedValue({ data: {}, error: null });
    await render(<TwoFactorForm />);

    await userEvent.fill(page.getByRole('textbox', { name: t('twoFactor.code') }), '123456');
    await userEvent.click(page.getByRole('checkbox', { name: t('twoFactor.trust', { days: 30 }) }));
    await userEvent.click(page.getByRole('button', { name: t('twoFactor.submit') }));

    await vi.waitFor(() => expect(navigate.go).toHaveBeenCalledWith('/account'));
    expect(auth.twoFactor.verifyTotp).toHaveBeenCalledWith({ code: '123456', trustDevice: true });
  });

  it('takes anything else as a backup code, and says so when it did not work', async () => {
    auth.twoFactor.verifyBackupCode.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_BACKUP_CODE' },
    });
    await render(<TwoFactorForm />);

    await userEvent.fill(page.getByRole('textbox', { name: t('twoFactor.code') }), 'abcde-fghij');
    await userEvent.click(page.getByRole('button', { name: t('twoFactor.submit') }));

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('problems.wrongCode'));
    expect(auth.twoFactor.verifyBackupCode).toHaveBeenCalledWith({
      code: 'abcde-fghij',
      trustDevice: false,
    });
    expect(navigate.go).not.toHaveBeenCalled();
  });
});
