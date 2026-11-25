import type {
  KnowledgeDocumentSummary,
  KnowledgeMatch,
  KnowledgeOverview,
} from '@binary/shared';
import {
  addKnowledgeSchema,
  colors,
  fontSize,
  fontWeight,
  knowledgeSearchSchema,
  radius,
  spacing,
  validate,
} from '@binary/shared';
import {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {NeedsKey} from '@/components/needs-key';
import {TextField} from '@/components/text-field';
import {useApi} from '@/hooks/use-api';
import {ApiError, apiJson} from '@/lib/api';

type Kind = 'text' | 'url';

function errorText(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : String(caught);
}

function plural(n: number, one: string): string {
  return `${n.toLocaleString()} ${n === 1 ? one : `${one}s`}`;
}

/** Paste text or give a public address. Files are added on the web. */
function AddDocument({onAdded}: {onAdded: () => Promise<void>}) {
  const [kind, setKind] = useState<Kind>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);

  async function add() {
    const checked = validate(
      addKnowledgeSchema,
      kind === 'text' ? {kind, title, text} : {kind, url},
    );
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsAdding(true);
    try {
      await apiJson('/api/knowledge', {method: 'POST', body: checked.data});
      setTitle('');
      setText('');
      setUrl('');
      await onAdded();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <View style={styles.card}>
      <View accessibilityRole="radiogroup" style={styles.tabs}>
        {(['text', 'url'] as const).map(k => (
          <Pressable
            key={k}
            accessibilityRole="radio"
            accessibilityState={{checked: kind === k}}
            onPress={() => {
              setKind(k);
              setError(undefined);
            }}
            style={[styles.tab, kind === k && styles.tabOn]}
          >
            <Text style={[styles.tabText, kind === k && styles.tabTextOn]}>
              {k === 'text' ? 'Paste text' : 'Web page'}
            </Text>
          </Pressable>
        ))}
      </View>
      {kind === 'text' ? (
        <>
          <TextField
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Team handbook"
          />
          <Text style={styles.label}>Text</Text>
          <TextInput
            accessibilityLabel="Text"
            multiline
            value={text}
            onChangeText={setText}
            placeholder="Paste the document here."
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.accent}
            style={styles.textArea}
          />
        </>
      ) : (
        <>
          <TextField
            label="Address"
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/handbook"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <Text style={styles.muted}>
            A public page. Binary reads its text once, now.
          </Text>
        </>
      )}
      {error ? <Text style={styles.alert}>{error}</Text> : null}
      <Button
        label={isAdding ? 'Reading and indexing…' : 'Add to knowledge'}
        isLoading={isAdding}
        onPress={() => void add()}
      />
      <Text style={styles.muted}>
        To upload a text file, use Binary on the web.
      </Text>
    </View>
  );
}

