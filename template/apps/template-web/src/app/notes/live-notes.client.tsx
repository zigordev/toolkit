'use client';

import { useLiveUpdates } from '@zigordev/live/react';
import { useRouter } from 'next/navigation';

export interface LiveNotesProps {
  readonly noteId?: string;
}

export function LiveNotes({ noteId }: LiveNotesProps) {
  const router = useRouter();
  useLiveUpdates({
    onChange: (message) => {
      if (noteId === undefined || message.changes.some((change) => change.id === noteId)) {
        router.refresh();
      }
    },
    onResync: () => {
      router.refresh();
    },
  });
  return null;
}
