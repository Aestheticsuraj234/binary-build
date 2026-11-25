import type {
  ChatMessage,
  RoomDetail,
  RoomEvent,
  RoomMember,
  ToolCallRecord,
} from '@binary/shared';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  colors,
  findMentions,
  fontSize,
  fontWeight,
  radius,
  readEvents,
  ROOM_MAX_ANSWERS,
  ROOM_MODE_INFO,
  spacing,
} from '@binary/shared';
import {Stack, useLocalSearchParams, useRouter} from 'expo-router';
import {useEffect, useRef, useState} from 'react';
import type {ScrollViewInstance} from 'react-native';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {CharacterFace} from '@/components/character-face';
import {Markdown} from '@/components/markdown';
import {ToolCallCard} from '@/components/tools';
import {useApi} from '@/hooks/use-api';
import {apiFetch} from '@/lib/api';
import {decideRequest} from '@/lib/approvals';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'note';
  agentId?: string | null;
  content: string;
  toolCalls: ToolCallRecord[];
  error?: string;
  isStreaming?: boolean;
}

function listNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The room's group chat, once it has loaded. */
function RoomChat({detail}: {detail: RoomDetail}) {
  const {room} = detail;
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(detail.messages);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const nextLocalId = useRef(1);
  const controllerRef = useRef<AbortController>(null);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const active = room.members.filter(m => !m.isFired);
  const byId = new Map(room.members.map(m => [m.id, m]));
  const lead = byId.get(room.leadAgentId);
  const canSend = active.length > 0;
  const mentioned = findMentions(draft, active);

  useEffect(() => () => controllerRef.current?.abort(), []);

  function localId() {
    return `local-${nextLocalId.current++}`;
  }
  function update(id: string, change: (m: Message) => Message) {
    setMessages(all => all.map(m => (m.id === id ? change(m) : m)));
  }
  function nameOf(agentId: string | null | undefined) {
    return byId.get(agentId ?? '')?.name ?? 'Someone';
  }
  function mention(member: RoomMember) {
    setDraft(current => {
      const spacer = current && !/\s$/.test(current) ? ' ' : '';
      return `${current}${spacer}@${member.name} `;
    });
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || isBusy || !canSend) return;
    const questionId = localId();
    setMessages(all => [
      ...all,
      {id: questionId, role: 'user', content: message, toolCalls: []},
    ]);
    setDraft('');
    setIsBusy(true);
    setStatus('Working out who answers…');
    const controller = new AbortController();
    controllerRef.current = controller;
    let current: string | null = null;
    const failCurrent = (reason: string) => {
      if (current) {
        const id = current;
        update(id, m => ({...m, error: reason, isStreaming: false}));
      } else {
        setMessages(all => [
          ...all,
          {
            id: localId(),
            role: 'assistant',
            content: '',
            toolCalls: [],
            error: reason,
          },
        ]);
      }
      current = null;
    };

    try {
      const response = await apiFetch(`/api/rooms/${room.id}/messages`, {
        method: 'POST',
        body: {message},
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        failCurrent(body?.message ?? 'Something went wrong. Please try again.');
      } else {
        for await (const event of readEvents<RoomEvent>(response.body)) {
          switch (event.type) {
            case 'start':
              update(questionId, m => ({...m, id: event.userMessage.id}));
              break;
            case 'routed':
              setStatus(
                `${listNames(event.agentIds.map(nameOf))} will answer.`,
              );
              break;
            case 'turn': {
              const id = localId();
              current = id;
              setStatus(`${nameOf(event.agentId)} is answering…`);
              setMessages(all => [
                ...all,
                {
                  id,
                  role: 'assistant',
                  agentId: event.agentId,
                  content: '',
                  toolCalls: [],
                  isStreaming: true,
                },
              ]);
              break;
            }
            case 'delta':
              if (current) {
                update(current, m => ({...m, content: m.content + event.text}));
              }
              break;
            case 'tool': {
              const {call} = event;
              if (current) {
                update(current, m => ({
                  ...m,
                  toolCalls: m.toolCalls.some(c => c.id === call.id)
                    ? m.toolCalls.map(c => (c.id === call.id ? call : c))
                    : [...m.toolCalls, call],
                }));
              }
              break;
            }
            case 'answer':
              if (current) {
                const id = current;
                update(id, () => ({...event.message, isStreaming: false}));
              }
              current = null;
              break;
            case 'turn-error': {
              const id = current;
              setMessages(all => [...all.filter(m => m.id !== id), event.note]);
              current = null;
              break;
            }
            case 'handoff':
              setStatus(
                `${nameOf(event.from)} handed over to ${listNames(event.agentIds.map(nameOf))}.`,
              );
              break;
            case 'error':
              failCurrent(event.message);
              break;
            case 'end':
              setStatus(
                event.capped
                  ? `Stopped at ${ROOM_MAX_ANSWERS} answers. Send another to carry on.`
                  : undefined,
              );
              break;
          }
        }
      }
    } catch {
      if (controller.signal.aborted) return;
      failCurrent('Could not reach Binary. Is the API running?');
    }
    if (current) {
      failCurrent('The answer stopped part-way.');
    }
    setIsBusy(false);
  }

  async function decide(
    call: ToolCallRecord,
    decision: 'approve' | 'reject',
  ): Promise<string | undefined> {
    if (!call.approvalId) return 'This request is missing.';
    setIsBusy(true);
    const result = await decideRequest(call.approvalId, decision);
    setIsBusy(false);
    if (!result.ok) {
      return result.alreadyDecided
        ? `${result.message} Open the room again to see what happened.`
        : result.message;
    }
    const {decided} = result;
    setMessages(all => {
      const known = new Set(all.map(m => m.id));
      const added: Message[] = [decided.note as ChatMessage];
      if (decided.reply) {
        added.push(decided.reply);
      } else if (decided.replyError) {
        added.push({
          id: localId(),
          role: 'assistant',
          agentId: decided.note.agentId,
          content: '',
          toolCalls: [],
          error: decided.replyError,
        });
      }
      return [
        ...all.map(m =>
          m.id === decided.messageId
            ? {
                ...m,
                toolCalls: m.toolCalls.map(c =>
                  c.id === decided.call.id ? decided.call : c,
                ),
              }
            : m,
        ),
        ...added.filter(m => !known.has(m.id)),
      ];
    });
    return undefined;
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: room.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/rooms/${room.id}/edit`)}
              hitSlop={8}
            >
              <Text style={styles.headerAction}>Edit</Text>
            </Pressable>
          ),
        }}
      />
      <Text style={styles.subheader}>
        {ROOM_MODE_INFO[room.mode].label} · {lead?.name ?? 'No one'} leads
      </Text>
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled"
      >
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.hello}>
              {listNames(active.map(m => m.name))} are here.
            </Text>
            <Text style={styles.muted}>
              {room.mode === 'mention'
                ? `@Mention who should answer. With no mention, ${lead?.name ?? 'the lead'} answers.`
                : `${lead?.name ?? 'The lead'} picks who answers. @Mention someone to choose yourself.`}
            </Text>
          </View>
        ) : (
          messages.map(message => {
            const author = byId.get(message.agentId ?? '');
            return message.role === 'note' ? (
              <Text key={message.id} style={styles.note}>
                {message.content}
              </Text>
            ) : message.role === 'user' ? (
              <View key={message.id} style={styles.userBubble}>
                <Text style={styles.messageText}>{message.content}</Text>
              </View>
            ) : (
              <View key={message.id} style={styles.agentRow}>
                <CharacterFace
                  character={author?.avatar ?? 'pebble'}
                  size={28}
                  animated={false}
                />
                <View style={styles.agentText}>
                  <Text style={styles.author}>
                    {author?.name ?? 'Someone'}
                    {author?.id === room.leadAgentId ? ' · lead' : ''}
                  </Text>
                  {message.toolCalls.map(call => (
                    <ToolCallCard
                      key={call.id}
                      call={call}
                      onDecide={
                        !message.isStreaming && !message.error
                          ? decision => decide(call, decision)
                          : undefined
                      }
                    />
                  ))}
                  {message.content ? (
                    <Markdown isStreaming={message.isStreaming}>
                      {message.content}
                    </Markdown>
                  ) : !message.error && message.isStreaming ? (
                    <Text style={styles.muted}>Thinking…</Text>
                  ) : null}
                  {message.error ? (
                    <Text accessibilityRole="alert" style={styles.alert}>
                      {message.error}
                    </Text>
                  ) : null}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.composer}>
        <Text accessibilityLiveRegion="polite" style={styles.status}>
          {status ??
            (mentioned.length > 0
              ? `${listNames(mentioned.map(m => m.name))} will answer.`
              : ' ')}
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          {active.map(member => (
            <Pressable
              key={member.id}
              accessibilityRole="button"
              accessibilityLabel={`Mention ${member.name}`}
              disabled={!canSend}
              onPress={() => mention(member)}
              style={[
                styles.chip,
                mentioned.some(m => m.id === member.id) && styles.chipOn,
              ]}
            >
              <CharacterFace
                character={member.avatar}
                size={16}
                animated={false}
              />
              <Text style={styles.chipText}>@{member.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
        <View style={styles.row}>
          <TextInput
            accessibilityLabel={`Message ${room.name}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={
              canSend ? `Message ${room.name}…` : 'Everyone here was fired.'
            }
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.accent}
            maxLength={CHAT_MESSAGE_MAX_LENGTH}
            editable={canSend}
            multiline
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send"
            disabled={!draft.trim() || isBusy || !canSend}
            onPress={() => void send(draft)}
            style={({pressed}) => [
              styles.send,
              pressed && styles.sendPressed,
              (!draft.trim() || isBusy || !canSend) && styles.sendDisabled,
            ]}
          >
            {isBusy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={styles.sendText}>↑</Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/** A room: loads it, then shows its group chat. */
export default function RoomScreen() {
  const {id} = useLocalSearchParams<{id: string}>();
  const detail = useApi<RoomDetail>(`/api/rooms/${id}`);
  if (!detail.data) {
    return (
      <View style={styles.center}>
        {detail.error ? (
          <Text style={styles.alert}>{detail.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }
  const {room} = detail.data;
  // Coming back from Edit starts again from what's saved.
  const version = [
    room.name,
    room.mode,
    room.leadAgentId,
    ...room.members.map(m => m.id),
  ].join('|');
  return <RoomChat key={version} detail={detail.data} />;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  headerAction: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  subheader: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  messages: {flex: 1},
  messagesContent: {padding: spacing.xl, gap: spacing.xl},
  empty: {gap: spacing.md},
  hello: {color: colors.text, fontSize: fontSize.lg, lineHeight: 26},
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  note: {
    alignSelf: 'center',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '85%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.lg,
    borderBottomRightRadius: radius.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  agentRow: {flexDirection: 'row', gap: spacing.sm},
  agentText: {flex: 1, gap: spacing.sm},
  author: {
    color: colors.text,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
  messageText: {color: colors.text, fontSize: fontSize.md, lineHeight: 22},
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
  composer: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
  status: {color: colors.textMuted, fontSize: fontSize.xs},
  chips: {gap: spacing.sm},
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipOn: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  chipText: {color: colors.text, fontSize: fontSize.sm},
  row: {flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm},
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 140,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    marginBottom: spacing.md,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  sendPressed: {backgroundColor: colors.accentPressed},
  sendDisabled: {opacity: 0.4},
  sendText: {
    color: colors.onAccent,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
