'use client';

import type {
  ChatMessage,
  ComputerSummary,
  RoomEvent,
  RoomMember,
  RoomSummary,
  ToolCallRecord,
} from '@binary/shared';
import {
  CHAT_MESSAGE_MAX_LENGTH,
  findMentions,
  readEvents,
  ROOM_MAX_ANSWERS,
  ROOM_MODE_INFO,
} from '@binary/shared';
import {cn} from 'cn';
import {ArrowUpIcon, CrownIcon, PencilIcon} from 'lucide-react';
import Link from 'next/link';
import {useRouter} from 'next/navigation';
import type {FormEvent, KeyboardEvent} from 'react';
import {useEffect, useRef, useState} from 'react';

import {CharacterFace} from '@/components/characters/character-face';
import {Markdown} from '@/components/chat/markdown';
import {ToolCallCard} from '@/components/chat/tool-call-card';
import {Button, buttonVariants} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {announceApprovalsChanged} from '@/lib/approval-events';
import {decideRequest} from '@/lib/approvals';

/** One message on screen. `error` means that answer wasn't saved. */
interface Message {
  id: string;
  role: 'user' | 'assistant' | 'note';
  agentId?: string | null;
  content: string;
  toolCalls: ToolCallRecord[];
  error?: string;
  isStreaming?: boolean;
}

async function errorMessageOf(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  return body?.message ?? 'Something went wrong. Please try again.';
}

