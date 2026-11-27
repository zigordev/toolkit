import { useInfiniteQuery } from '@tanstack/react-query';
import { Alert, Button, lineHeight, TextField, useTokens } from '@zigordev/ui-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, RefreshControl, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { api } from '../../src/api-client.native';
import { showsFailure } from '../../src/failure';
import {
  allNotes,
  filterOf,
  isFiltered,
  type Note,
  type NoteStatus,
  type NotesFilter,
  notesIn,
  notesQuery,
} from '../../src/notes';
import { Body } from '../../src/screen.native';
import { SignedIn, useSessionCheck } from '../../src/signed-in.native';

const filters = [
  { id: 'all', status: undefined, label: 'notes.allNotes' },
  { id: 'open', status: 'open', label: 'notes.openNotes' },
  { id: 'done', status: 'done', label: 'notes.doneNotes' },
] as const;

export default function Notes() {
  return (
    <SignedIn next="/notes">
      <NotesList />
    </SignedIn>
  );
}

function NoteRow({ note }: { readonly note: Note }) {
  const t = useTranslations();
  const tokens = useTokens();
  const size = tokens['font-size-md'];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/notes/[noteId]', params: { noteId: note.id } })}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: tokens['space-3'],
        paddingVertical: tokens['space-3'],
        borderBottomWidth: tokens['border-width-hairline'],
        borderBottomColor: tokens['color-border-subtle'],
        backgroundColor: pressed ? tokens['color-bg-pressed'] : 'transparent',
      })}
    >
      <Text
        style={{
          flex: 1,
          color: tokens['color-fg-default'],
          fontSize: size,
          lineHeight: lineHeight(size, tokens['font-line-height-normal']),
        }}
      >
        {note.title}
      </Text>
      <Text style={{ color: tokens['color-fg-muted'], fontSize: tokens['font-size-sm'] }}>
        {note.status === 'done' ? t('notes.done') : t('notes.open')}
      </Text>
    </Pressable>
  );
}

function NotesList() {
  const t = useTranslations();
  const tokens = useTokens();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<NotesFilter>(allNotes);
  const [pulling, setPulling] = useState(false);
  const notes = useInfiniteQuery(notesQuery(api.client, filter));
  useSessionCheck(notes.error);

  function show(status: NoteStatus | undefined) {
    setFilter(filterOf(status, filter.q ?? ''));
  }

  function find() {
    setFilter(filterOf(filter.status, search));
  }

  async function pull() {
    setPulling(true);
    await notes.refetch();
    setPulling(false);
  }

  const header = (
    <View style={{ gap: tokens['space-4'], paddingBottom: tokens['space-4'] }}>
      <Button onPress={() => router.push('/notes/new')} testID="new-note">
        {t('notes.new')}
      </Button>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: tokens['space-3'] }}>
        <View style={{ flex: 1 }}>
          <TextField
            label={t('notes.searchLabel')}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            autoCorrect={false}
            onSubmitEditing={find}
            testID="search"
          />
        </View>
        <Button variant="soft" onPress={find} testID="find">
          {t('notes.search')}
        </Button>
      </View>
      <View
        accessibilityLabel={t('notes.filterLabel')}
        style={{ flexDirection: 'row', gap: tokens['space-2'] }}
      >
        {filters.map(({ id, status, label }) => (
          <Button
            key={id}
            size="sm"
            tone="neutral"
            variant={filter.status === status ? 'soft' : 'ghost'}
            accessibilityState={{ selected: filter.status === status }}
            onPress={() => show(status)}
            testID={`show-${id}`}
          >
            {t(label)}
          </Button>
        ))}
      </View>
    </View>
  );

  const empty = showsFailure(notes) ? (
    <View style={{ gap: tokens['space-4'] }}>
      <Alert tone="danger" testID="notes-failed">
        {t('notes.loadFailed')}
      </Alert>
      <Button
        variant="soft"
        loading={notes.isFetching}
        onPress={() => void notes.refetch()}
        testID="retry"
      >
        {t('failure.retry')}
      </Button>
    </View>
  ) : notes.isPending ? undefined : (
    <Body testID="notes-empty">{isFiltered(filter) ? t('notes.noMatch') : t('notes.empty')}</Body>
  );

  const footer = notes.hasNextPage ? (
    <View style={{ paddingTop: tokens['space-4'] }}>
      <Button
        variant="outline"
        tone="neutral"
        loading={notes.isFetchingNextPage}
        onPress={() => void notes.fetchNextPage()}
        testID="more"
      >
        {t('notes.more')}
      </Button>
    </View>
  ) : undefined;

  return (
    <FlatList
      style={{ flex: 1, backgroundColor: tokens['color-bg-page'] }}
      contentContainerStyle={{ padding: tokens['space-6'] }}
      contentInsetAdjustmentBehavior="automatic"
      keyboardShouldPersistTaps="handled"
      data={notesIn(notes.data)}
      keyExtractor={(note) => note.id}
      renderItem={({ item }) => <NoteRow note={item} />}
      ListHeaderComponent={header}
      ListEmptyComponent={empty}
      ListFooterComponent={footer}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
          onRefresh={() => void pull()}
          tintColor={tokens['color-fg-muted']}
        />
      }
    />
  );
}
