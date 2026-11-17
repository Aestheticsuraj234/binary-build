'use client';

import type {ProviderId, ProviderKeyStatus} from '@binary/shared';
import {
  ENGINE_MESSAGES,
  getProvider,
  PROMPT_MAX_LENGTH,
  readEvents,
} from '@binary/shared';
import {ArrowRightIcon, CircleAlertIcon, SquareIcon} from 'lucide-react';
import Link from 'next/link';
import type {FormEvent, KeyboardEvent} from 'react';
import {useRef, useState} from 'react';

import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {Textarea} from '@/components/ui/textarea';

/** What one provider's column is showing. */
interface Answer {
  status: 'idle' | 'streaming' | 'done' | 'error';
  model?: string;
  text: string;
  error?: string;
}

const EMPTY_ANSWER: Answer = {status: 'idle', text: ''};

interface PlaygroundProps {
  keys: ProviderKeyStatus[];
}

/**
 * Sends one prompt to every connected provider at once. Each provider gets
 * its own request, so each answer streams into its column independently.
 */
export function Playground({keys}: PlaygroundProps) {
  const [prompt, setPrompt] = useState('');
  const [promptError, setPromptError] = useState<string>();
  const [answers, setAnswers] = useState<Partial<Record<ProviderId, Answer>>>(
    {},
  );
  const controllerRef = useRef<AbortController>(null);

  const connected = keys.filter(key => key.connected).map(key => key.provider);
  const isRunning = Object.values(answers).some(a => a.status === 'streaming');

  function updateAnswer(provider: ProviderId, change: (a: Answer) => Answer) {
    setAnswers(current => ({
      ...current,
      [provider]: change(current[provider] ?? EMPTY_ANSWER),
    }));
  }

  /** Asks one provider and streams its answer into its column. */
  async function ask(provider: ProviderId, text: string, signal: AbortSignal) {
    try {
      const response = await fetch('/api/playground', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({provider, prompt: text}),
        signal,
      });
      if (!response.ok || !response.body) {
        const body = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(body?.message ?? 'Something went wrong.');
      }

      for await (const event of readEvents(response.body)) {
        if (event.type === 'start') {
          updateAnswer(provider, a => ({...a, model: event.model}));
        } else if (event.type === 'text') {
          updateAnswer(provider, a => ({...a, text: a.text + event.text}));
        } else if (event.type === 'error') {
          updateAnswer(provider, a => ({
            ...a,
            status: 'error',
            error: event.message,
          }));
        } else {
          updateAnswer(provider, a => ({...a, status: 'done'}));
        }
      }
      // If the connection ended early, stop the spinner anyway.
      updateAnswer(provider, a =>
        a.status === 'streaming' ? {...a, status: 'done'} : a,
      );
    } catch (error) {
      const stopped = signal.aborted;
      updateAnswer(provider, a => ({
        ...a,
        status: stopped ? 'done' : 'error',
        error: stopped
          ? undefined
          : error instanceof Error
            ? error.message
            : 'Something went wrong.',
      }));
    }
  }

  function run() {
    const text = prompt.trim();
    if (!text) {
      setPromptError(ENGINE_MESSAGES.promptRequired);
      return;
    }
    setPromptError(undefined);

    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    setAnswers(
      Object.fromEntries(
        connected.map(provider => [provider, {status: 'streaming', text: ''}]),
      ),
    );
    for (const provider of connected) {
      void ask(provider, text, controller.signal);
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    run();
  }

  /** Cmd+Enter (or Ctrl+Enter) runs the prompt. */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      run();
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <label htmlFor="prompt" className="sr-only">
          Prompt
        </label>
        <Textarea
          id="prompt"
          value={prompt}
          onChange={event => setPrompt(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask anything. For example: explain recursion in two sentences."
          maxLength={PROMPT_MAX_LENGTH}
          rows={4}
          aria-invalid={promptError ? true : undefined}
          aria-describedby={promptError ? 'prompt-error' : undefined}
        />
        {promptError && (
          <p
            id="prompt-error"
            role="alert"
            className="text-sm text-destructive"
          >
            {promptError}
          </p>
        )}
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-subtle">
            {connected.length === 0
              ? 'Add a key to start.'
              : `Sends to ${connected.length} provider${connected.length === 1 ? '' : 's'} · ⌘ Enter`}
          </p>
          <div className="flex gap-2">
            {isRunning && (
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={() => controllerRef.current?.abort()}
              >
                <SquareIcon aria-hidden className="size-3 fill-current" />
                Stop
              </Button>
            )}
            <Button
              type="submit"
              size="lg"
              disabled={connected.length === 0 || isRunning}
              className="px-5"
            >
              {isRunning && <Spinner />}
              Run
            </Button>
          </div>
        </div>
      </form>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {keys.map(key => (
          <AnswerColumn
            key={key.provider}
            provider={key.provider}
            connected={key.connected}
            answer={answers[key.provider] ?? EMPTY_ANSWER}
          />
        ))}
      </div>
    </div>
  );
}

interface AnswerColumnProps {
  provider: ProviderId;
  connected: boolean;
  answer: Answer;
}

/** One provider's answer. */
function AnswerColumn({provider, connected, answer}: AnswerColumnProps) {
  const info = getProvider(provider);

  return (
    <section
      aria-label={`${info.name} answer`}
      aria-busy={answer.status === 'streaming'}
      className="flex min-h-64 flex-col rounded-lg border bg-card"
    >
      <header className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{info.name}</h2>
          <p className="truncate font-mono text-xs text-subtle">
            {answer.model ?? info.defaultModel}
          </p>
        </div>
        {answer.status === 'streaming' && (
          <Spinner className="text-muted-foreground" />
        )}
      </header>

      <div className="flex-1 px-4 py-4 text-sm leading-relaxed">
        {!connected ? (
          <div className="flex h-full flex-col items-start justify-center gap-3">
            <p className="text-muted-foreground">No {info.name} key added.</p>
            <Link
              href="/keys"
              className="inline-flex items-center gap-1.5 font-medium text-foreground underline-offset-4 hover:underline"
            >
              Add a key on the API keys page
              <ArrowRightIcon aria-hidden className="size-4" />
            </Link>
          </div>
        ) : answer.status === 'idle' ? (
          <p className="text-subtle">The answer will appear here.</p>
        ) : (
          <>
            {answer.text && (
              <p className="whitespace-pre-wrap">{answer.text}</p>
            )}
            {answer.status === 'error' && (
              <p
                role="alert"
                className="mt-3 flex gap-2 rounded-md border border-destructive/40 bg-danger-surface p-3 text-destructive"
              >
                <CircleAlertIcon
                  aria-hidden
                  className="mt-0.5 size-4 shrink-0"
                />
                {answer.error}
              </p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
