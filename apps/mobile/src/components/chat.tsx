import type {
  AgentSummary,
  ChatEvent,
  ChatMessage,
  Mood,
  ComputerSummary,
  ComputersOverview,
  ThreadSummary,
  ToolCallRecord,
} from '@binary/shared';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  characterOf,
  colors,
  fontSize,
  fontWeight,
  radius,
  readEvents,
  spacing,
} from '@binary/shared';
import {Stack, useRouter} from 'expo-router';
import {useEffect, useRef, useState} from 'react';
import type {ScrollViewInstance} from 'react-native';
import {
  ActivityIndicator,
  Alert,
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

import {ModelBadge} from '@/components/cards';
import {CharacterFace} from '@/components/character-face';
import {Markdown} from '@/components/markdown';
import {ToolCallCard} from '@/components/tools';
import {ApiError, apiFetch, apiJson} from '@/lib/api';
import {decideRequest} from '@/lib/approvals';

/**
 * One message on screen. An `error` means the answer wasn't saved. A
 * `note` is from Binary: "You approved shop refund order."
 */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'note';
  content: string;
  toolCalls: ToolCallRecord[];
  error?: string;
  isStreaming?: boolean;
}

function stageLine(
  mood: Mood,
  name: string,
  greeting: string,
  activeTool: string | undefined,
): string {
  if (activeTool) {
    return `${name} is using ${activeTool.replace(/[_-]+/g, ' ')}…`;
  }
  switch (mood) {
    case 'thinking':
      return `${name} is thinking…`;
    case 'talking':
      return `${name} is answering…`;
    case 'happy':
      return 'Done! Anything else?';
    default:
      return greeting;
  }
}

interface ChatProps {
  agent: AgentSummary;
  /** False when the agent's provider has no saved key. */
  hasKey: boolean;
  /** The saved chat, or null for a new one. */
  thread: ThreadSummary | null;
  initialMessages: ChatMessage[];
  /** A fired agent's chat can be read but not continued. */
  isFired: boolean;
  /** The chat's running computers (sandbox, browser). */
  initialComputers?: ComputerSummary[];
}

/**
 * A conversation with one agent, under a stage where its character reacts:
 * thinking, then talking while the answer streams in, then happy once it's
 * saved. A new chat is created with the first message.
 */
