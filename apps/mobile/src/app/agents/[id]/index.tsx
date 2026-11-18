import type {AgentSummary, ProviderKeyStatus} from '@binary/shared';
import {colors, fontSize, spacing} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {CharacterFace} from '@/components/character-face';
import {Chat} from '@/components/chat';
import {useApi} from '@/hooks/use-api';

/** A new chat with one of your agents. It's saved with the first message. */
export default function NewChatScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const agent = useApi<{agent: AgentSummary}>(`/api/agents/${id}`);
  const keys = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');

  if (!agent.data || !keys.data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{title: ''}} />
        {agent.error || keys.error ? (
          <>
            <CharacterFace character="pebble" mood="thinking" size={96} />
            <Text style={styles.muted}>{agent.error ?? keys.error}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const current = agent.data.agent;
  const hasKey = keys.data.keys.some(
    key => key.connected && key.provider === current.provider,
  );
  return (
    <Chat
      key={current.id}
      agent={current}
      hasKey={hasKey}
      thread={null}
      initialMessages={[]}
      isFired={false}
    />
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
});
