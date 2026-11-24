import type {ApprovalSummary, TodayOverview} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  readableToolName,
  runDuration,
  spacing,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {CharacterFace} from '@/components/character-face';
import {formatRunDate, RunStatusBadge} from '@/components/routine-parts';
import {DecisionButtons, RiskBadge} from '@/components/tools';
import {useApi} from '@/hooks/use-api';
import {decideRequest} from '@/lib/approvals';

/** The most of a request's input shown on its card. */
const MAX_INPUT_CHARS = 1500;

function inputText(input: unknown): string {
  const text = JSON.stringify(input ?? null, null, 2);
  return text.length > MAX_INPUT_CHARS
    ? `${text.slice(0, MAX_INPUT_CHARS)}\n…`
    : text;
}

function ApprovalCard({
  approval,
  onDecided,
}: {
  approval: ApprovalSummary;
  onDecided: (text: string) => void;
}) {
  const router = useRouter();
  const tool = readableToolName(approval.toolName);

  async function decide(decision: 'approve' | 'reject') {
    const result = await decideRequest(approval.id, decision);
    if (!result.ok) {
      return result.message;
    }
    const {status} = result.decided.approval;
    onDecided(
      status === 'rejected'
        ? `You rejected ${tool}.`
        : status === 'done'
          ? `You approved ${tool}. ${approval.agentName} replied in the chat.`
          : `You approved ${tool}, but it failed.`,
    );
    return undefined;
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <CharacterFace character={approval.avatar} size={40} animated={false} />
        <View style={styles.cardTitle}>
          <Text style={styles.text}>
            <Text style={styles.strong}>{approval.agentName}</Text>
            <Text style={styles.muted}> wants to </Text>
            <Text style={styles.strong}>{tool}</Text>
          </Text>
          <View style={styles.meta}>
            <RiskBadge risk={approval.risk} />
            <Text style={styles.small}>
              {formatRunDate(approval.createdAt, null)}
              {approval.routineName ? ` · ${approval.routineName}` : ''}
            </Text>
          </View>
        </View>
      </View>
      <ScrollView horizontal style={styles.code}>
        <Text selectable style={styles.codeText}>
          {inputText(approval.input)}
        </Text>
      </ScrollView>
      <DecisionButtons
        onDecide={decide}
        label="Approving runs exactly this, once."
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push(`/chats/${approval.threadId}`)}
      >
        <Text style={styles.link}>Open the chat →</Text>
      </Pressable>
    </View>
  );
}

/** Today: requests waiting for you, and recent routine runs. */
export default function TodayScreen() {
  const router = useRouter();
  const today = useApi<TodayOverview>('/api/today');
  const [decided, setDecided] = useState<Record<string, string>>({});

  if (today.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>{today.error}</Text>
      </View>
    );
  }
  if (!today.data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  const {waiting, recentRuns} = today.data;

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => {
            setDecided({});
            void today.reload();
          }}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.intro}>
        What your characters need from you, and what they did on their own.
      </Text>

      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Waiting for you
      </Text>
      {waiting.length === 0 ? (
        <Text style={styles.empty}>Nothing needs your OK right now.</Text>
      ) : (
        waiting.map(approval =>
          decided[approval.id] ? (
            <Text key={approval.id} style={styles.decided}>
              {decided[approval.id]}
            </Text>
          ) : (
            <ApprovalCard
              key={approval.id}
              approval={approval}
              onDecided={text =>
                setDecided(current => ({...current, [approval.id]: text}))
              }
            />
          ),
        )
      )}

      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Routine runs
      </Text>
      {recentRuns.length === 0 ? (
        <Text style={styles.empty}>No routine ran in the last 24 hours.</Text>
      ) : (
        recentRuns.map(run => {
          const duration = runDuration(run);
          return (
            <Pressable
              key={run.id}
              accessibilityRole="link"
              onPress={() =>
                run.threadId
                  ? router.push(`/chats/${run.threadId}`)
                  : router.push(`/routines/${run.routineId}`)
              }
              style={({pressed}) => [styles.run, pressed && styles.pressed]}
            >
              <CharacterFace
                character={run.avatar}
                size={28}
                animated={false}
              />
              <View style={styles.runText}>
                <Text style={styles.strong}>{run.routineName}</Text>
                <Text style={styles.small}>
                  {formatRunDate(run.createdAt, null)}
                  {duration ? ` · ${duration}` : ''}
                </Text>
              </View>
              <RunStatusBadge status={run.status} />
            </Pressable>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.md,
  },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardHeader: {flexDirection: 'row', gap: spacing.md},
  cardTitle: {flex: 1, gap: spacing.xs},
  meta: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  text: {fontSize: fontSize.sm},
  strong: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  small: {color: colors.textMuted, fontSize: fontSize.xs},
  code: {
    maxHeight: 160,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  codeText: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  link: {color: colors.accent, fontSize: fontSize.sm},
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
  decided: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  run: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  runText: {flex: 1, gap: 2},
  pressed: {backgroundColor: colors.surfaceRaised},
});
