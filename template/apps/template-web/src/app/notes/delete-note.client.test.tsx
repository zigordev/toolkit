import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { DeleteNote } from './delete-note.client.tsx';

const api = vi.hoisted(() => ({ remove: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const rum = vi.hoisted(() => ({ recordInteraction: vi.fn() }));

vi.mock('../../lib/notes-client.ts', () => ({
  notesClient: { useMutation: () => ({ mutateAsync: api.remove, isPending: false }) },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@zigordev/rum', () => rum);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');
const id = '01938c2e-0000-7000-8000-0000000000aa';

describe('deleting a note', () => {
  it('asks first, and keeps the note when told to', async () => {
    await render(<DeleteNote id={id} />);

    await userEvent.click(page.getByRole('button', { name: t('notes.delete') }));
    await expect
      .element(page.getByRole('alert').getByText(t('notes.deleteQuestion')))
      .toBeVisible();
    await userEvent.click(page.getByRole('button', { name: t('notes.keep') }));

    await expect.element(page.getByRole('button', { name: t('notes.delete') })).toBeVisible();
    expect(api.remove).not.toHaveBeenCalled();
  });

  it('deletes the note for good, counts it and goes back to the list', async () => {
    api.remove.mockResolvedValue(undefined);
    await render(<DeleteNote id={id} />);

    await userEvent.click(page.getByRole('button', { name: t('notes.delete') }));
    await userEvent.click(page.getByRole('button', { name: t('notes.deleteForGood') }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith('/notes'));
    expect(api.remove).toHaveBeenCalledWith({ params: { path: { noteId: id } } });
    expect(rum.recordInteraction).toHaveBeenCalledWith('note.deleted');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('says so when the note was not deleted', async () => {
    api.remove.mockRejectedValue(new Error('offline'));
    await render(<DeleteNote id={id} />);

    await userEvent.click(page.getByRole('button', { name: t('notes.delete') }));
    await userEvent.click(page.getByRole('button', { name: t('notes.deleteForGood') }));

    await expect.element(page.getByText(t('notes.deleteFailed'))).toBeVisible();
    expect(router.push).not.toHaveBeenCalled();
  });
});
