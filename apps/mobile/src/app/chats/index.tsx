import type {ThreadSummary} from '@binary/shared';
import {colors, fontSize, spacing} from '@binary/shared';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
} from 'react-native';

import {ThreadList} from '@/components/thread-list';
import {useApi} from '@/hooks/use-api';

/** Every saved chat, newest first. */
export default function ChatsScreen() {
  const threads = useApi<{threads: ThreadSummary[]}>('/api/threads');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void threads.reload()}
          tintColor={colors.accent}
        />
      }
    >
      {threads.error ? (
        <Text style={styles.error}>{threads.error}</Text>
      ) : !threads.data ? (
        <ActivityIndicator color={colors.accent} />
      ) : threads.data.threads.length === 0 ? (
        <Text style={styles.muted}>
          No chats yet. Pick someone from your crew to start one.
        </Text>
      ) : (
        <ThreadList
          threads={threads.data.threads}
          onDeleted={() => void threads.reload()}
        />
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, paddingBottom: spacing.xxxl},
  muted: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  error: {color: colors.danger, fontSize: fontSize.sm},
});
