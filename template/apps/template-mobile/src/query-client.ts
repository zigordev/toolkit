import { QueryClient } from '@tanstack/react-query';
import { shouldRetry } from './timeout';

const notesList = ['get', '/api/v1/notes'] as const;
const oneNote = ['get', '/api/v1/notes/{noteId}'] as const;

function noteKey(noteId: string) {
  return [...oneNote, { params: { path: { noteId } } }] as const;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
}

export function refreshNotes(client: QueryClient, noteId?: string): void {
  void client.invalidateQueries({ queryKey: notesList });
  if (noteId !== undefined) {
    void client.invalidateQueries({ queryKey: noteKey(noteId) });
  }
}

export function forgetPerson(client: QueryClient): void {
  client.removeQueries({ queryKey: notesList });
  client.removeQueries({ queryKey: oneNote });
}