/** "Nova", "Nova and Bolt", "Nova, Bolt and Ember". */
function listNames(names: string[]): string {
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/**
 * A room's group chat: your message goes to the characters you @mention
 * (or the lead, or whoever the lead picks), and they answer in turn, each
 * under their own face and name.
 */
export function RoomView({
  room,
  initialMessages,
  initialComputers = [],
}: {
  room: RoomSummary;
  initialMessages: ChatMessage[];
  initialComputers?: ComputerSummary[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);
  const [running] = useState(initialComputers);
  const nextLocalId = useRef(1);
  const controllerRef = useRef<AbortController>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const active = room.members.filter(m => !m.isFired);
  const byId = new Map(room.members.map(m => [m.id, m]));
  const lead = byId.get(room.leadAgentId);
  const canSend = active.length > 0;
  const mentioned = findMentions(draft, active);

  useEffect(() => {
    endRef.current?.scrollIntoView({block: 'end'});
  }, [messages]);

  // Leaving stops reading here; the server still saves every answer.
  useEffect(() => () => controllerRef.current?.abort(), []);

  function localId() {
    return `local-${nextLocalId.current++}`;
  }

  function update(id: string, change: (m: Message) => Message) {
    setMessages(current => current.map(m => (m.id === id ? change(m) : m)));
  }

  function nameOf(agentId: string | null | undefined): string {
    return byId.get(agentId ?? '')?.name ?? 'Someone';
  }

  /** Adds "@Name " to the message, from a chip. */
  function mention(member: RoomMember) {
    setDraft(current => {
      const spacer = current && !/\s$/.test(current) ? ' ' : '';
      return `${current}${spacer}@${member.name} `;
    });
    inputRef.current?.focus();
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || isBusy || !canSend) {
      return;
    }
    const questionId = localId();
    setMessages(current => [
      ...current,
      {id: questionId, role: 'user', content: message, toolCalls: []},
    ]);
    setDraft('');
    setIsBusy(true);
    setStatus('Working out who answers…');

    const controller = new AbortController();
    controllerRef.current = controller;
    // The answer being written right now, if any.
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
      const response = await fetch(`/api/rooms/${room.id}/messages`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({message}),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        failCurrent(await errorMessageOf(response));
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
              if (event.message.toolCalls.some(c => c.status === 'waiting')) {
                announceApprovalsChanged();
              }
              break;
            case 'turn-error': {
              // The note replaces whatever that turn had written.
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
                  ? `Stopped at ${ROOM_MAX_ANSWERS} answers for this message. Send another to carry on.`
                  : undefined,
              );
              break;
          }
        }
      }
    } catch {
      if (controller.signal.aborted) {
        return;
      }
      failCurrent('Could not reach Binary. Is the API running?');
    }
    if (current) {
      failCurrent('The answer stopped part-way.');
    }
    setIsBusy(false);
    router.refresh();
  }

  /** Approves or rejects a waiting tool call; the asker follows up. */
  async function decide(
    call: ToolCallRecord,
    decision: 'approve' | 'reject',
  ): Promise<string | undefined> {
    if (!call.approvalId) {
      return 'This request is missing.';
    }
    setIsBusy(true);
    const result = await decideRequest(call.approvalId, decision);
    setIsBusy(false);
    if (!result.ok) {
      if (result.alreadyDecided) {
        router.refresh();
      }
      return result.message;
    }
    const {decided} = result;
    setMessages(all => {
      const known = new Set(all.map(m => m.id));
      const added: Message[] = [decided.note];
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

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(draft);
  }

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
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col md:min-h-dvh">
      <header className="flex flex-wrap items-center gap-3 border-b px-4 py-3 sm:px-8">
        <div className="flex -space-x-2">
          {room.members.map(member => (
            <CharacterFace
              key={member.id}
              character={member.avatar}
              size={36}
              animated={false}
              className={cn(
                'rounded-full ring-2 ring-background',
                member.isFired && 'opacity-40',
              )}
            />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-semibold">{room.name}</h1>
          <p className="truncate text-xs text-muted-foreground">
            {ROOM_MODE_INFO[room.mode].label} · {lead?.name ?? 'No one'} leads
            {running.length > 0 &&
              ` · ${running.length} computer${running.length === 1 ? '' : 's'} running`}
          </p>
        </div>
        <Link
          href={`/rooms/${room.id}/edit`}
          className={buttonVariants({variant: 'secondary', size: 'sm'})}
        >
          <PencilIcon aria-hidden />
          Edit
        </Link>
      </header>

      <section
        aria-label={`Room ${room.name}`}
        className="flex-1 px-4 py-6 sm:px-8"
      >
        {messages.length === 0 ? (
          <div className="mx-auto flex max-w-2xl flex-col gap-4 pt-4 sm:pt-12">
            <p className="text-lg">
              {listNames(active.map(m => m.name))} are here.
            </p>
            <p className="text-sm text-muted-foreground">
              {room.mode === 'mention'
                ? `@Mention who should answer. With no mention, ${lead?.name ?? 'the lead'} answers.`
                : `${lead?.name ?? 'The lead'} picks who answers. @Mention someone to choose yourself.`}{' '}
              They answer in turn and can hand work to each other, up to{' '}
              {ROOM_MAX_ANSWERS} answers per message.
            </p>
          </div>
        ) : (
          <ol
            aria-label="Messages"
            className="mx-auto flex max-w-2xl flex-col gap-6"
          >
            {messages.map(message => {
              const author = byId.get(message.agentId ?? '');
              return (
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
                        character={author?.avatar ?? 'pebble'}
                        size={32}
                        animated={false}
                        className="mt-0.5 shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="mb-1 flex items-center gap-1.5 text-xs font-medium">
                          {author?.name ?? 'Someone'}
                          {author?.id === room.leadAgentId && (
                            <CrownIcon
                              aria-label="lead"
                              className="size-3 text-primary"
                            />
                          )}
                        </p>
                        {message.toolCalls.length > 0 && (
                          <div className="mb-3 flex flex-col gap-2">
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
                          </div>
                        )}
                        {message.content ? (
                          <Markdown isStreaming={message.isStreaming}>
                            {message.content}
                          </Markdown>
                        ) : (
                          !message.error &&
                          message.isStreaming && (
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
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        )}
        <div ref={endRef} className="scroll-mb-40" />
      </section>

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t bg-background/95 px-4 py-3 backdrop-blur sm:px-8"
      >
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          <p
            aria-live="polite"
            className="min-h-4 text-xs text-muted-foreground"
          >
            {status ??
              (mentioned.length > 0
                ? `${listNames(mentioned.map(m => m.name))} will answer.`
                : '')}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {active.map(member => (
              <button
                key={member.id}
                type="button"
                onClick={() => mention(member)}
                disabled={!canSend}
                className={cn(
                  'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs transition-colors hover:bg-secondary',
                  mentioned.some(m => m.id === member.id) &&
                    'border-foreground/40 bg-secondary',
                )}
              >
                <CharacterFace
                  character={member.avatar}
                  size={16}
                  animated={false}
                />
                @{member.name}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label htmlFor="room-message" className="sr-only">
              Message {room.name}
            </label>
            <Textarea
              id="room-message"
              ref={inputRef}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                canSend
                  ? `Message ${room.name}…`
                  : 'Everyone in this room was fired.'
              }
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
        </div>
      </form>
    </div>
  );
}
