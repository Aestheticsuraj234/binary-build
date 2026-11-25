'use client';

import type {AddMemoryResult, MemorySummary} from '@binary/shared';
import {addMemorySchema, MEMORY_MAX_LENGTH, validate} from '@binary/shared';
import {PlusIcon, RefreshCwIcon, Trash2Icon} from 'lucide-react';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

function errorText(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : String(caught);
}

function MemoryRow({
  memory,
  agentName,
  onForget,
}: {
  memory: MemorySummary;
  agentName: string;
  onForget: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const added = new Date(memory.createdAt).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return (
    <li className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm break-words">{memory.content}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {memory.source === 'person'
            ? 'Added by you'
            : `Saved by ${agentName}`}{' '}
          · {added}
          {!memory.searchable && ' · made by another model'}
        </p>
        {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        aria-label={`Forget "${memory.content}"`}
        onClick={() => {
          setBusy(true);
          setError(undefined);
          onForget().catch(caught => {
            setError(errorText(caught));
            setBusy(false);
          });
        }}
      >
        {busy ? <Spinner /> : <Trash2Icon aria-hidden />}
        Forget
      </Button>
    </li>
  );
}

/**
 * A character's memories: add one yourself, or forget any. Memories the
 * character saved in chats show up here too.
 */
export function MemoryPanel({
  agentId,
  agentName,
  initialMemories,
  initialOtherModelCount,
  enabled,
}: {
  agentId: string;
  agentName: string;
  initialMemories: MemorySummary[];
  initialOtherModelCount: number;
  /** False without an OpenAI or Google key: you can still forget. */
  enabled: boolean;
}) {
  const [memories, setMemories] = useState(initialMemories);
  const [otherModelCount, setOtherModelCount] = useState(
    initialOtherModelCount,
  );
  const [content, setContent] = useState('');
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);
  const [isReindexing, setIsReindexing] = useState(false);
  const base = `/api/agents/${agentId}/memories`;

  async function add(event: FormEvent) {
    event.preventDefault();
    setNotice(undefined);
    const checked = validate(addMemorySchema, {content});
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsAdding(true);
    try {
      const result = await callApi<AddMemoryResult>(base, {
        method: 'POST',
        body: checked.data,
      });
      if (result.status === 'saved') {
        setMemories(current => [result.memory, ...current]);
        setContent('');
      } else {
        setNotice(`${agentName} already remembers: “${result.memory.content}”`);
      }
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsAdding(false);
    }
  }

  async function forget(memory: MemorySummary) {
    await callApi(`${base}/${memory.id}`, {method: 'DELETE'});
    setMemories(current => current.filter(m => m.id !== memory.id));
    if (!memory.searchable) {
      setOtherModelCount(count => Math.max(0, count - 1));
    }
  }

  async function reindex() {
    setIsReindexing(true);
    setError(undefined);
    try {
      await callApi<{reindexed: number}>(`${base}/reindex`, {method: 'POST'});
      setOtherModelCount(0);
      setMemories(current => current.map(m => ({...m, searchable: true})));
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsReindexing(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {enabled && (
        <form onSubmit={add} noValidate className="flex flex-col gap-2">
          <label htmlFor="memory" className="text-sm font-medium">
            Add a memory
          </label>
          <div className="flex gap-2">
            <Input
              id="memory"
              value={content}
              maxLength={MEMORY_MAX_LENGTH}
              placeholder="Prefers short answers"
              onChange={event => setContent(event.target.value)}
              aria-invalid={error !== undefined}
              aria-describedby="memory-hint"
              className="h-11"
            />
            <Button
              type="submit"
              size="lg"
              className="h-11"
              disabled={isAdding}
            >
              {isAdding ? <Spinner /> : <PlusIcon aria-hidden />}
              Add
            </Button>
          </div>
          <p id="memory-hint" className="text-xs text-muted-foreground">
            One lasting fact about you. Never a password, key or other secret.
          </p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-muted-foreground">
              {notice}
            </p>
          )}
        </form>
      )}

      {enabled && otherModelCount > 0 && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-warning/40 bg-warning-surface p-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1 text-warning">
            {otherModelCount === 1
              ? '1 memory was made by another embedding model'
              : `${otherModelCount} memories were made by another embedding model`}
            , so search can’t find {otherModelCount === 1 ? 'it' : 'them'}.
            Re-index to fix that.
          </p>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void reindex()}
            disabled={isReindexing}
          >
            {isReindexing ? <Spinner /> : <RefreshCwIcon aria-hidden />}
            Re-index
          </Button>
        </div>
      )}

      <section aria-labelledby="memories-heading">
        <h2 id="memories-heading" className="mb-3 font-semibold">
          {memories.length === 1 ? '1 memory' : `${memories.length} memories`}
        </h2>
        {memories.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            {agentName} doesn’t remember anything about you yet. Tell it in a
            chat (“Remember that I prefer short answers”) or add a memory here.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {memories.map(memory => (
              <MemoryRow
                key={memory.id}
                memory={memory}
                agentName={agentName}
                onForget={() => forget(memory)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
