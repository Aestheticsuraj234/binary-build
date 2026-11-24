import type {ProviderKeyStatus, ThreadDetail} from '@binary/shared';
import {colors, fontSize, spacing} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
import {useEffect, useState} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {CharacterFace} from '@/components/character-face';
import {Chat} from '@/components/chat';
import {ApiError, apiJson} from '@/lib/api';
import {useApi} from '@/hooks/use-api';

/** A saved chat, picked up where you left off. */
export default function SavedChatScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  // Loaded once: reloading on focus would reset a chat in progress.
  const [detail, setDetail] = useState<ThreadDetail>();
  const [error, setError] = useState<string>();
  useEffect(() => {
    let isCurrent = true;
    apiJson<ThreadDetail>(`/api/threads/${id}`)
      .then(body => isCurrent && setDetail(body))
      .catch((caught: unknown) => {
        if (!isCurrent) {
          return;
        }
        setError(
          caught instanceof ApiError && caught.status === 404
            ? "This chat doesn't exist, or it isn't yours."
            : caught instanceof Error
              ? caught.message
              : String(caught),
        );
      });
    return () => {
      isCurrent = false;
    };
  }, [id]);
  const keys = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');

  if (!detail || !keys.data) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{title: ''}} />
        {error || keys.error ? (
          <>
            <CharacterFace character="pebble" mood="thinking" size={96} />
            <Text style={styles.muted}>{error ?? keys.error}</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const {agent, thread, messages, isFired} = detail;
  const hasKey = keys.data.keys.some(
    key => key.connected && key.provider === agent.provider,
  );
  return (
    <Chat
      key={thread.id}
      agent={agent}
      hasKey={hasKey}
      thread={thread}
      initialMessages={messages}
      isFired={isFired}
      initialComputers={detail.computers}
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
  muted: {color: colors.textMuted, fontSize: fontSize.sm, textAlign: 'center'},
});
