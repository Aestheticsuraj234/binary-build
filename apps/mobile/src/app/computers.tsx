import type {RunnerAdded, RunnerSummary} from '@binary/shared';
import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {TextField} from '@/components/text-field';
import {useApi} from '@/hooks/use-api';
import {ApiError, apiJson} from '@/lib/api';

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
const STATUS: Record<RunnerSummary['status'], string> = {
  pairing: 'Waiting to pair',
  online: '● Online',
  offline: '○ Offline',
  paused: '⏸ Paused',
};

function RunnerCard({
  runner,
  onChanged,
}: {
  runner: RunnerSummary;
  onChanged: () => void;
}) {
  const [isBusy, setIsBusy] = useState(false);

  async function togglePause() {
    setIsBusy(true);
    try {
      await apiJson(
        `/api/runners/${runner.id}/${runner.status === 'paused' ? 'resume' : 'pause'}`,
        {method: 'POST'},
      );
      onChanged();
    } catch (caught) {
      Alert.alert(
        "Couldn't do that",
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setIsBusy(false);
    }
  }

  function confirmRemove() {
    Alert.alert(`Remove ${runner.name}?`, 'Its token stops working at once.', [
      {text: 'Keep it', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          apiJson(`/api/runners/${runner.id}`, {method: 'DELETE'})
            .then(onChanged)
            .catch((caught: unknown) =>
              Alert.alert(
                "Couldn't remove it",
                caught instanceof Error ? caught.message : String(caught),
              ),
            );
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.grow}>
          <Text style={styles.title}>{runner.name}</Text>
          {runner.os ? <Text style={styles.muted}>{runner.os}</Text> : null}
        </View>
        <Text
          style={[
            styles.status,
            runner.status === 'online' && {color: colors.accent},
          ]}
        >
          {STATUS[runner.status]}
        </Text>
      </View>
      {runner.folders.length > 0 && (
        <View style={styles.folders}>
          <Text style={styles.muted}>Shared folders</Text>
          {runner.folders.map(folder => (
            <Text key={folder} selectable numberOfLines={1} style={styles.mono}>
              {folder}
            </Text>
          ))}
        </View>
      )}
      {runner.status !== 'pairing' && (
        <View style={styles.row}>
          <View style={styles.grow}>
            <Button
              label={runner.status === 'paused' ? 'Resume' : 'Pause'}
              variant="secondary"
              isLoading={isBusy}
              onPress={() => void togglePause()}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={confirmRemove}
            hitSlop={8}
          >
            <Text style={styles.remove}>Remove</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

/** Your computers: pair one with a code, pause or remove it. */
export default function ComputersScreen() {
  const list = useApi<{runners: RunnerSummary[]}>('/api/runners');
  const [name, setName] = useState('');
  const [added, setAdded] = useState<RunnerAdded | null>(null);
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);
  const runners = list.data?.runners ?? [];
  const waiting =
    added !== null ||
    runners.some(r => r.status === 'pairing' || r.status === 'offline');
  const reload = list.reload;

  // While one is pairing or offline, check now and then if it came online.
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => void reload(), 3000);
    return () => clearInterval(timer);
  }, [waiting, reload]);

  async function add() {
    setIsAdding(true);
    setError(undefined);
    try {
      setAdded(
        await apiJson<RunnerAdded>('/api/runners', {
          method: 'POST',
          body: {name},
        }),
      );
      setName('');
      await reload();
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsAdding(false);
    }
  }

  const pairedNow = added && runners.find(r => r.id === added.runner.id);
  const commands = added
    ? `pnpm runner pair ${added.code}\npnpm runner start --folder ~/code/my-project`
    : '';

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
          The Runner lets your characters work on your own computer: read and
          write files, run commands, or think with Claude Code and Codex. It
          only works inside the folders you share, and you can pause it any
          time.
        </Text>

        <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.title}>
            Add a computer
          </Text>
          <TextField
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="MacBook"
            maxLength={40}
          />
          {error ? <Text style={styles.alert}>{error}</Text> : null}
          <Button
            label="Add computer"
            variant="secondary"
            isLoading={isAdding}
            disabled={!name.trim()}
            onPress={() => void add()}
          />
          {added && (
            <View style={styles.folders}>
              {pairedNow && pairedNow.status !== 'pairing' ? (
                <Text style={styles.text}>
                  ✓ {pairedNow.name} is paired.
                  {pairedNow.status === 'online'
                    ? ' It is online.'
                    : ' Start the Runner with the folders to share.'}
                </Text>
              ) : (
                <Text style={styles.text}>
                  On {added.runner.name}, in the Binary repo, run these two
                  commands. The code works once, for 10 minutes.
                </Text>
              )}
              <Text selectable style={styles.code}>
                {commands}
              </Text>
              <Button
                label="Share the commands"
                variant="secondary"
                onPress={() => void Share.share({message: commands})}
              />
            </View>
          )}
        </View>

        <Text accessibilityRole="header" style={styles.section}>
          Paired
        </Text>
        {!list.data ? (
          list.error ? (
            <Text style={styles.alert}>{list.error}</Text>
          ) : (
            <ActivityIndicator color={colors.accent} />
          )
        ) : runners.length === 0 ? (
          <Text style={styles.muted}>No computers yet.</Text>
        ) : (
          runners.map(runner => (
            <RunnerCard
              key={runner.id}
              runner={runner}
              onChanged={() => void reload()}
            />
          ))
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
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
  row: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  grow: {flex: 1},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  section: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  text: {color: colors.text, fontSize: fontSize.sm, lineHeight: 20},
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  status: {color: colors.textMuted, fontSize: fontSize.sm},
  folders: {gap: spacing.xs},
  mono: {color: colors.text, fontFamily: MONO, fontSize: fontSize.xs},
  code: {
    color: colors.text,
    fontFamily: MONO,
    fontSize: fontSize.xs,
    lineHeight: 18,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  remove: {color: colors.textMuted, fontSize: fontSize.sm},
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
