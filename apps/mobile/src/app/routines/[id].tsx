import type {
  AgentSummary,
  RoutineDetail,
  RoutineRun,
  RoutineSaved,
} from '@binary/shared';
import {
  colors,
  DEFAULT_APPROVAL_MODE,
  describeSchedule,
  fontSize,
  fontWeight,
  spacing,
} from '@binary/shared';
import {Stack, useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {CharacterFace} from '@/components/character-face';
import {RunList, SecretCard, WebhookSection} from '@/components/routine-parts';
import {RoutineForm} from '@/components/routine-form';
import {useApi} from '@/hooks/use-api';
import {apiJson} from '@/lib/api';

/** How often the screen checks on runs that haven't finished. */
const POLL_MS = 1500;

const isActive = (run: RoutineRun) =>
  run.status === 'queued' || run.status === 'running';

/** One routine: Run now, its runs, its settings and its webhook. */
export default function RoutineScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const router = useRouter();
  const agents = useApi<{agents: AgentSummary[]}>('/api/agents');
  // Loads on focus, so coming back from a transcript shows fresh runs.
  const routine = useApi<RoutineDetail>(`/api/routines/${id}`);
  const detail = routine.data;
  const reload = routine.reload;
  const [secret, setSecret] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const hasActiveRun = detail?.runs.some(isActive) ?? false;
  useEffect(() => {
    if (!hasActiveRun) {
      return;
    }
    const timer = setInterval(() => void reload(), POLL_MS);
    return () => clearInterval(timer);
  }, [hasActiveRun, reload]);

  async function runNow() {
    setIsStarting(true);
    try {
      await apiJson(`/api/routines/${id}/run`, {method: 'POST'});
      await reload();
    } catch (caught) {
      Alert.alert(
        "Couldn't start a run",
        caught instanceof Error ? caught.message : String(caught),
      );
    } finally {
      setIsStarting(false);
    }
  }

  function saved(result: RoutineSaved) {
    if (result.webhookSecret) {
      setSecret(result.webhookSecret);
    } else if (!result.routine.webhook) {
      setSecret(null);
    }
    void reload();
  }

  function confirmDelete() {
    if (!detail) {
      return;
    }
    Alert.alert(
      `Delete ${detail.routine.name}?`,
      'Its schedule and webhook stop. Transcripts stay in your chats.',
      [
        {text: 'Keep it', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            apiJson(`/api/routines/${id}`, {method: 'DELETE'})
              .then(() => router.back())
              .catch((caught: unknown) =>
                Alert.alert(
                  "Couldn't delete the routine",
                  caught instanceof Error ? caught.message : String(caught),
                ),
              );
          },
        },
      ],
    );
  }

  if (!detail || !agents.data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{title: ''}} />
        {(routine.error ?? agents.error) ? (
          <Text style={styles.muted}>{routine.error ?? agents.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const {timeZone} = detail;
  const summary = detail.routine;
  // The agent that runs it stays pickable, even if it was fired since.
  const choices = agents.data.agents.some(a => a.id === summary.agentId)
    ? agents.data.agents
    : [
        {
          id: summary.agentId,
          name: `${summary.agentName} (fired)`,
          avatar: summary.avatar,
          role: '',
          instructions: '',
          provider: null,
          model: null,
          templateId: null,
          approvalMode: DEFAULT_APPROVAL_MODE,
          computer: 'none' as const,
        },
        ...agents.data.agents,
      ];

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen options={{title: summary.name}} />
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
        <View style={styles.header}>
          <CharacterFace character={summary.avatar} size={56} />
          <View style={styles.headerText}>
            <Text style={styles.title}>{summary.name}</Text>
            <Text style={styles.muted}>
              Run by {summary.agentName}
              {summary.cron
                ? ` · ${describeSchedule(summary.cron)}${timeZone ? ` (${timeZone})` : ''}`
                : ''}
              {summary.enabled ? '' : ' · Switched off'}
            </Text>
          </View>
        </View>

        <Button
          label="Run now"
          isLoading={isStarting}
          onPress={() => void runNow()}
        />
        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Runs
        </Text>
        <RunList runs={detail.runs} timeZone={timeZone} />

        <Text accessibilityRole="header" style={styles.sectionTitle}>
          Settings
        </Text>
        <RoutineForm
          key={summary.id}
          mode="edit"
          agents={choices}
          routine={summary}
          timeZone={timeZone}
          schedulesEnabled={detail.schedulesEnabled}
          onTimeZoneChanged={() => void reload()}
          onSaved={saved}
        />
        {detail.webhookUrl ? (
          <WebhookSection
            routineId={summary.id}
            url={detail.webhookUrl}
            secret={secret}
            onNewSecret={setSecret}
          />
        ) : secret ? (
          <SecretCard secret={secret} />
        ) : null}
        <Button
          label="Delete routine"
          variant="danger"
          onPress={confirmDelete}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.lg,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  header: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  headerText: {flex: 1, gap: spacing.xs},
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
});
