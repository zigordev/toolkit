import { notifyChange, type SqlExecutor } from '@zigordev/live/server';

export type NoteChange = 'note.created' | 'note.updated' | 'note.deleted';

export function notesChannel(ownerId: string): string {
  return `notes:${ownerId}`;
}

export async function announceNote(
  tx: SqlExecutor,
  type: NoteChange,
  note: { readonly id: string; readonly ownerId: string | null } | undefined
): Promise<void> {
  if (note?.ownerId === null || note?.ownerId === undefined) {
    return;
  }
  await notifyChange(tx, { channel: notesChannel(note.ownerId), type, id: note.id });
}
