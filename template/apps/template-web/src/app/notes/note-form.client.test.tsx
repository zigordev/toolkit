import { afterEach, describe, expect, it, vi } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { cleanup, render } from '../../../test/render.tsx';
import { textsIn } from '../../../test/texts.ts';
import { NoteForm } from './note-form.client.tsx';

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const rum = vi.hoisted(() => ({ recordInteraction: vi.fn() }));

vi.mock('../../lib/notes-client.ts', () => ({
  notesClient: {
    useMutation: (method: string) => ({ mutateAsync: method === 'post' ? api.create : api.update }),
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@zigordev/rum', () => rum);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const t = textsIn('en');
const note = {
  id: '01938c2e-0000-7000-8000-0000000000aa',
  title: 'Buy milk',
  body: 'Two litres',
  status: 'open',
} as const;

describe('the note form', () => {
  it('asks for a title before it sends anything', async () => {
    await render(<NoteForm />);

    await userEvent.click(page.getByRole('button', { name: t('notes.save') }));

    await expect.element(page.getByText(t('fields.required'))).toBeVisible();
    expect(api.create).not.toHaveBeenCalled();
  });

  it('writes a new note, counts it and opens it', async () => {
    api.create.mockResolvedValue({ id: note.id });
    await render(<NoteForm />);

    await expect.element(page.getByRole('checkbox')).not.toBeInTheDocument();
    await userEvent.fill(page.getByRole('textbox', { name: t('notes.titleLabel') }), ' Buy milk ');
    await userEvent.fill(page.getByRole('textbox', { name: t('notes.bodyLabel') }), 'Two litres');
    await userEvent.click(page.getByRole('button', { name: t('notes.save') }));

    await vi.waitFor(() => expect(router.push).toHaveBeenCalledWith(`/notes/${note.id}`));
    expect(api.create).toHaveBeenCalledWith({
      body: { title: 'Buy milk', body: 'Two litres', status: 'open' },
    });
    expect(rum.recordInteraction).toHaveBeenCalledWith('note.created');
    expect(router.refresh).toHaveBeenCalled();
  });

  it('saves a change to a note, marks it done and says so', async () => {
    api.update.mockResolvedValue({});
    await render(<NoteForm note={note} />);

    await userEvent.click(page.getByRole('checkbox', { name: t('notes.markDone') }));
    await userEvent.click(page.getByRole('button', { name: t('notes.save') }));

    await expect.element(page.getByRole('status')).toHaveTextContent(t('notes.saved'));
    expect(api.update).toHaveBeenCalledWith({
      params: { path: { noteId: note.id } },
      body: { title: 'Buy milk', body: 'Two litres', status: 'done' },
    });
    expect(router.refresh).toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('says so when the note was not saved', async () => {
    api.update.mockRejectedValue(new Error('offline'));
    await render(<NoteForm note={{ ...note, status: 'done' }} />);

    await expect.element(page.getByRole('checkbox', { name: t('notes.markDone') })).toBeChecked();
    await userEvent.click(page.getByRole('button', { name: t('notes.save') }));

    await expect.element(page.getByRole('alert')).toHaveTextContent(t('notes.saveFailed'));
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