function DocumentRow({
  document,
  onDeleted,
}: {
  document: KnowledgeDocumentSummary;
  onDeleted: () => void;
}) {
  function confirmDelete() {
    Alert.alert(
      `Delete ${document.title}?`,
      "Characters can't search it after this.",
      [
        {text: 'Keep it', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            apiJson(`/api/knowledge/${document.id}`, {method: 'DELETE'})
              .then(onDeleted)
              .catch((caught: unknown) =>
                Alert.alert("Couldn't delete it", errorText(caught)),
              );
          },
        },
      ],
    );
  }
  return (
    <View style={styles.row}>
      <View style={styles.grow}>
        <Text numberOfLines={1} style={styles.title}>
          {document.title}
        </Text>
        <Text numberOfLines={1} style={styles.muted}>
          {plural(document.passages, 'passage')}
          {document.url ? ` · ${new URL(document.url).hostname}` : ''}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete ${document.title}`}
        onPress={confirmDelete}
        hitSlop={8}
      >
        <Text style={styles.subtle}>Delete</Text>
      </Pressable>
    </View>
  );
}

/** "Try a question": the passages a character would find. */
function TryAQuestion() {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<KnowledgeMatch[] | null>(null);
  const [error, setError] = useState<string>();
  const [isSearching, setIsSearching] = useState(false);

  async function search() {
    const checked = validate(knowledgeSearchSchema, {query});
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsSearching(true);
    try {
      const result = await apiJson<{matches: KnowledgeMatch[]}>(
        '/api/knowledge/search',
        {method: 'POST', body: checked.data},
      );
      setMatches(result.matches);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <View style={styles.card}>
      <TextField
        label="Try a question"
        value={query}
        onChangeText={setQuery}
        placeholder="How many vacation days do I get?"
        error={error}
        returnKeyType="search"
        onSubmitEditing={() => void search()}
      />
      <Button
        label="Search"
        variant="secondary"
        isLoading={isSearching}
        onPress={() => void search()}
      />
      {matches?.map(match => (
        <View
          key={`${match.documentId}-${match.position}`}
          style={styles.match}
        >
          <Text style={styles.muted}>
            {match.title} · {Math.round(match.similarity * 100)}% close
          </Text>
          <Text numberOfLines={6} style={styles.text}>
            {match.content}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Your documents, for every character to search and cite. */
export default function KnowledgeScreen() {
  const library = useApi<KnowledgeOverview>('/api/knowledge');
  const [isReindexing, setIsReindexing] = useState(false);
  const reload = library.reload;

  if (!library.data) {
    return (
      <View style={styles.center}>
        {library.error ? (
          <Text style={styles.alert}>{library.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const {status, documents} = library.data;
  const stale = documents.reduce((n, d) => n + d.otherModelPassages, 0);

  async function reindex() {
    setIsReindexing(true);
    try {
      await apiJson('/api/knowledge/reindex', {method: 'POST'});
      await reload();
    } catch (caught) {
      Alert.alert("Couldn't re-index", errorText(caught));
    } finally {
      setIsReindexing(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void reload()}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.intro}>
          Your own documents, for every character to search by meaning and cite.
          What they say is treated as information, never as instructions.
        </Text>
        {!status.available ? (
          <NeedsKey title="Knowledge is off" message={status.message} />
        ) : (
          <>
            <AddDocument onAdded={reload} />
            {stale > 0 && (
              <View style={[styles.card, styles.warningCard]}>
                <Text style={styles.warning}>
                  {plural(stale, 'passage')} {stale === 1 ? 'was' : 'were'} made
                  by another embedding model, so search can’t find{' '}
                  {stale === 1 ? 'it' : 'them'}.
                </Text>
                <Button
                  label="Re-index"
                  variant="secondary"
                  isLoading={isReindexing}
                  onPress={() => void reindex()}
                />
              </View>
            )}
            <Text accessibilityRole="header" style={styles.section}>
              {plural(documents.length, 'document')}
            </Text>
            {documents.length === 0 ? (
              <Text style={styles.muted}>
                Nothing here yet. Add a handbook, your notes or a web page, and
                every character can search it.
              </Text>
            ) : (
              <>
                <View style={styles.list}>
                  {documents.map(document => (
                    <DocumentRow
                      key={document.id}
                      document={document}
                      onDeleted={() => void reload()}
                    />
                  ))}
                </View>
                <TryAQuestion />
              </>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  warningCard: {
    borderColor: colors.warning,
    backgroundColor: colors.warningSurface,
  },
  warning: {color: colors.warning, fontSize: fontSize.sm, lineHeight: 20},
  tabs: {flexDirection: 'row', gap: spacing.sm},
  tab: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabOn: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  tabText: {color: colors.textMuted, fontSize: fontSize.sm},
  tabTextOn: {color: colors.text, fontWeight: fontWeight.medium},
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  textArea: {
    minHeight: 160,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    padding: spacing.md,
    textAlignVertical: 'top',
  },
  section: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  grow: {flex: 1, gap: spacing.xs},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  match: {
    gap: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
  },
  text: {color: colors.text, fontSize: fontSize.sm, lineHeight: 20},
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  subtle: {color: colors.textMuted, fontSize: fontSize.sm},
  alert: {
    color: colors.danger,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
