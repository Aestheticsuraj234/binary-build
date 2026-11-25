import type {AgentSummary, RoomDetail} from '@binary/shared';
import {colors} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {RoomForm} from '@/components/room-form';
import {useApi} from '@/hooks/use-api';

/** Edit a room, or delete it. Changes apply to the next message. */
export default function EditRoomScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const detail = useApi<RoomDetail>(`/api/rooms/${id}`);
  const crew = useApi<{agents: AgentSummary[]}>('/api/agents');
  if (!detail.data || !crew.data) {
    return (
      <View style={styles.center}>
        {detail.error || crew.error ? (
          <Text style={styles.error}>{detail.error ?? crew.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }
  return (
    <>
      <Stack.Screen options={{title: `Edit ${detail.data.room.name}`}} />
      <RoomForm crew={crew.data.agents} room={detail.data.room} />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  error: {color: colors.danger},
});
