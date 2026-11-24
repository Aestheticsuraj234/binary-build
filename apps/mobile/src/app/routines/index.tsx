import type {RoutineSummary, RoutinesOverview} from '@binary/shared';
import {
  colors,
  describeSchedule,
  fontSize,
  fontWeight,
  radius,
  spacing,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useEffect, useRef} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {CharacterFace} from '@/components/character-face';
import {
  formatRunDate,
  RunStatusBadge,
  saveDetectedTimeZone,
} from '@/components/routine-parts';
import {useApi} from '@/hooks/use-api';

function RoutineCard({
  routine,
  timeZone,
}: {
  routine: RoutineSummary;
  timeZone: string | null;
}) {
  const router = useRouter();
  const chips = [
    routine.cron ? describeSchedule(routine.cron) : null,
    routine.webhook ? 'Webhook' : null,
  ].filter(Boolean);
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(`/routines/${routine.id}`)}
      style={({pressed}) => [styles.card, pressed && styles.cardPressed]}
    >
      <CharacterFace character={routine.avatar} size={44} animated={false} />
      <View style={styles.cardBody}>
        <View style={styles.titleRow}>
          <Text numberOfLines={1} style={styles.cardTitle}>
            {routine.name}
          </Text>
          <Text style={styles.onOff}>{routine.enabled ? 'On' : 'Off'}</Text>
        </View>
        <Text style={styles.muted}>
          {[routine.agentName, ...chips].join(' · ')}
        </Text>
        {routine.lastRun && (
          <View style={styles.lastRun}>
            <RunStatusBadge status={routine.lastRun.status} />
            <Text style={styles.muted}>
              {formatRunDate(routine.lastRun.createdAt, timeZone)}
            </Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

/** Routines: jobs characters do on a schedule, by webhook, or on demand. */
export default function RoutinesScreen() {
  const router = useRouter();
  const overview = useApi<RoutinesOverview>('/api/routines');
  const savedZone = useRef(false);
  const timeZone = overview.data?.timeZone;

  // The first visit saves this phone's time zone for schedules.
  useEffect(() => {
    if (timeZone === null && !savedZone.current) {
      savedZone.current = true;
      void saveDetectedTimeZone()
        .then(() => overview.reload())
        .catch(() => {});
    }
  }, [timeZone, overview]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void overview.reload()}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.intro}>
        Jobs your characters do again and again: on a schedule, when a webhook
        calls, or when you tap Run now.
      </Text>
      <Button
        label="New routine"
        onPress={() => router.push('/routines/new')}
      />
      {overview.error ? (
        <Text style={styles.alert}>{overview.error}</Text>
      ) : !overview.data ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          {!overview.data.schedulesEnabled && (
            <Text style={styles.warning}>
              Trigger.dev is not connected, so schedules are saved but
              won&apos;t fire, and runs happen inside the API. Run now and
              webhooks work.
            </Text>
          )}
          {overview.data.routines.length === 0 ? (
            <Text style={styles.empty}>
              No routines yet. Try &ldquo;every weekday at 9:00, plan my
              day&rdquo;.
            </Text>
          ) : (
            overview.data.routines.map(routine => (
              <RoutineCard
                key={routine.id}
                routine={routine}
                timeZone={overview.data!.timeZone}
              />
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardPressed: {backgroundColor: colors.surfaceRaised},
  cardBody: {flex: 1, gap: spacing.xs},
  titleRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.sm},
  cardTitle: {
    flexShrink: 1,
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  onOff: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  lastRun: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  warning: {
    color: colors.warning,
    fontSize: fontSize.sm,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.warning,
    borderRadius: radius.md,
    backgroundColor: colors.warningSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
  empty: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
    padding: spacing.lg,
  },
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
