import type {AgentSummary, RoomMode, RoomSummary} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  ROOM_MAX_MEMBERS,
  ROOM_MODE_INFO,
  ROOM_MODES,
  ROOM_NAME_MAX_LENGTH,
  roomInputSchema,
  spacing,
  validate,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useState} from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {CharacterFace} from '@/components/character-face';
import {TextField} from '@/components/text-field';
import {ApiError, apiJson} from '@/lib/api';

/**
 * Create or edit a room: a name, 2 to 6 characters, how it answers and a
 * lead. Editing also offers Delete; the characters stay either way.
 */
export function RoomForm({
  crew,
  room,
}: {
  crew: AgentSummary[];
  room?: RoomSummary;
}) {
  const router = useRouter();
  const [name, setName] = useState(room?.name ?? '');
  const [mode, setMode] = useState<RoomMode>(room?.mode ?? 'mention');
  const [agentIds, setAgentIds] = useState<string[]>(
    room?.members.filter(m => !m.isFired).map(m => m.id) ?? [],
  );
  const [leadAgentId, setLeadAgentId] = useState(room?.leadAgentId ?? '');
  const [error, setError] = useState<string>();
  const [isSaving, setIsSaving] = useState(false);
  const lead = agentIds.includes(leadAgentId) ? leadAgentId : agentIds[0];

  function toggle(id: string) {
    setError(undefined);
    setAgentIds(current =>
      current.includes(id)
        ? current.filter(other => other !== id)
        : current.length < ROOM_MAX_MEMBERS
          ? [...current, id]
          : current,
    );
  }

  async function save() {
    const checked = validate(roomInputSchema, {
      name,
      mode,
      agentIds,
      leadAgentId: lead ?? '',
    });
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsSaving(true);
    try {
      const {room: saved} = await apiJson<{room: RoomSummary}>(
        room ? `/api/rooms/${room.id}` : '/api/rooms',
        {method: room ? 'PATCH' : 'POST', body: checked.data},
      );
      if (room) {
        router.back();
      } else {
        router.replace(`/rooms/${saved.id}`);
      }
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsSaving(false);
    }
  }

  function confirmDelete() {
    if (!room) return;
    Alert.alert(
      `Delete ${room.name}?`,
      'Its conversation goes; its characters stay.',
      [
        {text: 'Keep it', style: 'cancel'},
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            apiJson(`/api/rooms/${room.id}`, {method: 'DELETE'})
              .then(() => router.dismissTo('/rooms'))
              .catch((caught: unknown) =>
                Alert.alert(
                  "Couldn't delete it",
                  caught instanceof Error ? caught.message : String(caught),
                ),
              );
          },
        },
      ],
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
        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="Launch team"
          maxLength={ROOM_NAME_MAX_LENGTH}
        />

        <Text style={styles.label}>
          Characters ({agentIds.length} of 2–{ROOM_MAX_MEMBERS})
        </Text>
        {crew.length < 2 ? (
          <Text style={styles.muted}>
            A room needs at least two characters. Hire another one first.
          </Text>
        ) : (
          <View style={styles.list}>
            {crew.map(agent => {
              const picked = agentIds.includes(agent.id);
              const isLead = picked && agent.id === lead;
              return (
                <View key={agent.id} style={styles.member}>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{checked: picked}}
                    onPress={() => toggle(agent.id)}
                    style={styles.memberMain}
                  >
                    <View style={[styles.box, picked && styles.boxOn]}>
                      {picked ? <Text style={styles.tick}>✓</Text> : null}
                    </View>
                    <CharacterFace
                      character={agent.avatar}
                      size={32}
                      animated={false}
                    />
                    <View style={styles.grow}>
                      <Text numberOfLines={1} style={styles.title}>
                        {agent.name}
                      </Text>
                      <Text numberOfLines={1} style={styles.muted}>
                        {agent.role}
                      </Text>
                    </View>
                  </Pressable>
                  {picked && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{selected: isLead}}
                      accessibilityLabel={
                        isLead
                          ? `${agent.name} leads`
                          : `Make ${agent.name} the lead`
                      }
                      onPress={() => setLeadAgentId(agent.id)}
                      hitSlop={8}
                    >
                      <Text style={[styles.lead, isLead && styles.leadOn]}>
                        {isLead ? 'Lead' : 'Make lead'}
                      </Text>
                    </Pressable>
                  )}
                </View>
              );
            })}
          </View>
        )}

        <Text style={styles.label}>Who answers</Text>
        <View accessibilityRole="radiogroup" style={styles.modes}>
          {ROOM_MODES.map(option => (
            <Pressable
              key={option}
              accessibilityRole="radio"
              accessibilityState={{checked: mode === option}}
              onPress={() => setMode(option)}
              style={[styles.mode, mode === option && styles.modeOn]}
            >
              <Text style={styles.title}>{ROOM_MODE_INFO[option].label}</Text>
              <Text style={styles.muted}>
                {ROOM_MODE_INFO[option].description}
              </Text>
            </Pressable>
          ))}
        </View>

        {error ? <Text style={styles.alert}>{error}</Text> : null}
        <Button
          label={room ? 'Save changes' : 'Create room'}
          isLoading={isSaving}
          disabled={crew.length < 2}
          onPress={() => void save()}
        />
        {room && (
          <Button
            label="Delete room"
            variant="danger"
            onPress={confirmDelete}
          />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  label: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  list: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  member: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  memberMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: {backgroundColor: colors.accent, borderColor: colors.accent},
  tick: {
    color: colors.onAccent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
  },
  grow: {flex: 1},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  lead: {color: colors.textMuted, fontSize: fontSize.sm},
  leadOn: {color: colors.accent, fontWeight: fontWeight.semibold},
  modes: {gap: spacing.sm},
  mode: {
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  modeOn: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  alert: {
    color: colors.danger,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
