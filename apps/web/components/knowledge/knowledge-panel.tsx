'use client';

import type {
  AddKnowledgeInput,
  KnowledgeDocumentSummary,
  KnowledgeMatch,
} from '@binary/shared';
import {
  addKnowledgeSchema,
  KNOWLEDGE_FILE_EXTENSIONS,
  KNOWLEDGE_MAX_CHARACTERS,
  knowledgeSearchSchema,
  validate,
} from '@binary/shared';
import {cn} from 'cn';
import type {LucideIcon} from 'lucide-react';
import {
  FileTextIcon,
  GlobeIcon,
  PlusIcon,
  RefreshCwIcon,
  SearchIcon,
  TextIcon,
  Trash2Icon,
} from 'lucide-react';
import type {FormEvent} from 'react';
import {useState} from 'react';

import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {Textarea} from '@/components/ui/textarea';
import {ApiError, callApi} from '@/lib/client-api';

type Kind = AddKnowledgeInput['kind'];

const KINDS: Array<{kind: Kind; label: string; icon: LucideIcon}> = [
  {kind: 'text', label: 'Paste text', icon: TextIcon},
  {kind: 'file', label: 'Upload a file', icon: FileTextIcon},
  {kind: 'url', label: 'Web page', icon: GlobeIcon},
];

const KIND_ICONS: Record<Kind, LucideIcon> = {
  text: TextIcon,
  file: FileTextIcon,
  url: GlobeIcon,
};