export function Chat({
  agent,
  hasKey,
  thread,
  initialMessages,
  isFired,
  initialComputers = [],
}: ChatProps) {
  const router = useRouter();
  const character = characterOf(agent.avatar);
  const [threadId, setThreadId] = useState(thread?.id ?? null);
  const [running, setRunning] = useState(initialComputers);

  /** Checks this chat's computers, after something may have started one. */
  function refreshComputers(id: string | null = threadId) {
    if (agent.computers.length === 0 || !id) {
      return;
    }
    apiJson<ComputersOverview>('/api/computers')
      .then(body => setRunning(body.computers.filter(c => c.threadId === id)))
      .catch(() => {});
  }

  function confirmStop(computer: ComputerSummary) {
    const isBrowser = computer.kind === 'browser';
    Alert.alert(
      isBrowser ? 'Close the browser?' : 'Stop the sandbox?',
      isBrowser ? 'Its open page goes with it.' : 'Its files go with it.',
      [
        {text: 'Keep it', style: 'cancel'},
        {
          text: isBrowser ? 'Close' : 'Stop',
          style: 'destructive',
          onPress: () => {
            apiJson(`/api/computers/${computer.id}/stop`, {method: 'POST'})
              .then(() =>
                setRunning(current =>
                  current.filter(c => c.id !== computer.id),
                ),
              )
              .catch((error: unknown) =>
                Alert.alert(
                  "Couldn't stop it",
                  error instanceof Error ? error.message : String(error),
                ),
              );
          },
        },
      ],
    );
  }
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState<Mood>('idle');
  // The tool being used right now, for the stage line.
  const [activeTool, setActiveTool] = useState<string>();
  const nextLocalId = useRef(1);
  const controllerRef = useRef<AbortController>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const isBusy = mood === 'thinking' || mood === 'talking';
  const canSend = hasKey && !isFired;

  // Leaving stops reading the answer here. The server still finishes it
  // and saves it, so it's there when the person comes back.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      clearTimeout(happyTimer.current);
    },
    [],
  );

  function updateMessage(id: string, change: (m: Message) => Message) {
    setMessages(current => current.map(m => (m.id === id ? change(m) : m)));
  }

  function localId() {
    return `local-${nextLocalId.current++}`;
  }

  async function ensureThread(): Promise<string> {
    if (threadId) {
      return threadId;
    }
    const {thread: created} = await apiJson<{thread: ThreadSummary}>(
      '/api/threads',
      {method: 'POST', body: {agentId: agent.id}},
    );
    setThreadId(created.id);
    return created.id;
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || isBusy || !canSend) {
      return;
    }
    const questionId = localId();
    const answerId = localId();
    setMessages(current => [
      ...current,
      {id: questionId, role: 'user', content: message, toolCalls: []},
      {
        id: answerId,
        role: 'assistant',
        content: '',
        toolCalls: [],
        isStreaming: true,
      },
    ]);
    setDraft('');
    clearTimeout(happyTimer.current);
    setMood('thinking');

    const controller = new AbortController();
    controllerRef.current = controller;
    let failed = false;
    const fail = (reason: string) => {
      failed = true;
      updateMessage(answerId, m => ({...m, error: reason, isStreaming: false}));
    };

    try {
      const id = await ensureThread();
      const response = await apiFetch(`/api/threads/${id}/messages`, {
        method: 'POST',
        body: {message},
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        fail(body?.message ?? 'Something went wrong. Please try again.');
      } else {
        for await (const event of readEvents<ChatEvent>(response.body)) {
          if (event.type === 'start') {
            updateMessage(questionId, m => ({...m, id: event.userMessage.id}));
          } else if (event.type === 'delta') {
            setMood('talking');
            updateMessage(answerId, m => ({
              ...m,
              content: m.content + event.text,
            }));
          } else if (event.type === 'tool') {
            const {call} = event;
            setMood(call.status === 'running' ? 'thinking' : 'talking');
            setActiveTool(call.status === 'running' ? call.name : undefined);
            updateMessage(answerId, m => ({
              ...m,
              toolCalls: m.toolCalls.some(other => other.id === call.id)
                ? m.toolCalls.map(other =>
                    other.id === call.id ? call : other,
                  )
                : [...m.toolCalls, call],
            }));
          } else if (event.type === 'error') {
            fail(event.message);
          } else {
            updateMessage(answerId, () => ({
              ...event.message,
              isStreaming: false,
            }));
            refreshComputers(id);
          }
        }
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      fail(
        error instanceof ApiError
          ? error.message
          : 'Could not reach Binary. Is the API running?',
      );
    }

    // A stream that ended without `done` didn't finish.
    updateMessage(answerId, m =>
      m.isStreaming
        ? {...m, isStreaming: false, error: 'The answer stopped part-way.'}
        : m,
    );
    setActiveTool(undefined);
    if (failed) {
      setMood('idle');
    } else {
      setMood('happy');
      happyTimer.current = setTimeout(() => setMood('idle'), 2500);
    }
  }

  /**
   * Approves or rejects a waiting tool call. When it's done, the card
   * changes and Binary's note and the character's follow-up appear below.
   */
  async function decide(
    call: ToolCallRecord,
    decision: 'approve' | 'reject',
  ): Promise<string | undefined> {
    if (!call.approvalId) {
      return 'This request is missing.';
    }
    clearTimeout(happyTimer.current);
    setMood('thinking');
    if (decision === 'approve') {
      setActiveTool(call.name);
    }
    const result = await decideRequest(call.approvalId, decision);
    setActiveTool(undefined);
    if (!result.ok) {
      setMood('idle');
      return result.alreadyDecided
        ? `${result.message} Open the chat again to see what happened.`
        : result.message;
    }
    const {decided} = result;
    setMessages(current => {
      const known = new Set(current.map(m => m.id));
      const added: Message[] = [decided.note];
      if (decided.reply) {
        added.push(decided.reply);
      } else if (decided.replyError) {
        added.push({
          id: localId(),
          role: 'assistant',
          content: '',
          toolCalls: [],
          error: decided.replyError,
        });
      }
      return [
        ...current.map(m =>
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
    setMood('happy');
    happyTimer.current = setTimeout(() => setMood('idle'), 2500);
    refreshComputers();
    return undefined;
  }

  function startNewChat() {
    controllerRef.current?.abort();
    clearTimeout(happyTimer.current);
    setThreadId(null);
    setMessages([]);
    setActiveTool(undefined);
    setMood('idle');
  }

  function confirmDelete() {
    Alert.alert('Delete this chat?', "This can't be undone.", [
      {text: 'Keep', style: 'cancel'},
      {text: 'Delete', style: 'destructive', onPress: () => void remove()},
    ]);
  }

  async function remove() {
    if (!threadId) {
      return;
    }
    try {
      await apiJson(`/api/threads/${threadId}`, {method: 'DELETE'});
      router.back();
    } catch (error) {
      Alert.alert(
        "Couldn't delete the chat",
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  function openMenu() {
    const actions = [
      ...(isFired
        ? []
        : [
            {
              text: 'Edit agent',
              onPress: () => router.push(`/agents/${agent.id}/edit`),
            },
          ]),
      ...(threadId
        ? [
            {
              text: 'Delete chat',
              style: 'destructive' as const,
              onPress: confirmDelete,
            },
          ]
        : []),
      {text: 'Cancel', style: 'cancel' as const},
    ];
    Alert.alert(agent.name, undefined, actions);
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: thread?.title ?? agent.name,
          headerRight: () => (
            <View style={styles.headerActions}>
              {!isFired && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="New chat"
                  disabled={isBusy}
                  onPress={startNewChat}
                  hitSlop={8}
                >
                  <Text style={styles.headerAction}>New</Text>
                </Pressable>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="More"
                onPress={openMenu}
                hitSlop={8}
              >
                <Text style={styles.headerAction}>•••</Text>
              </Pressable>
            </View>
          ),
        }}
      />

      {/* The stage */}
      <View style={[styles.stage, {backgroundColor: character.tint}]}>
        <CharacterFace character={character.id} mood={mood} size={88} />
        <View style={styles.stageText}>
          <Text numberOfLines={1} style={styles.name}>
            {agent.name}
          </Text>
          <ModelBadge provider={agent.provider} model={agent.model} />
          <Text accessibilityLiveRegion="polite" style={styles.stageLine}>
            {isFired
              ? `${agent.name} has left the crew.`
              : stageLine(mood, agent.name, character.greeting, activeTool)}
          </Text>
        </View>
      </View>

      {running.map(computer => {
        const isBrowser = computer.kind === 'browser';
        return (
          <View key={computer.id} style={styles.sandbox}>
            <View style={styles.sandboxDot} />
            <Text numberOfLines={1} style={styles.sandboxText}>
              {isBrowser
                ? `Browser open${computer.url ? ` · ${computer.url}` : ''}`
                : 'Sandbox on'}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                isBrowser ? 'Close the browser' : 'Stop the sandbox'
              }
              onPress={() => confirmStop(computer)}
              hitSlop={8}
            >
              <Text style={styles.sandboxStop}>
                {isBrowser ? 'Close' : 'Stop'}
              </Text>
            </Pressable>
          </View>
        );
      })}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled"
      >
        {isFired ? (
          <Text style={styles.notice}>
            {agent.name} was fired, so this chat is read-only.
          </Text>
        ) : (
          !hasKey && (
            <Text style={styles.alert}>
              {agent.name} has no key to think with. Add one on the API keys
              screen, or pick another provider in the ••• menu.
            </Text>
          )
        )}
        {messages.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.hello}>
              Hi, I&apos;m {agent.name}. {character.greeting}
            </Text>
            <Text style={styles.muted}>Try one of these:</Text>
            {character.starters.map(starter => (
              <Pressable
                key={starter}
                accessibilityRole="button"
                disabled={!canSend}
                onPress={() => void send(starter)}
                style={styles.starter}
              >
                <Text style={styles.starterText}>{starter}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          messages.map(message =>
            message.role === 'note' ? (
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
                  character={character.id}
                  size={28}
                  animated={false}
                />
                <View style={styles.agentText}>
                  {message.toolCalls.map(call => (
                    <ToolCallCard
                      key={call.id}
                      call={call}
                      onDecide={
                        // Only a saved answer's requests exist.
                        !message.isStreaming && !message.error && !isFired
                          ? decision => decide(call, decision)
                          : undefined
                      }
                    />
                  ))}
                  {message.content ? (
                    <Markdown isStreaming={message.isStreaming}>
                      {message.content}
                    </Markdown>
                  ) : !message.error &&
                    message.isStreaming &&
                    !message.toolCalls.some(
                      call => call.status === 'running',
                    ) ? (
                    <Text style={styles.muted}>Thinking…</Text>
                  ) : null}
                  {message.error && (
                    <Text accessibilityRole="alert" style={styles.alert}>
                      {message.error}
                      {message.content
                        ? "\nWhat arrived is shown above, but it wasn't saved."
                        : ''}
                    </Text>
                  )}
                </View>
              </View>
            ),
          )
        )}
      </ScrollView>

      {!isFired && (
        <SafeAreaView edges={['bottom']} style={styles.composer}>
          <TextInput
            accessibilityLabel={`Message ${agent.name}`}
            value={draft}
            onChangeText={setDraft}
            placeholder={`Give ${agent.name} a task…`}
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
        </SafeAreaView>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  sandbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  sandboxDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  sandboxText: {flex: 1, color: colors.textMuted, fontSize: fontSize.sm},
  sandboxStop: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  note: {
    alignSelf: 'center',
    textAlign: 'center',
    color: colors.textMuted,
    fontSize: fontSize.xs,
  },
  screen: {flex: 1, backgroundColor: colors.background},
  headerActions: {flexDirection: 'row', alignItems: 'center', gap: spacing.lg},
  headerAction: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  stage: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  stageText: {flex: 1, gap: spacing.xs},
  name: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  stageLine: {color: colors.text, fontSize: fontSize.sm, marginTop: spacing.xs},
  messages: {flex: 1},
  messagesContent: {padding: spacing.xl, gap: spacing.xl},
  empty: {gap: spacing.md, alignItems: 'flex-start'},
  hello: {color: colors.text, fontSize: fontSize.lg, lineHeight: 26},
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  starter: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  starterText: {color: colors.text, fontSize: fontSize.sm},
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
  agentText: {flex: 1, gap: spacing.sm, paddingTop: 4},
  messageText: {color: colors.text, fontSize: fontSize.md, lineHeight: 22},
  notice: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    overflow: 'hidden',
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
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.background,
  },
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
  sendDisabled: {opacity: 0.5},
  sendText: {
    color: colors.onAccent,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
