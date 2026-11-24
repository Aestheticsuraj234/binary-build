import type {
  AgentSummary,
  RoutineSaved,
  RoutinesOverview,
} from '@binary/shared';
import {colors, fontSize, spacing} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import {Button} from '@/components/button';
import {SecretCard} from '@/components/routine-parts';
import {RoutineForm} from '@/components/routine-form';
import {useApi} from '@/hooks/use-api';

/** Creates a routine. A new webhook secret is shown here, once. */
export default function NewRoutineScreen() {
  const router = useRouter();
  const agents = useApi<{agents: AgentSummary[]}>('/api/agents');
  const overview = useApi<RoutinesOverview>('/api/routines');
  const [created, setCreated] = useState<RoutineSaved | null>(null);

  function open(id: string) {
    router.replace(`/routines/${id}`);
  }

  let body;
  if (created?.webhookSecret) {
    body = (
      <>
        <Text style={styles.intro}>
          {created.routine.name} is ready. Its webhook needs this secret.
        </Text>
        <SecretCard secret={created.webhookSecret} />
        <Button
          label="I've saved it, open the routine"
          onPress={() => open(created.routine.id)}
        />
      </>
    );
  } else if (agents.error ?? overview.error) {
    body = <Text style={styles.error}>{agents.error ?? overview.error}</Text>;
  } else if (!agents.data || !overview.data) {
    body = <ActivityIndicator color={colors.accent} />;
  } else if (agents.data.agents.length === 0) {
    body = (
      <Text style={styles.intro}>
        A routine needs someone to run it. Hire a character first.
      </Text>
    );
  } else {
    body = (
      <RoutineForm
        mode="create"
        agents={agents.data.agents}
        timeZone={overview.data.timeZone}
        schedulesEnabled={overview.data.schedulesEnabled}
        onTimeZoneChanged={() => void overview.reload()}
        onSaved={saved =>
          saved.webhookSecret ? setCreated(saved) : open(saved.routine.id)
        }
      />
    );
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
      >
        {body}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  error: {color: colors.danger, fontSize: fontSize.sm},
});