function errorText(caught: unknown): string {
  return caught instanceof ApiError ? caught.message : String(caught);
}

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/** Paste text, pick a text file or give a public address. */
function AddDocument({
  onAdded,
}: {
  onAdded: (document: KnowledgeDocumentSummary) => void;
}) {
  const [kind, setKind] = useState<Kind>('text');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [file, setFile] = useState<{name: string; text: string} | null>(null);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string>();
  const [isAdding, setIsAdding] = useState(false);

  async function pickFile(picked: File | undefined) {
    setError(undefined);
    setFile(null);
    if (!picked) return;
    const contents = await picked.text();
    if (contents.length > KNOWLEDGE_MAX_CHARACTERS) {
      setError(
        `That file is too long: a document can hold up to ${KNOWLEDGE_MAX_CHARACTERS.toLocaleString()} characters.`,
      );
      return;
    }
    setFile({name: picked.name, text: contents});
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    const input =
      kind === 'text'
        ? {kind, title, text}
        : kind === 'file'
          ? {kind, title: file?.name ?? '', text: file?.text ?? ''}
          : {kind, url};
    if (kind === 'file' && !file) {
      setError('Choose a file to add.');
      return;
    }
    const checked = validate(addKnowledgeSchema, input);
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsAdding(true);
    try {
      const {document} = await callApi<{document: KnowledgeDocumentSummary}>(
        '/api/knowledge',
        {method: 'POST', body: checked.data},
      );
      onAdded(document);
      setTitle('');
      setText('');
      setFile(null);
      setUrl('');
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsAdding(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <div
        role="radiogroup"
        aria-label="What to add"
        className="flex flex-wrap gap-2"
      >
        {KINDS.map(({kind: k, label, icon: Icon}) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => {
              setKind(k);
              setError(undefined);
            }}
            className={cn(
              'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm transition-colors',
              kind === k
                ? 'border-foreground/40 bg-secondary font-medium'
                : 'text-muted-foreground hover:bg-secondary/60',
            )}
          >
            <Icon aria-hidden className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {kind === 'text' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc-title" className="text-sm font-medium">
              Title
            </label>
            <Input
              id="doc-title"
              value={title}
              placeholder="Team handbook"
              onChange={event => setTitle(event.target.value)}
              className="h-11"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="doc-text" className="text-sm font-medium">
              Text
            </label>
            <Textarea
              id="doc-text"
              value={text}
              rows={8}
              placeholder="Paste the document here."
              onChange={event => setText(event.target.value)}
            />
          </div>
        </>
      )}
      {kind === 'file' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-file" className="text-sm font-medium">
            File
          </label>
          <Input
            id="doc-file"
            type="file"
            accept={KNOWLEDGE_FILE_EXTENSIONS.join(',')}
            onChange={event => void pickFile(event.target.files?.[0])}
            className="h-11 py-2"
          />
          <p className="text-xs text-muted-foreground">
            Text files: {KNOWLEDGE_FILE_EXTENSIONS.join(', ')}.
            {file && ` ${file.name}: ${plural(file.text.length, 'character')}.`}
          </p>
        </div>
      )}
      {kind === 'url' && (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="doc-url" className="text-sm font-medium">
            Address
          </label>
          <Input
            id="doc-url"
            type="url"
            inputMode="url"
            value={url}
            placeholder="https://example.com/handbook"
            onChange={event => setUrl(event.target.value)}
            className="h-11"
          />
          <p className="text-xs text-muted-foreground">
            A public page. Binary reads its text once, now.
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div>
        <Button type="submit" size="lg" className="h-11" disabled={isAdding}>
          {isAdding ? <Spinner /> : <PlusIcon aria-hidden />}
          {isAdding ? 'Reading and indexing…' : 'Add to knowledge'}
        </Button>
      </div>
    </form>
  );
}

function DocumentRow({
  document,
  onDeleted,
}: {
  document: KnowledgeDocumentSummary;
  onDeleted: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const Icon = KIND_ICONS[document.kind];

  async function remove() {
    setBusy(true);
    try {
      await callApi(`/api/knowledge/${document.id}`, {method: 'DELETE'});
      onDeleted();
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  }

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-start gap-3">
        <Icon
          aria-hidden
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{document.title}</p>
          <p className="text-xs text-muted-foreground">
            {plural(document.passages, 'passage')} ·{' '}
            {plural(document.characters, 'character')}
            {document.url && (
              <>
                {' · '}
                <a
                  href={document.url}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {new URL(document.url).hostname}
                </a>
              </>
            )}
          </p>
        </div>
        {!confirming && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`Delete ${document.title}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2Icon aria-hidden />
            Delete
          </Button>
        )}
      </div>
      {confirming && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Delete {document.title}? Characters can’t search it after this.
          </span>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={() => void remove()}
            disabled={busy}
          >
            {busy && <Spinner />}
            Delete
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setConfirming(false)}
          >
            Keep it
          </Button>
        </div>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </li>
  );
}

/** "Try a question": the passages a character would find for it. */
function TryAQuestion() {
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<KnowledgeMatch[] | null>(null);
  const [error, setError] = useState<string>();
  const [isSearching, setIsSearching] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const checked = validate(knowledgeSearchSchema, {query});
    if (!checked.success) {
      setError(checked.firstError);
      return;
    }
    setError(undefined);
    setIsSearching(true);
    try {
      const result = await callApi<{matches: KnowledgeMatch[]}>(
        '/api/knowledge/search',
        {method: 'POST', body: checked.data},
      );
      setMatches(result.matches);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsSearching(false);
    }
  }

  return (
    <section aria-labelledby="try-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="try-heading" className="font-semibold">
          Try a question
        </h2>
        <p className="text-sm text-muted-foreground">
          See which passages a character would find, closest first.
        </p>
      </div>
      <form onSubmit={submit} noValidate className="flex gap-2">
        <Input
          aria-label="Question"
          value={query}
          placeholder="How many vacation days do I get?"
          onChange={event => setQuery(event.target.value)}
          className="h-11"
        />
        <Button
          type="submit"
          variant="secondary"
          className="h-11"
          disabled={isSearching}
        >
          {isSearching ? <Spinner /> : <SearchIcon aria-hidden />}
          Search
        </Button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {matches !== null &&
        (matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing to search yet.
          </p>
        ) : (
          <ol className="flex flex-col gap-2">
            {matches.map(match => (
              <li
                key={`${match.documentId}-${match.position}`}
                className="rounded-lg border bg-card p-4"
              >
                <p className="mb-2 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate font-medium text-foreground">
                    {match.title}
                  </span>
                  <span className="shrink-0 tabular-nums">
                    {Math.round(match.similarity * 100)}% close
                  </span>
                </p>
                <p className="line-clamp-5 text-sm whitespace-pre-line">
                  {match.content}
                </p>
              </li>
            ))}
          </ol>
        ))}
    </section>
  );
}

/** Add, list and delete documents; re-index; try a question. */
export function KnowledgePanel({
  initialDocuments,
}: {
  initialDocuments: KnowledgeDocumentSummary[];
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [isReindexing, setIsReindexing] = useState(false);
  const [error, setError] = useState<string>();
  const stale = documents.reduce((n, d) => n + d.otherModelPassages, 0);

  async function reindex() {
    setIsReindexing(true);
    setError(undefined);
    try {
      await callApi('/api/knowledge/reindex', {method: 'POST'});
      setDocuments(current =>
        current.map(d => ({...d, otherModelPassages: 0})),
      );
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setIsReindexing(false);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <AddDocument
        onAdded={document => setDocuments(current => [document, ...current])}
      />

      {stale > 0 && (
        <div className="flex flex-col items-start gap-3 rounded-lg border border-warning/40 bg-warning-surface p-4 text-sm sm:flex-row sm:items-center">
          <p className="flex-1 text-warning">
            {plural(stale, 'passage')} {stale === 1 ? 'was' : 'were'} made by
            another embedding model, so search can’t find{' '}
            {stale === 1 ? 'it' : 'them'}. Re-index to fix that.
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
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section aria-labelledby="documents-heading">
        <h2 id="documents-heading" className="mb-3 font-semibold">
          {plural(documents.length, 'document')}
        </h2>
        {documents.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
            Nothing here yet. Add a handbook, your notes or a web page, and
            every character can search it.
          </p>
        ) : (
          <ul className="divide-y rounded-lg border bg-card">
            {documents.map(document => (
              <DocumentRow
                key={document.id}
                document={document}
                onDeleted={() =>
                  setDocuments(current =>
                    current.filter(d => d.id !== document.id),
                  )
                }
              />
            ))}
          </ul>
        )}
      </section>

      {documents.length > 0 && <TryAQuestion />}
    </div>
  );
}
