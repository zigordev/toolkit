import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button } from '@zigordev/ui-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert as Dialog } from 'react-native';
import { useTranslations } from 'use-intl';
import { api } from '../../src/api-client.native';
import { showsFailure, statusOf } from '../../src/failure';
import { NoteForm } from '../../src/note-form.native';
import { refreshNotes } from '../../src/query-client';
import { Screen } from '../../src/screen.native';
import { SignedIn, useSessionCheck } from '../../src/signed-in.native';

export default function NoteScreen() {
  const { noteId } = useLocalSearchParams<{ noteId: string }>();
  return (
    <SignedIn next={`/notes/${noteId}`}>
      <OneNote noteId={noteId} />
    </SignedIn>
  );
}

function OneNote({ noteId }: { readonly noteId: string }) {
  const t = useTranslations();
  const queries = useQueryClient();
  const note = api.useQuery('get', '/api/v1/notes/{noteId}', { params: { path: { noteId } } });
  const remove = api.useMutation('delete', '/api/v1/notes/{noteId}');
  const [deleteFailed, setDeleteFailed] = useState(false);
  useSessionCheck(note.error);
  const status = statusOf(note.error);

  async function deleteIt() {
    setDeleteFailed(false);
    try {
      await remove.mutateAsync({ params: { path: { noteId } } });
      router.dismissTo('/notes');
      refreshNotes(queries);
    } catch {
      setDeleteFailed(true);
    }
  }

  function ask() {
    Dialog.alert(t('notes.deleteQuestion'), undefined, [
      { text: t('notes.keep'), style: 'cancel' },
      { text: t('notes.deleteForGood'), style: 'destructive', onPress: () => void deleteIt() },
    ]);
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: note.data?.title ?? '' }} />
      {status === 404 || status === 400 ? (
        <Alert tone="danger" testID="note-missing">
          {t('notFound.title')}
        </Alert>
      ) : showsFailure(note) ? (
        <>
          <Alert tone="danger" testID="note-failed">
            {t('notes.loadFailed')}
          </Alert>
          <Button
            variant="soft"
            loading={note.isFetching}
            onPress={() => void note.refetch()}
            testID="retry"
          >
            {t('failure.retry')}
          </Button>
        </>
      ) : note.data === undefined ? null : (
        <>
          <NoteForm note={note.data} />
          <Button
            variant="outline"
            tone="danger"
            loading={remove.isPending}
            onPress={ask}
            testID="delete"
          >
            {t('notes.delete')}
          </Button>
          {deleteFailed ? (
            <Alert tone="danger" testID="delete-failed">
              {t('notes.deleteFailed')}
            </Alert>
          ) : null}
        </>
      )}
    </Screen>
  );
}
