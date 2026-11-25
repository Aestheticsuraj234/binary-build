import type {AgentSummary} from '@binary/shared';
import {colors} from '@binary/shared';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {RoomForm} from '@/components/room-form';
import {useApi} from '@/hooks/use-api';

/** Start a room: pick 2 to 6 characters, how they answer, and a lead. */
export default function NewRoomScreen() {
  const crew = useApi<{agents: AgentSummary[]}>('/api/agents');
  if (!crew.data) {
    return (
      <View style={styles.center}>
        {crew.error ? (
          <Text style={styles.error}>{crew.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }
  return <RoomForm crew={crew.data.agents} />;
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
