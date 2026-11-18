import type {ThreadSummary} from '@binary/shared';
import {
  characterOf,
  colors,
  fontSize,
  fontWeight,
  radius,
  spacing,
} from '@binary/shared';
import {Link} from 'expo-router';
import {Alert, Pressable, StyleSheet, Text, View} from 'react-native';

import {CharacterFace} from '@/components/character-face';
import {apiJson} from '@/lib/api';

/** "Today", "Yesterday" or a short date. */
function whenOf(iso: string): string {
  const date = new Date(iso);
  const days = Math.floor(
    (new Date().setHours(0, 0, 0, 0) - new Date(iso).setHours(0, 0, 0, 0)) /
      86_400_000,
  );
  if (days <= 0) {
    return date.toLocaleTimeString(undefined, {
      hour: 'numeric',
      minute: '2-digit',
    });
  }
  if (days === 1) {
    return 'Yesterday';
  }
  return date.toLocaleDateString(undefined, {month: 'short', day: 'numeric'});
}

/** Asks first, then deletes a chat. Calls `onDeleted` once it's gone. */
function confirmDelete(thread: ThreadSummary, onDeleted: () => void) {
  Alert.alert(
    `Delete “${thread.title ?? 'this chat'}”?`,
    "This can't be undone.",
    [
      {text: 'Keep', style: 'cancel'},
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          apiJson(`/api/threads/${thread.id}`, {method: 'DELETE'})
            .then(onDeleted)
            .catch((error: unknown) =>
              Alert.alert(
                "Couldn't delete the chat",
                error instanceof Error ? error.message : String(error),
              ),
            );
        },
      },
    ],
  );
}

/**
 * Saved chats, newest first. Tap one to pick it up; the bin button (or a
 * long press) deletes it.
 */
export function ThreadList({
  threads,
  onDeleted,
}: {
  threads: ThreadSummary[];
  onDeleted: () => void;
}) {
  return (
    <View style={styles.list}>
      {threads.map(thread => {
        const title = thread.title ?? 'New chat';
        return (
          <View key={thread.id} style={styles.row}>
            <Link href={`/chats/${thread.id}`} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityLabel={`${title}, with ${thread.agentName}`}
                onLongPress={() => confirmDelete(thread, onDeleted)}
                style={({pressed}) => [styles.open, pressed && styles.pressed]}
              >
                <View
                  style={[
                    styles.face,
                    {backgroundColor: characterOf(thread.avatar).tint},
                  ]}
                >
                  <CharacterFace
                    character={thread.avatar}
                    size={34}
                    animated={false}
                  />
                </View>
                <View style={styles.text}>
                  <Text numberOfLines={1} style={styles.title}>
                    {title}
                  </Text>
                  <Text numberOfLines={1} style={styles.meta}>
                    {thread.agentName} · {whenOf(thread.updatedAt)}
                  </Text>
                </View>
              </Pressable>
            </Link>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Delete chat “${title}”`}
              onPress={() => confirmDelete(thread, onDeleted)}
              hitSlop={6}
              style={({pressed}) => [styles.delete, pressed && styles.pressed]}
            >
              <Text style={styles.deleteText}>🗑</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  open: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingLeft: spacing.md,
  },
  pressed: {backgroundColor: colors.surfaceRaised},
  face: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {flex: 1, gap: 2},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  meta: {color: colors.textMuted, fontSize: fontSize.sm},
  delete: {
    width: 48,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: {fontSize: fontSize.md, opacity: 0.7},
});
