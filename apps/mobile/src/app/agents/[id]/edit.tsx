import type {AgentSummary, ProviderKeyStatus} from '@binary/shared';
import {characterOf, colors, getProvider, spacing} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {AgentForm} from '@/components/agent-form';
import {NeedsKey} from '@/components/needs-key';
import {useApi} from '@/hooks/use-api';

/** Edit an agent. Changes apply to its very next answer. */
export default function EditAgentScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const agent = useApi<{agent: AgentSummary}>(`/api/agents/${id}`);
  const keys = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');

  if (!agent.data || !keys.data) {
    return (
      <View style={styles.center}>
        {agent.error || keys.error ? (
          <Text style={styles.error}>{agent.error ?? keys.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const current = agent.data.agent;
  const providers = keys.data.keys
    .filter(k => k.connected)
    .map(k => k.provider);
  const title = `Edit ${current.name}`;

  if (providers.length === 0) {
    return (
      <View style={styles.padded}>
        <Stack.Screen options={{title}} />
        <NeedsKey message={`${current.name} needs a key to think with.`} />
      </View>
    );
  }

  // If the agent's provider lost its key, start on one that has a key.
  const provider =
    current.provider && providers.includes(current.provider)
      ? current.provider
      : providers[0]!;
  const model =
    provider === current.provider && current.model
      ? current.model
      : getProvider(provider).defaultModel;

  return (
    <>
      <Stack.Screen options={{title}} />
      <AgentForm
        mode="edit"
        agentId={current.id}
        connectedProviders={providers}
        initial={{
          name: current.name,
          role: current.role,
          instructions: current.instructions,
          avatar: characterOf(current.avatar).id,
          provider,
          model,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  padded: {flex: 1, padding: spacing.xl, backgroundColor: colors.background},
  error: {color: colors.danger, textAlign: 'center'},
});
