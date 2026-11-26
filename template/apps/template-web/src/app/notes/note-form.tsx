'use client';

import { recordInteraction } from '@zigordev/rum';
import { Alert, Button, Checkbox, TextArea, TextField } from '@zigordev/ui';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useFieldError } from '../../lib/field-errors.ts';
import { noteFields, zodResolver } from '../../lib/forms.ts';
import type { NoteStatus } from '../../lib/notes.ts';
import { notesClient } from '../../lib/notes-client.ts';
import styles from '../forms.module.css';

export interface NoteFormProps {
  readonly note?: {
    readonly id: string;
    readonly title: string;
    readonly body: string;
    readonly status: NoteStatus;
  };
}

interface Notice {
  readonly tone: 'success' | 'danger';
  readonly text: string;
}

export function NoteForm({ note }: NoteFormProps) {
  const t = useTranslations('notes');
  const fieldError = useFieldError();
  const router = useRouter();
  const create = notesClient.useMutation('post', '/api/v1/notes');
  const update = notesClient.useMutation('patch', '/api/v1/notes/{noteId}');
  const [notice, setNotice] = useState<Notice | null>(null);
  const starting = {
    title: note?.title ?? '',
    body: note?.body ?? '',
    done: note?.status === 'done',
  };
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm({ resolver: zodResolver(noteFields), defaultValues: starting });

  const save = handleSubmit(async ({ title, body, done }) => {
    const status: NoteStatus = done ? 'done' : 'open';
    try {
      if (note === undefined) {
        const created = await create.mutateAsync({ body: { title, body, status } });
        recordInteraction('note.created');
        router.push(`/notes/${created.id}`);
      } else {
        await update.mutateAsync({
          params: { path: { noteId: note.id } },
          body: { title, body, status },
        });
        setNotice({ tone: 'success', text: t('saved') });
      }
      router.refresh();
    } catch {
      setNotice({ tone: 'danger', text: t('saveFailed') });
    }
  });

  return (
    <form className={styles.form} onSubmit={save} noValidate>
      <TextField
        label={t('titleLabel')}
        error={fieldError(errors.title?.message)}
        defaultValue={starting.title}
        {...register('title')}
      />
      <TextArea
        label={t('bodyLabel')}
        rows={8}
        error={fieldError(errors.body?.message)}
        defaultValue={starting.body}
        {...register('body')}
      />
      {note === undefined ? null : (
        <Checkbox label={t('markDone')} defaultChecked={starting.done} {...register('done')} />
      )}
      <Button type="submit" loading={isSubmitting}>
        {t('save')}
      </Button>
      {notice === null ? null : <Alert tone={notice.tone}>{notice.text}</Alert>}
    </form>
  );
}
