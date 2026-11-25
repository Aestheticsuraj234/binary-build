import type {RoomSummary} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  ROOM_MODE_INFO,
  spacing,
} from '@binary/shared';
import {useRouter} from 'expo-router';
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
import {useApi} from '@/hooks/use-api';

/** Your rooms: group chats with a small team of your characters. */
export default function RoomsScreen() {
  const router = useRouter();
  const list = useApi<{rooms: RoomSummary[]}>('/api/rooms');

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void list.reload()}
          tintColor={colors.accent}
        />
      }
    >
      <Text style={styles.intro}>
        Group chats with a small team of your characters. They answer in turn,
        build on each other and hand work over.
      </Text>
      <Button label="New room" onPress={() => router.push('/rooms/new')} />
      {!list.data ? (
        list.error ? (
          <Text style={styles.muted}>{list.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )
      ) : list.data.rooms.length === 0 ? (
        <Text style={styles.muted}>
          No rooms yet. Put two or more of your characters in a room and they
          work on one task together.
        </Text>
      ) : (
        list.data.rooms.map(room => {
          const lead = room.members.find(m => m.id === room.leadAgentId);
          return (
            <Pressable
              key={room.id}
              accessibilityRole="link"
              onPress={() => router.push(`/rooms/${room.id}`)}
              style={({pressed}) => [styles.card, pressed && styles.pressed]}
            >
              <View style={styles.faces}>
                {room.members.map((member, index) => (
                  <View
                    key={member.id}
                    style={[styles.face, index > 0 && styles.overlap]}
                  >
                    <CharacterFace
                      character={member.avatar}
                      size={32}
                      animated={false}
                    />
                  </View>
                ))}
              </View>
              <Text style={styles.title}>{room.name}</Text>
              <Text numberOfLines={1} style={styles.muted}>
                {room.title ?? room.members.map(m => m.name).join(', ')}
              </Text>
              <Text style={styles.subtle}>
                {ROOM_MODE_INFO[room.mode].label}
                {lead ? ` · ${lead.name} leads` : ''}
              </Text>
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
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  card: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  pressed: {backgroundColor: colors.surfaceRaised},
  faces: {flexDirection: 'row', marginBottom: spacing.sm},
  face: {borderRadius: radius.full, backgroundColor: colors.surface},
  overlap: {marginLeft: -spacing.sm},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  subtle: {color: colors.textSubtle, fontSize: fontSize.xs},
});
