'use client';

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
import {characterOf, CHAT_MESSAGE_MAX_LENGTH, readEvents} from '@binary/shared';
import {cn} from 'cn';
import {
  ArrowUpIcon,
  BrainIcon,
  EyeIcon,
  PencilIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import type {FormEvent, KeyboardEvent} from 'react';
import {useEffect, useRef, useState} from 'react';

import {ModelBadge} from '@/components/agents/cards';
import {CharacterFace} from '@/components/characters/character-face';
import {Markdown} from '@/components/chat/markdown';
import {ToolCallCard} from '@/components/chat/tool-call-card';
import {Button, buttonVariants} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {announceApprovalsChanged} from '@/lib/approval-events';
import {decideRequest} from '@/lib/approvals';
import {announceChatsChanged} from '@/lib/chat-events';
import {ApiError, callApi} from '@/lib/client-api';

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

/** What the character says on the stage for each mood. */
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

/** The API's message for a failed request, or a fallback. */
async function errorMessageOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? 'Something went wrong. Please try again.';
}

interface ChatViewProps {
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
 * Talk to an agent beside a stage where its character reacts: thinking
 * while it waits, talking while the answer streams in, happy when it's
 * saved. A new chat is created with the first message.
 */
export function ChatView({
  agent,
  hasKey,
  thread,
  initialMessages,
  isFired,
  initialComputers = [],
}: ChatViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const character = characterOf(agent.avatar);
  const [threadId, setThreadId] = useState(thread?.id ?? null);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState<Mood>('idle');
  // The tool being used right now, for the stage line.
  const [activeTool, setActiveTool] = useState<string>();
  const [isDeleting, setIsDeleting] = useState(false);
  const [running, setRunning] = useState(initialComputers);
  const [stopping, setStopping] = useState<string>();
  const nextLocalId = useRef(1);
  const controllerRef = useRef<AbortController>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  // Follow new text only while the person is at the bottom of the chat.
  const followRef = useRef(true);
  const isBusy = mood === 'thinking' || mood === 'talking';
  const canSend = hasKey && !isFired;

  useEffect(() => {
    if (followRef.current) {
      endRef.current?.scrollIntoView({block: 'end'});
    }
  }, [messages]);

  useEffect(() => {
    const onScroll = () => {
      const fromBottom =
        document.documentElement.scrollHeight -
        (window.scrollY + window.innerHeight);
      followRef.current = fromBottom < 120;
    };
    window.addEventListener('scroll', onScroll, {passive: true});
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Leaving stops reading the answer here. The server still finishes it
  // and saves it, so it's there when the person comes back.
  useEffect(
    () => () => {
      controllerRef.current?.abort();
      clearTimeout(happyTimer.current);
    },
    [],
  );

  // Going Back to a chat that started here can show this page as it was
  // before the chat existed. Reload it so the saved messages appear.
  useEffect(() => {
    if (
      !thread &&
      pathname.startsWith('/chats/') &&
      pathname !== `/chats/${threadId}`
    ) {
      router.refresh();
    }
  }, [thread, threadId, pathname, router]);

  /** Checks this chat's computers, after something may have started one. */
  function refreshComputers(id: string | null = threadId) {
    if (agent.computers.length === 0 || !id) {
      return;
    }
    callApi<ComputersOverview>('/api/computers')
      .then(body => setRunning(body.computers.filter(c => c.threadId === id)))
      .catch(() => {});
  }

  async function stopComputer(computer: ComputerSummary) {
    setStopping(computer.id);
    try {
      await callApi(`/api/computers/${computer.id}/stop`, {method: 'POST'});
      setRunning(current => current.filter(c => c.id !== computer.id));
    } catch (error) {
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setStopping(undefined);
    }
  }

  function updateMessage(id: string, change: (m: Message) => Message) {
    setMessages(current => current.map(m => (m.id === id ? change(m) : m)));
  }

  function localId() {
    return `local-${nextLocalId.current++}`;
  }

  /** Creates the chat on the first message and gives it its own address. */
  async function ensureThread(): Promise<string> {
    if (threadId) {
      return threadId;
    }
    const {thread: created} = await callApi<{thread: ThreadSummary}>(
      '/api/threads',
      {method: 'POST', body: {agentId: agent.id}},
    );
    setThreadId(created.id);
    // Change the address without leaving the page, so this chat keeps
    // streaming. A reload now opens the saved chat.
    window.history.replaceState(null, '', `/chats/${created.id}`);
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
    followRef.current = true;
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
      const response = await fetch(`/api/threads/${id}/messages`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({message}),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        fail(await errorMessageOf(response));
      } else {
        for await (const event of readEvents<ChatEvent>(response.body)) {
          if (event.type === 'start') {
            updateMessage(questionId, m => ({...m, id: event.userMessage.id}));
            // The chat now has a title, so Recent chats can show it.
            announceChatsChanged();
          } else if (event.type === 'delta') {
            setMood('talking');
            updateMessage(answerId, m => ({
              ...m,
              content: m.content + event.text,
            }));
          } else if (event.type === 'tool') {
            const {call} = event;
            // A running tool means the character is busy, not talking.
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
            announceChatsChanged();
            if (event.message.toolCalls.some(c => c.status === 'waiting')) {
              // A new request waits in Today.
              announceApprovalsChanged();
            }
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
   * changes, Binary's note and the character's follow-up appear below.
   * Resolves to an error to show on the card, or undefined.
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
      if (result.alreadyDecided) {
        // Decided elsewhere (another tab or device): show what happened.
        router.refresh();
      }
      return result.message;
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
    followRef.current = true;
    setMood('happy');
    happyTimer.current = setTimeout(() => setMood('idle'), 2500);
    refreshComputers();
    return undefined;
  }

  async function deleteChat() {
    if (
      !threadId ||
      !window.confirm('Delete this chat? This can’t be undone.')
    ) {
      return;
    }
    setIsDeleting(true);
    try {
      await callApi(`/api/threads/${threadId}`, {method: 'DELETE'});
      announceChatsChanged();
      router.push(isFired ? '/' : `/agents/${agent.id}`);
    } catch (error) {
      setIsDeleting(false);
      window.alert(error instanceof Error ? error.message : String(error));
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

  /** Enter sends; Shift+Enter starts a new line. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === 'Enter' &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      void send(draft);
    }
  }

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] grid-cols-1 md:min-h-dvh lg:grid-cols-[minmax(18rem,24rem)_minmax(0,1fr)]">
      {/* The stage */}
      <aside
        className="flex flex-col border-b lg:sticky lg:top-0 lg:h-dvh lg:border-r lg:border-b-0"
        style={{backgroundColor: character.tint}}
      >
        <div className="flex flex-wrap items-center gap-2 p-4">
          {!isFired && (
            <>
              <Link
                href={`/agents/${agent.id}`}
                className={buttonVariants({variant: 'secondary', size: 'sm'})}
              >
                <PlusIcon aria-hidden />
                New chat
              </Link>
              <Link
                href={`/agents/${agent.id}/edit`}
                className={buttonVariants({variant: 'secondary', size: 'sm'})}
              >
                <PencilIcon aria-hidden />
                Edit
              </Link>
              <Link
                href={`/agents/${agent.id}/memory`}
                className={buttonVariants({variant: 'secondary', size: 'sm'})}
              >
                <BrainIcon aria-hidden />
                Memory
              </Link>
            </>
          )}
          {running.map((computer, index) => {
            const isBrowser = computer.kind === 'browser';
            const isDesktop = computer.kind === 'cloud_desktop';
            return (
              <span
                key={computer.id}
                className={cn(
                  'inline-flex h-8 items-center gap-2 rounded-full border bg-background/80 pr-1 pl-3 text-xs',
                  index === 0 && 'ml-auto',
                )}
              >
                <span aria-hidden className="size-2 rounded-full bg-primary" />
                {isBrowser
                  ? 'Browser open'
                  : isDesktop
                    ? 'Desktop on'
                    : 'Sandbox on'}
                {computer.liveUrl && (
                  <a
                    href={computer.liveUrl}
                    target="_blank"
                    rel="noreferrer"
                    aria-label="Watch the desktop live"
                    title="Watch the desktop live"
                    className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <EyeIcon aria-hidden className="size-3.5" />
                  </a>
                )}
                <Button
                  variant="ghost"
                  size="icon-xs"
                  aria-label={
                    isBrowser ? 'Close the browser' : 'Stop the sandbox'
                  }
                  title={
                    isBrowser
                      ? 'Close the browser'
                      : 'Stop the sandbox (its files go with it)'
                  }
                  disabled={stopping === computer.id}
                  onClick={() => void stopComputer(computer)}
                >
                  <SquareIcon aria-hidden />
                </Button>
              </span>
            );
          })}
          {threadId && (
            <Button
              variant="secondary"
              size="sm"
              disabled={isDeleting || isBusy}
              onClick={() => void deleteChat()}
              className={running.length > 0 ? undefined : 'ml-auto'}
            >
              <Trash2Icon aria-hidden />
              Delete chat
            </Button>
          )}
        </div>
        <div className="flex flex-1 flex-row items-center gap-4 px-5 pb-5 lg:flex-col lg:justify-center lg:gap-6 lg:pb-16">
          <CharacterFace
            character={character.id}
            mood={mood}
            size={200}
            className="size-24 shrink-0 sm:size-32 lg:size-[200px]"
          />
          <div className="min-w-0 lg:text-center">
            <h1 className="text-xl font-semibold lg:text-2xl">{agent.name}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
              {agent.role}
            </p>
            <ModelBadge
              provider={agent.provider}
              model={agent.model}
              engine={agent.engine}
              className="mt-3"
            />
            <p
              aria-live="polite"
              className="mt-4 hidden rounded-xl border bg-background/80 px-4 py-3 text-sm sm:block"
            >
              {isFired
                ? `${agent.name} has left the crew.`
                : stageLine(mood, agent.name, character.greeting, activeTool)}
            </p>
          </div>
        </div>
      </aside>

      {/* The conversation */}
      <section
        aria-label={`Chat with ${agent.name}`}
        className="flex min-w-0 flex-col"
      >
        <div className="flex-1 px-4 py-6 sm:px-8">
          {isFired ? (
            <p className="mx-auto mb-6 max-w-2xl rounded-md border bg-card p-3 text-sm text-muted-foreground">
              {agent.name} was fired, so this chat is read-only.
            </p>
          ) : (
            !hasKey && (
              <p
                role="alert"
                className="mx-auto mb-6 max-w-2xl rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
              >
                {agent.name} has no key to think with.{' '}
                <Link href="/keys" className="font-medium underline">
                  Add a key
                </Link>{' '}
                or{' '}
                <Link
                  href={`/agents/${agent.id}/edit`}
                  className="font-medium underline"
                >
                  pick another provider
                </Link>
                .
              </p>
            )
          )}

          {messages.length === 0 ? (
            <div className="mx-auto flex max-w-2xl flex-col items-start gap-4 pt-4 sm:pt-12">
              <p className="text-lg">
                Hi, I&apos;m {agent.name}. {character.greeting}
              </p>
              <p className="text-sm text-muted-foreground">Try one of these:</p>
              <div className="flex flex-wrap gap-2">
                {character.starters.map(starter => (
                  <button
                    key={starter}
                    type="button"
                    disabled={!canSend}
                    onClick={() => void send(starter)}
                    className="rounded-full border border-input px-3.5 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol
              aria-label="Messages"
              className="mx-auto flex max-w-2xl flex-col gap-6"
            >
              {messages.map(message => (
                <li
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' && 'justify-end',
                  )}
                >
                  {message.role === 'note' ? (
                    <p className="w-full text-center text-xs text-muted-foreground">
                      {message.content}
                    </p>
                  ) : message.role === 'user' ? (
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-secondary px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap">
                      {message.content}
                    </p>
                  ) : (
                    <>
                      <CharacterFace
                        character={character.id}
                        size={32}
                        animated={false}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1 pt-1">
                        {message.toolCalls.length > 0 && (
                          <div className="mb-3 flex flex-col gap-2">
                            {message.toolCalls.map(call => (
                              <ToolCallCard
                                key={call.id}
                                call={call}
                                onDecide={
                                  // Only a saved answer's requests exist.
                                  !message.isStreaming &&
                                  !message.error &&
                                  !isFired
                                    ? decision => decide(call, decision)
                                    : undefined
                                }
                              />
                            ))}
                          </div>
                        )}
                        {message.content ? (
                          <Markdown isStreaming={message.isStreaming}>
                            {message.content}
                          </Markdown>
                        ) : (
                          !message.error &&
                          message.isStreaming &&
                          !message.toolCalls.some(
                            call => call.status === 'running',
                          ) && (
                            <p className="text-sm text-muted-foreground">
                              Thinking…
                            </p>
                          )
                        )}
                        {message.error && (
                          <p
                            role="alert"
                            className="mt-2 rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
                          >
                            {message.error}
                            {message.content && (
                              <span className="mt-1 block text-xs text-muted-foreground">
                                What arrived is shown above, but it wasn&apos;t
                                saved.
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
          {/* Clears the composer when scrolled into view. */}
          <div ref={endRef} className="scroll-mb-28" />
        </div>

        {!isFired && (
          <form
            onSubmit={handleSubmit}
            className="sticky bottom-0 border-t bg-background/95 px-4 py-4 backdrop-blur sm:px-8"
          >
            <div className="mx-auto flex max-w-2xl items-end gap-2">
              <label htmlFor="chat-message" className="sr-only">
                Message {agent.name}
              </label>
              <Textarea
                id="chat-message"
                value={draft}
                onChange={event => setDraft(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Give ${agent.name} a task…`}
                rows={1}
                maxLength={CHAT_MESSAGE_MAX_LENGTH}
                disabled={!canSend}
                className="max-h-40 min-h-11 resize-none"
              />
              <Button
                type="submit"
                size="icon-lg"
                aria-label="Send"
                disabled={!draft.trim() || isBusy || !canSend}
                className="size-11 shrink-0"
              >
                <ArrowUpIcon aria-hidden />
              </Button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
