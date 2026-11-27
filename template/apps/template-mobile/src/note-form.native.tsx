import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, TextArea, TextField } from '@zigordev/ui-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { api } from './api-client.native';
import { check, noteFields } from './forms';
import { changeOf, draftOf, type Note } from './notes';
import { refreshNotes } from './query-client';
import { fieldText } from './texts';

interface Notice {
  readonly tone: 'success' | 'danger';
  readonly text: string;
}

export function NoteForm({ note }: { readonly note?: Note }) {
  const t = useTranslations();
  const queries = useQueryClient();
  const create = api.useMutation('post', '/api/v1/notes');
  const update = api.useMutation('patch', '/api/v1/notes/{noteId}');
  const [values, setValues] = useState(() => draftOf(note));
  const [problems, setProblems] = useState<Readonly<Record<string, string>>>({});
  const [notice, setNotice] = useState<Notice | null>(null);

  async function save() {
    const checked = check(noteFields, values);
    setProblems(checked.problems);
    if (checked.values === null) {
      return;
    }
    setNotice(null);
    try {
      if (note === undefined) {
        const created = await create.mutateAsync({ body: changeOf(checked.values) });
        refreshNotes(queries);
        router.replace({ pathname: '/notes/[noteId]', params: { noteId: created.id } });
      } else {
        await update.mutateAsync({
          params: { path: { noteId: note.id } },
          body: changeOf(checked.values),
        });
        refreshNotes(queries, note.id);
        setNotice({ tone: 'success', text: t('notes.saved') });
      }
    } catch {
      setNotice({ tone: 'danger', text: t('notes.saveFailed') });
    }
  }

  return (
    <>
      <TextField
        label={t('notes.titleLabel')}
        value={values.title}
        onChangeText={(title) => setValues({ ...values, title })}
        error={fieldText(t, problems.title)}
        testID="title"
      />
      <TextArea
        label={t('notes.bodyLabel')}
        value={values.body}
        onChangeText={(body) => setValues({ ...values, body })}
        error={fieldText(t, problems.body)}
        testID="body"
      />
      {note === undefined ? null : (
        <Checkbox
          label={t('notes.markDone')}
          checked={values.done}
          onChange={(done) => setValues({ ...values, done })}
          testID="done"
        />
      )}
      <Button
        loading={create.isPending || update.isPending}
        onPress={() => void save()}
        testID="save"
      >
        {t('notes.save')}
      </Button>
      {notice === null ? null : (
        <Alert tone={notice.tone} testID="note-notice">
          {notice.text}
        </Alert>
      )}
    </>
  );
}
