import type {
  AgentSummary,
  ChatTurn,
  Mood,
  ProviderKeyStatus,
} from '@binary/shared';
import {
  CHAT_HISTORY_MAX_TURNS,
  CHAT_MESSAGE_MAX_LENGTH,
  characterOf,
  colors,
  fontSize,
  fontWeight,
  radius,
  readEvents,
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

import {ModelBadge} from '@/components/cards';
import {CharacterFace} from '@/components/character-face';
import {useApi} from '@/hooks/use-api';
import {apiFetch} from '@/lib/api';

/** One message on screen. Errors are shown but never sent back as history. */
interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
}

function stageLine(mood: Mood, name: string, greeting: string): string {
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

/** The conversation itself, once the agent has loaded. */
function Chat({agent, hasKey}: {agent: AgentSummary; hasKey: boolean}) {
  const router = useRouter();
  const character = characterOf(agent.avatar);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState<Mood>('idle');
  const nextId = useRef(1);
  const happyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const scrollRef = useRef<ScrollViewInstance>(null);
  const isBusy = mood === 'thinking' || mood === 'talking';

  useEffect(() => () => clearTimeout(happyTimer.current), []);

  function updateMessage(id: number, change: (m: Message) => Message) {
    setMessages(current => current.map(m => (m.id === id ? change(m) : m)));
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || isBusy || !hasKey) {
      return;
    }
    const history: ChatTurn[] = messages
      .filter(m => !m.error && m.content)
      .map(({role, content}) => ({role, content}))
      .slice(-CHAT_HISTORY_MAX_TURNS);
    const userId = nextId.current++;
    const replyId = nextId.current++;
    setMessages(current => [
      ...current,
      {id: userId, role: 'user', content: message},
      {id: replyId, role: 'assistant', content: ''},
    ]);
    setDraft('');
    clearTimeout(happyTimer.current);
    setMood('thinking');

    try {
      const response = await apiFetch(`/api/agents/${agent.id}/reply`, {
        method: 'POST',
        body: {message, history},
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Something went wrong.');
      }
      let failed = false;
      for await (const event of readEvents(response.body)) {
        if (event.type === 'text') {
          setMood('talking');
          updateMessage(replyId, m => ({
            ...m,
            content: m.content + event.text,
          }));
        } else if (event.type === 'error') {
          failed = true;
          updateMessage(replyId, m => ({...m, error: event.message}));
        }
      }
      if (failed) {
        setMood('idle');
      } else {
        setMood('happy');
        happyTimer.current = setTimeout(() => setMood('idle'), 2500);
      }
    } catch (error) {
      updateMessage(replyId, m => ({
        ...m,
        error: error instanceof Error ? error.message : 'Something went wrong.',
      }));
      setMood('idle');
    }
  }

  function startOver() {
    clearTimeout(happyTimer.current);
    setMessages([]);
    setMood('idle');
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <Stack.Screen
        options={{
          title: agent.name,
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push(`/agents/${agent.id}/edit`)}
              hitSlop={8}
            >
              <Text style={styles.headerAction}>Edit</Text>
            </Pressable>
          ),
        }}
      />

      {/* The stage */}
      <View style={[styles.stage, {backgroundColor: character.tint}]}>
        <CharacterFace character={character.id} mood={mood} size={104} />
        <View style={styles.stageText}>
          <Text numberOfLines={2} style={styles.role}>
            {agent.role}
          </Text>
          <ModelBadge provider={agent.provider} model={agent.model} />
          <Text accessibilityLiveRegion="polite" style={styles.stageLine}>
            {stageLine(mood, agent.name, character.greeting)}
          </Text>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={styles.messagesContent}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd()}
        keyboardShouldPersistTaps="handled"
      >
        {!hasKey && (
          <Text style={styles.alert}>
            {agent.name} has no key to think with. Add one on the API keys
            screen, or pick another provider with Edit.
          </Text>
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
                disabled={!hasKey}
                onPress={() => void send(starter)}
                style={styles.starter}
              >
                <Text style={styles.starterText}>{starter}</Text>
              </Pressable>
            ))}
          </View>
        ) : (
          <>
            {messages.map(message =>
              message.role === 'user' ? (
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
                    {message.content ? (
                      <Text style={styles.messageText}>{message.content}</Text>
                    ) : !message.error ? (
                      <Text style={styles.muted}>Thinking…</Text>
                    ) : null}
                    {message.error && (
                      <Text accessibilityRole="alert" style={styles.alert}>
                        {message.error}
                      </Text>
                    )}
                  </View>
                </View>
              ),
            )}
            <Pressable
              accessibilityRole="button"
              onPress={startOver}
              style={styles.newChat}
            >
              <Text style={styles.muted}>↺ New chat</Text>
            </Pressable>
          </>
        )}
      </ScrollView>

      <SafeAreaView edges={['bottom']} style={styles.composer}>
        <TextInput
          accessibilityLabel={`Message ${agent.name}`}
          value={draft}
          onChangeText={setDraft}
          placeholder={`Give ${agent.name} a task…`}
          placeholderTextColor={colors.textSubtle}
          selectionColor={colors.accent}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          editable={hasKey}
          multiline
          style={styles.input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim() || isBusy || !hasKey}
          onPress={() => void send(draft)}
          style={({pressed}) => [
            styles.send,
            pressed && styles.sendPressed,
            (!draft.trim() || isBusy || !hasKey) && styles.sendDisabled,
          ]}
        >
          {isBusy ? (
            <ActivityIndicator color={colors.onAccent} />
          ) : (
            <Text style={styles.sendText}>↑</Text>
          )}
        </Pressable>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

/** Talk to one of your agents. Nothing is saved yet. */
export default function AgentScreen() {
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
  return <Chat key={current.id} agent={current} hasKey={hasKey} />;
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
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
    paddingVertical: spacing.lg,
  },
  stageText: {flex: 1, gap: spacing.xs},
  role: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  stageLine: {color: colors.text, fontSize: fontSize.sm, marginTop: spacing.sm},
  messages: {flex: 1},
  messagesContent: {padding: spacing.xl, gap: spacing.lg},
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
  agentRow: {flexDirection: 'row', gap: spacing.sm, maxWidth: '92%'},
  agentText: {flex: 1, gap: spacing.sm, paddingTop: 4},
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
  newChat: {alignSelf: 'center', padding: spacing.sm},
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
