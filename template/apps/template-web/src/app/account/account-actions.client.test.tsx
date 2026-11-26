import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { AccountActions } from './account-actions.client.tsx';

const auth = vi.hoisted(() => ({
  passkey: { addPasskey: vi.fn() },
  twoFactor: { enable: vi.fn(), verifyTotp: vi.fn() },
  deleteUser: vi.fn(),
  signOut: vi.fn(),
}));
const navigate = vi.hoisted(() => ({ go: vi.fn() }));

vi.mock('../../lib/auth-client.ts', () => ({ getAuthClient: () => auth }));
vi.mock('../../lib/navigate.ts', () => navigate);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');
const totpURI = 'otpauth://totp/Notes:ada?secret=ABC';

describe('the account actions', () => {
  it('asks for the name of the device before it adds a passkey', async () => {
    await render(<AccountActions />);

    await userEvent.click(page.getByRole('button', { name: t('account.addPasskey') }));

    await expect.element(page.getByText(t('fields.required'))).toBeVisible();
    expect(auth.passkey.addPasskey).not.toHaveBeenCalled();
  });

  it('adds a passkey under the name given, and says when one was not added', async () => {
    auth.passkey.addPasskey
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: 'ERROR_CANCELLED' } });
    await render(<AccountActions />);
    const add = page.getByRole('button', { name: t('account.addPasskey') });

    await userEvent.fill(page.getByRole('textbox', { name: t('account.deviceName') }), 'Laptop');
    await userEvent.click(add);
    await expect.element(page.getByRole('status')).toHaveTextContent(t('account.passkeyAdded'));
    expect(auth.passkey.addPasskey).toHaveBeenCalledWith({ name: 'Laptop' });
    await userEvent.click(add);

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('account.passkeyFailed'));
  });

  it('turns two-factor on: shows the address and the backup codes, then checks the first code', async () => {
    auth.twoFactor.enable.mockResolvedValue({
      data: { method: 'totp', totpURI, backupCodes: ['aaaaa-bbbbb', 'ccccc-ddddd'] },
      error: null,
    });
    auth.twoFactor.verifyTotp
      .mockResolvedValueOnce({ data: null, error: { code: 'INVALID_CODE' } })
      .mockResolvedValueOnce({ data: {}, error: null });
    await render(<AccountActions />);

    await userEvent.fill(page.getByLabelText(t('account.password')), 'correct horse battery');
    await userEvent.click(page.getByRole('button', { name: t('account.turnOn') }));
    await expect.element(page.getByText(totpURI)).toBeVisible();
    await expect.element(page.getByText('ccccc-ddddd')).toBeVisible();
    expect(auth.twoFactor.enable).toHaveBeenCalledWith({ password: 'correct horse battery' });

    const code = page.getByRole('textbox', { name: t('account.firstCode') });
    const confirm = page.getByRole('button', { name: t('account.confirm') });
    await userEvent.fill(code, '000000');
    await userEvent.click(confirm);
    await expect.element(page.getByRole('alert')).toHaveTextContent(t('problems.wrongCode'));
    await userEvent.fill(code, '123456');
    await userEvent.click(confirm);

    await expect.element(page.getByRole('status')).toHaveTextContent(t('account.twoFactorOn'));
    expect(auth.twoFactor.verifyTotp).toHaveBeenLastCalledWith({ code: '123456' });
    await expect.element(page.getByLabelText(t('account.password'))).toBeVisible();
  });

  it('says why two-factor could not be turned on', async () => {
    auth.twoFactor.enable
      .mockResolvedValueOnce({ data: null, error: { code: 'INVALID_PASSWORD' } })
      .mockResolvedValueOnce({ data: { method: 'otp' }, error: null });
    await render(<AccountActions />);
    const turnOn = page.getByRole('button', { name: t('account.turnOn') });

    await userEvent.click(turnOn);
    await expect.element(page.getByText(t('fields.required'))).toBeVisible();
    await userEvent.fill(page.getByLabelText(t('account.password')), 'wrong');
    await userEvent.click(turnOn);
    await expect.element(page.getByRole('alert')).toHaveTextContent(t('problems.wrongCredentials'));
    await userEvent.click(turnOn);

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('account.turnOnFailed'));
  });

  it('signs out and goes to the start page', async () => {
    auth.signOut.mockResolvedValue({ data: {}, error: null });
    await render(<AccountActions />);

    await userEvent.click(page.getByRole('button', { name: t('account.signOut') }));

    await vi.waitFor(() => expect(navigate.go).toHaveBeenCalledWith('/'));
  });

  it('asks for the link that deletes the account, and says when that failed', async () => {
    auth.deleteUser
      .mockResolvedValueOnce({ data: {}, error: null })
      .mockResolvedValueOnce({ data: null, error: { status: 429 } });
    await render(<AccountActions />);
    const remove = page.getByRole('button', { name: t('account.delete') });

    await userEvent.click(remove);
    await expect.element(page.getByRole('status')).toHaveTextContent(t('account.deleteAsked'));
    expect(auth.deleteUser).toHaveBeenCalledWith({ callbackURL: '/' });
    await userEvent.click(remove);

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('problems.tooMany'));
  });
});
