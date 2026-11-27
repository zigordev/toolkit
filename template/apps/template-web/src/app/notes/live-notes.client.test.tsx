import type { UseLiveUpdatesOptions } from '@zigordev/live/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '../../../test/render.tsx';
import { LiveNotes } from './live-notes.client.tsx';

const live = vi.hoisted(() => ({ options: undefined as UseLiveUpdatesOptions | undefined }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock('@zigordev/live/react', () => ({
  useLiveUpdates: (options: UseLiveUpdatesOptions) => {
    live.options = options;
    return 'open';
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

afterEach(() => {
  cleanup();
  live.options = undefined;
  vi.clearAllMocks();
});

const changed = (id: string) => ({
  channel: 'notes:u1',
  changes: [{ type: 'note.updated', id }],
});

describe('the live notes', () => {
  it('refreshes the list of notes on any change to them', async () => {
    await render(<LiveNotes />);

    live.options?.onChange(changed('n1'));
    live.options?.onChange(changed('n2'));

    expect(router.refresh).toHaveBeenCalledTimes(2);
  });

  it('refreshes one note only when that note changed', async () => {
    await render(<LiveNotes noteId="n1" />);

    live.options?.onChange(changed('n2'));
    expect(router.refresh).not.toHaveBeenCalled();

    live.options?.onChange(changed('n1'));
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('refreshes after a gap, when the stream asks to catch up', async () => {
    await render(<LiveNotes noteId="n1" />);

    live.options?.onResync?.();

    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows nothing on the page', async () => {
    const container = await render(<LiveNotes />);

    expect(container.innerHTML).toBe('');
  });
});
