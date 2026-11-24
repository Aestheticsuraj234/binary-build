import type {RoutineRun, RunStatus} from '@binary/shared';
import {
  colors,
  detectTimeZone,
  fontSize,
  fontWeight,
  radius,
  RUN_SOURCE_LABELS,
  RUN_STATUS_LABELS,
  runDuration,
  spacing,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {ApiError, apiJson} from '@/lib/api';

/** "Nov 24, 9:00 AM" in the person's time zone. */
export function formatRunDate(iso: string, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: timeZone ?? 'UTC',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleString();
  }
}

const STATUS_COLOR: Record<RunStatus, string> = {
  queued: colors.textMuted,
  running: colors.textMuted,
  done: colors.accent,
  failed: colors.danger,
};

/** Queued, Running, Done or Failed, as a small pill. */
export function RunStatusBadge({status}: {status: RunStatus}) {
  return (
    <View
      style={[styles.badge, status === 'failed' && styles.badgeFailed]}
      accessibilityLabel={RUN_STATUS_LABELS[status]}
    >
      {status === 'running' && (
        <ActivityIndicator size="small" color={colors.textMuted} />
      )}
      <Text style={[styles.badgeText, {color: STATUS_COLOR[status]}]}>
        {status === 'done' ? '✓ ' : ''}
        {RUN_STATUS_LABELS[status]}
      </Text>
    </View>
  );
}

/**
 * Saves the phone's time zone the first time Routines opens, so "9:00"
 * means 9:00 where the person is.
 */
export async function saveDetectedTimeZone(): Promise<void> {
  await apiJson('/api/settings', {
    method: 'PUT',
    body: {timeZone: detectTimeZone()},
  });
}

/** "Times use Asia/Calcutta", with a way to switch to this phone's zone. */
export function TimeZoneNote({
  timeZone,
  schedulesEnabled,
  windowMinutes,
  onChanged,
}: {
  timeZone: string | null;
  schedulesEnabled: boolean;
  windowMinutes: number | null;
  onChanged: () => void;
}) {
  const here = detectTimeZone();
  const shown = timeZone ?? here;
  // Intl may spell the same zone differently ("Asia/Kolkata"); compare
  // the offsets the two names give right now.
  const sameAsHere =
    formatRunDate(new Date().toISOString(), shown) ===
    formatRunDate(new Date().toISOString(), here);

  async function switchToHere() {
    try {
      await saveDetectedTimeZone();
      onChanged();
    } catch (caught) {
      Alert.alert(
        "Couldn't change the time zone",
        caught instanceof Error ? caught.message : String(caught),
      );
    }
  }

  return (
    <View style={styles.note}>
      <Text style={styles.noteText}>Times use {shown}.</Text>
      {!sameAsHere && (
        <Pressable
          accessibilityRole="button"
          onPress={() => void switchToHere()}
        >
          <Text style={styles.link}>
            Use this phone&apos;s time zone ({here})
          </Text>
        </Pressable>
      )}
      {!schedulesEnabled && (
        <Text style={styles.noteText}>
          Saved, but schedules only fire when Trigger.dev is connected.
        </Text>
      )}
      {schedulesEnabled && windowMinutes !== null && (
        <Text style={styles.noteText}>
          Your Trigger.dev plan starts scheduled runs within {windowMinutes}{' '}
          minutes after the time, not exactly on it.
        </Text>
      )}
    </View>
  );
}

/** A new webhook secret, shown once, with a Share button to copy it out. */
export function SecretCard({secret}: {secret: string}) {
  return (
    <View style={styles.secret}>
      <Text style={styles.secretTitle}>Your webhook secret</Text>
      <Text selectable style={styles.mono}>
        {secret}
      </Text>
      <Text style={styles.noteText}>
        Copy it now: it&apos;s shown only once. Binary keeps just a hash of it.
      </Text>
      <Button
        label="Share or copy"
        variant="secondary"
        onPress={() => void Share.share({message: secret})}
      />
    </View>
  );
}

/** The webhook's URL and a way to make a new secret. */
export function WebhookSection({
  routineId,
  url,
  secret,
  onNewSecret,
}: {
  routineId: string;
  url: string;
  secret: string | null;
  onNewSecret: (secret: string) => void;
}) {
  const [isBusy, setIsBusy] = useState(false);

  function confirmNewSecret() {
    Alert.alert('Make a new secret?', 'The old secret stops working.', [
      {text: 'Keep it', style: 'cancel'},
      {
        text: 'Make a new one',
        onPress: () => {
          setIsBusy(true);
          apiJson<{webhookSecret: string}>(
            `/api/routines/${routineId}/webhook-secret`,
            {method: 'POST'},
          )
            .then(saved => onNewSecret(saved.webhookSecret))
            .catch((caught: unknown) =>
              Alert.alert(
                "Couldn't make a new secret",
                caught instanceof ApiError ? caught.message : String(caught),
              ),
            )
            .finally(() => setIsBusy(false));
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Webhook
      </Text>
      <Text selectable numberOfLines={2} style={styles.mono}>
        {url}
      </Text>
      {secret ? (
        <SecretCard secret={secret} />
      ) : (
        <Text style={styles.noteText}>
          The secret was shown once when the webhook was turned on. Send it as
          &quot;Authorization: Bearer whsec_…&quot;. The body reaches the
          character as data, never as instructions.
        </Text>
      )}
      <Button
        label="New secret"
        variant="secondary"
        isLoading={isBusy}
        onPress={confirmNewSecret}
      />
    </View>
  );
}

/** Runs, newest first. A run with a transcript opens it. */
export function RunList({
  runs,
  timeZone,
}: {
  runs: RoutineRun[];
  timeZone: string | null;
}) {
  const router = useRouter();
  if (runs.length === 0) {
    return (
      <Text style={styles.empty}>No runs yet. Tap Run now to try it.</Text>
    );
  }
  return (
    <View style={styles.runs}>
      {runs.map(run => {
        const duration = runDuration(run);
        const open = run.threadId
          ? () => router.push(`/chats/${run.threadId}`)
          : undefined;
        return (
          <Pressable
            key={run.id}
            accessibilityRole={open ? 'link' : undefined}
            accessibilityHint={open ? 'Opens the transcript' : undefined}
            disabled={!open}
            onPress={open}
            style={({pressed}) => [styles.run, pressed && styles.runPressed]}
          >
            <View style={styles.runRow}>
              <RunStatusBadge status={run.status} />
              <Text style={styles.runDate}>
                {formatRunDate(run.createdAt, timeZone)}
              </Text>
              {duration && <Text style={styles.runMeta}>{duration}</Text>}
            </View>
            <View style={styles.runRow}>
              <Text style={styles.runMeta}>
                {RUN_SOURCE_LABELS[run.source]}
              </Text>
              {open && <Text style={styles.link}>Transcript →</Text>}
            </View>
            {run.error ? <Text style={styles.error}>{run.error}</Text> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  badgeFailed: {
    borderColor: colors.danger,
    backgroundColor: colors.dangerSurface,
  },
  badgeText: {fontSize: fontSize.xs, fontWeight: fontWeight.medium},
  note: {gap: spacing.xs},
  noteText: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  link: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  secret: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    padding: spacing.lg,
  },
  secretTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  mono: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
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
  runs: {gap: spacing.sm},
  run: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  runPressed: {backgroundColor: colors.surfaceRaised},
  runRow: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  runDate: {color: colors.text, fontSize: fontSize.sm, flex: 1},
  runMeta: {color: colors.textMuted, fontSize: fontSize.xs, flex: 1},
  error: {color: colors.danger, fontSize: fontSize.sm},
});
