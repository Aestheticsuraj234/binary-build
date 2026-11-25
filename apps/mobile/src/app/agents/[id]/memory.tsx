import type {
  AddMemoryResult,
  AgentSummary,
  MemoriesOverview,
  MemorySummary,
} from '@binary/shared';
import {
  addMemorySchema,
  colors,
  fontSize,
  fontWeight,
  MEMORY_MAX_LENGTH,
  radius,
  spacing,
  validate,
} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
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
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {NeedsKey} from '@/components/needs-key';
import {TextField} from '@/components/text-field';
import {useApi} from '@/hooks/use-api';
import {ApiError, apiJson} from '@/lib/api';

function errorText(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : String(caught);
}

function MemoryRow({
  memory,
  agentName,
  onForget,
}: {
  memory: MemorySummary;
  agentName: string;
  onForget: () => void;
}) {
  return (
    <View style={styles.memory}>
      <View style={styles.grow}>
        <Text selectable style={styles.text}>
          {memory.content}
        </Text>
        <Text style={styles.muted}>
          {memory.source === 'person'
            ? 'Added by you'
            : `Saved by ${agentName}`}
          {memory.searchable ? '' : ' · made by another model'}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Forget "${memory.content}"`}
        onPress={onForget}
        hitSlop={8}
      >
        <Text style={styles.forget}>Forget</Text>
      </Pressable>
    </View>
  );
}

/** What one character remembers about you: add, forget, re-index. */
export default function MemoryScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const agent = useApi<{agent: AgentSummary}>(`/api/agents/${id}`);
  const overview = useApi<MemoriesOverview>(`/api/agents/${id}/memories`);
  const [content, setContent] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const base = `/api/agents/${id}/memories`;

  if (!agent.data || !overview.data) {
    return (
      <View style={styles.center}>
        {agent.error || overview.error ? (
          <Text style={styles.alert}>{agent.error ?? overview.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const name = agent.data.agent.name;
  const {status, memories, otherModelCount} = overview.data;
  const reload = overview.reload;

  async function add() {
    setNotice(undefined);
    const checked = validate(addMemorySchema, {content});
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsAdding(true);
    try {
      const result = await apiJson<AddMemoryResult>(base, {
        method: 'POST',
        body: checked.data,
      });
      if (result.status === 'saved') {
        setContent('');
      } else {
        setNotice(`${name} already remembers: “${result.memory.content}”`);
      }
      await reload();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsAdding(false);
    }
  }

  function confirmForget(memory: MemorySummary) {
    Alert.alert('Forget this?', memory.content, [
      {text: 'Keep it', style: 'cancel'},
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () => {
          apiJson(`${base}/${memory.id}`, {method: 'DELETE'})
            .then(reload)
            .catch((caught: unknown) =>
              Alert.alert("Couldn't forget it", errorText(caught)),
            );
        },
      },
    ]);
  }

  async function reindex() {
    setIsReindexing(true);
    try {
      await apiJson(`${base}/reindex`, {method: 'POST'});
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
      <Stack.Screen options={{title: `${name}’s memory`}} />
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
          Lasting facts about you that {name} reads before every answer, in
          every chat. Only {name} sees these.
        </Text>

        {!status.available ? (
          <NeedsKey title="Memory is off" message={status.message} />
        ) : (
          <View style={styles.card}>
            <TextField
              label="Add a memory"
              value={content}
              onChangeText={setContent}
              placeholder="Prefers short answers"
              maxLength={MEMORY_MAX_LENGTH}
              error={error}
              onSubmitEditing={() => void add()}
            />
            <Text style={styles.muted}>
              One lasting fact about you. Never a password, key or other secret.
            </Text>
            {notice ? <Text style={styles.text}>{notice}</Text> : null}
            <Button
              label="Add"
              isLoading={isAdding}
              disabled={!content.trim()}
              onPress={() => void add()}
            />
          </View>
        )}

        {status.available && otherModelCount > 0 && (
          <View style={[styles.card, styles.warningCard]}>
            <Text style={styles.warning}>
              {otherModelCount === 1
                ? '1 memory was'
                : `${otherModelCount} memories were`}{' '}
              made by another embedding model, so search can’t find{' '}
              {otherModelCount === 1 ? 'it' : 'them'}.
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
          {memories.length === 1 ? '1 memory' : `${memories.length} memories`}
        </Text>
        {memories.length === 0 ? (
          <Text style={styles.muted}>
            {name} doesn’t remember anything about you yet. Tell it in a chat
            (“Remember that I prefer short answers”) or add a memory here.
          </Text>
        ) : (
          <View style={styles.list}>
            {memories.map(memory => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                agentName={name}
                onForget={() => confirmForget(memory)}
              />
            ))}
          </View>
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
  memory: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  grow: {flex: 1, gap: spacing.xs},
  text: {color: colors.text, fontSize: fontSize.md, lineHeight: 22},
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  forget: {color: colors.textMuted, fontSize: fontSize.sm},
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
