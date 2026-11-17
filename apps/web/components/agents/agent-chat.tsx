'use client';

import type {AgentSummary, ChatTurn, Mood} from '@binary/shared';
import {
  characterOf,
  CHAT_HISTORY_MAX_TURNS,
  CHAT_MESSAGE_MAX_LENGTH,
  readEvents,
} from '@binary/shared';
import {cn} from 'cn';
import {ArrowUpIcon, PencilIcon, RotateCcwIcon} from 'lucide-react';
import Link from 'next/link';
import type {FormEvent, KeyboardEvent} from 'react';
import {useEffect, useRef, useState} from 'react';

import {ModelBadge} from '@/components/agents/cards';
import {CharacterFace} from '@/components/characters/character-face';
import {Button, buttonVariants} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';

/** One message on screen. Errors are shown but never sent back as history. */
interface Message {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  error?: string;
}

/** What the character says on the stage for each mood. */
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

interface AgentChatProps {
  agent: AgentSummary;
  /** False when the agent's provider has no saved key. */
  hasKey: boolean;
}

/**
 * Talk to an agent beside a stage where its character reacts: thinking while
 * it waits, talking while the answer streams in, happy when it's done.
 * Nothing is saved yet: "New chat" or a reload starts over.
 */
export function AgentChat({agent, hasKey}: AgentChatProps) {
  const character = characterOf(agent.avatar);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [mood, setMood] = useState<Mood>('idle');
  const nextId = useRef(1);
  const controllerRef = useRef<AbortController>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const endRef = useRef<HTMLDivElement>(null);
  const isBusy = mood === 'thinking' || mood === 'talking';

  // Keep the newest message in view.
  useEffect(() => {
    endRef.current?.scrollIntoView({block: 'end'});
  }, [messages]);

  // Stop any answer still streaming when leaving the page.
  useEffect(() => () => controllerRef.current?.abort(), []);

  function updateMessage(id: number, change: (m: Message) => Message) {
    setMessages(current => current.map(m => (m.id === id ? change(m) : m)));
  }

  async function send(text: string) {
    const message = text.trim();
    if (!message || isBusy || !hasKey) {
      return;
    }
    // Earlier turns that worked, newest last, trimmed to what the API takes.
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

    const controller = new AbortController();
    controllerRef.current = controller;
    try {
      const response = await fetch(`/api/agents/${agent.id}/reply`, {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({message, history}),
        signal: controller.signal,
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
      if (!controller.signal.aborted) {
        updateMessage(replyId, m => ({
          ...m,
          error:
            error instanceof Error ? error.message : 'Something went wrong.',
        }));
      }
      setMood('idle');
    }
  }

  function startOver() {
    controllerRef.current?.abort();
    clearTimeout(happyTimer.current);
    setMessages([]);
    setMood('idle');
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
        <div className="flex items-center justify-between gap-2 p-4">
          <Link
            href={`/agents/${agent.id}/edit`}
            className={buttonVariants({variant: 'secondary', size: 'sm'})}
          >
            <PencilIcon aria-hidden />
            Edit
          </Link>
          <Button variant="secondary" size="sm" onClick={startOver}>
            <RotateCcwIcon aria-hidden />
            New chat
          </Button>
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
              className="mt-3"
            />
            <p
              aria-live="polite"
              className="mt-4 hidden rounded-xl border bg-background/80 px-4 py-3 text-sm sm:block"
            >
              {stageLine(mood, agent.name, character.greeting)}
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
          {!hasKey && (
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
                    disabled={!hasKey}
                    onClick={() => void send(starter)}
                    className="rounded-full border border-input px-3.5 py-2 text-left text-sm transition-colors hover:bg-secondary disabled:opacity-50"
                  >
                    {starter}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <ol className="mx-auto flex max-w-2xl flex-col gap-5">
              {messages.map(message => (
                <li
                  key={message.id}
                  className={cn(
                    'flex gap-3',
                    message.role === 'user' && 'justify-end',
                  )}
                >
                  {message.role === 'assistant' && (
                    <CharacterFace
                      character={character.id}
                      size={32}
                      animated={false}
                      className="mt-0.5 shrink-0"
                    />
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] text-sm leading-relaxed',
                      message.role === 'user'
                        ? 'rounded-2xl rounded-br-md bg-secondary px-4 py-2.5'
                        : 'pt-1.5',
                    )}
                  >
                    {message.content && (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                    {message.role === 'assistant' &&
                      !message.content &&
                      !message.error && (
                        <p className="text-muted-foreground">Thinking…</p>
                      )}
                    {message.error && (
                      <p
                        role="alert"
                        className="mt-1 rounded-md border border-destructive/40 bg-danger-surface p-3 text-destructive"
                      >
                        {message.error}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div ref={endRef} />
        </div>

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
              disabled={!hasKey}
              className="max-h-40 min-h-11 resize-none"
            />
            <Button
              type="submit"
              size="icon-lg"
              aria-label="Send"
              disabled={!draft.trim() || isBusy || !hasKey}
              className="size-11 shrink-0"
            >
              <ArrowUpIcon aria-hidden />
            </Button>
          </div>
        </form>
      </section>
    </div>
  );
}
