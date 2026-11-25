import type {
  Database,
  KnowledgeDocumentListItem,
  KnowledgeMatchRow,
} from '@binary/db';
import {KnowledgeRepository} from '@binary/db';
import type {
  AddKnowledgeInput,
  KnowledgeDocumentSummary,
  KnowledgeMatch,
} from '@binary/shared';
import {
  KNOWLEDGE_MAX_CHARACTERS,
  KNOWLEDGE_TITLE_MAX_LENGTH,
} from '@binary/shared';

import type {Embedder} from '../embeddings/embedder';
import {AppError, InvalidInputError} from '../errors';
import type {FetchedPage} from '../tools/safe-fetch';
import {htmlToText} from '../tools/safe-fetch';
import {chunkText} from './chunk';

/** How many passages a search hands back. */
export const KNOWLEDGE_RESULTS = 5;

/** Fetches a public page. Tests pass one that can reach their server. */
export type PageFetcher = (
  url: string,
  signal?: AbortSignal,
) => Promise<FetchedPage>;

export function toDocumentSummary({
  document,
  chunks,
  otherModelChunks,
}: KnowledgeDocumentListItem): KnowledgeDocumentSummary {
  return {
    id: document.id,
    title: document.title,
    kind: document.kind,
    url: document.url,
    characters: document.characters,
    passages: chunks,
    otherModelPassages: otherModelChunks,
    createdAt: document.createdAt.toISOString(),
  };
}

export function toKnowledgeMatch(row: KnowledgeMatchRow): KnowledgeMatch {
  return {
    documentId: row.documentId,
    title: row.title,
    url: row.url,
    position: row.position,
    content: row.content,
    similarity: Math.round(row.similarity * 1000) / 1000,
  };
}

/**
 * What gets embedded for a passage: the document's title goes into its
 * vector, so "what does the handbook say…" finds it, but only the passage
 * itself is stored.
 */
function passageForEmbedding(title: string, passage: string): string {
  return `${title}\n\n${passage}`;
}

/** True for HTML: by file name, or because it starts like a page. */
function isHtml(name: string, text: string): boolean {
  return /\.html?$/i.test(name) || /^\s*<(?:!doctype|html)/i.test(text);
}

/** Opens a public page and reads its text and title. */
async function readPage(
  fetchPage: PageFetcher,
  url: string,
): Promise<{title: string; text: string; url: string}> {
  let page: FetchedPage;
  try {
    page = await fetchPage(url);
  } catch (error) {
    // Our own errors (like "only public addresses") already say what's wrong.
    if (error instanceof AppError) {
      throw error;
    }
    throw new InvalidInputError("Couldn't open that page.", {
      url: "Couldn't open that page.",
    });
  }
  if (page.status >= 400) {
    const message = `That page answered with an error (${page.status}).`;
    throw new InvalidInputError(message, {url: message});
  }
  const type = page.contentType.toLowerCase();
  const html = type.includes('html') || /^\s*</.test(page.body);
  if (!html && !type.startsWith('text/') && !type.includes('json')) {
    const message = `That page isn't text (it's ${type || 'unknown'}).`;
    throw new InvalidInputError(message, {url: message});
  }
  const read = html
    ? htmlToText(page.body)
    : {title: '', text: page.body.trim()};
  return {
    title: read.title || new URL(page.url).hostname,
    text: read.text,
    url: page.url,
  };
}

/**
 * Adds a document to a person's library: reads it (a web page is fetched,
 * only from public addresses), cuts it into passages, embeds them and
 * saves it all at once.
 */
export async function addDocument(
  db: Database,
  embedder: Embedder,
  fetchPage: PageFetcher,
  userId: string,
  input: AddKnowledgeInput,
): Promise<KnowledgeDocumentSummary> {
  let title: string;
  let text: string;
  let url: string | null = null;
  if (input.kind === 'url') {
    ({title, text, url} = await readPage(fetchPage, input.url));
  } else {
    title = input.title;
    text = isHtml(input.title, input.text)
      ? htmlToText(input.text).text
      : input.text;
  }
  title = title.trim().slice(0, KNOWLEDGE_TITLE_MAX_LENGTH);
  text = text.trim().slice(0, KNOWLEDGE_MAX_CHARACTERS);
  if (!text) {
    const field = input.kind === 'url' ? 'url' : 'text';
    throw new InvalidInputError("There's no text in there to add.", {
      [field]: "There's no text in there to add.",
    });
  }

  const passages = chunkText(text);
  const embeddings = await embedder.embed(
    passages.map(passage => passageForEmbedding(title, passage)),
  );
  const repository = new KnowledgeRepository(db);
  const document = await repository.create(
    {userId, title, kind: input.kind, url, characters: text.length},
    passages.map((content, index) => ({
      content,
      embedding: embeddings[index]!,
    })),
    embedder.model,
  );
  return toDocumentSummary({
    document,
    chunks: passages.length,
    otherModelChunks: 0,
  });
}

/** The passages closest in meaning to `query`, from this person's library. */
export async function searchKnowledge(
  db: Database,
  embedder: Embedder,
  userId: string,
  query: string,
  limit = KNOWLEDGE_RESULTS,
): Promise<KnowledgeMatch[]> {
  const [embedding] = await embedder.embed([query]);
  const rows = await new KnowledgeRepository(db).search(
    userId,
    embedding!,
    embedder.model,
    limit,
  );
  return rows.map(toKnowledgeMatch);
}

/** Re-embeds passages another model made. Returns how many. */
export async function reindexKnowledge(
  db: Database,
  embedder: Embedder,
  userId: string,
): Promise<number> {
  const repository = new KnowledgeRepository(db);
  const stale = await repository.listOtherModelChunks(userId, embedder.model);
  const embeddings = await embedder.embed(
    stale.map(chunk => passageForEmbedding(chunk.title, chunk.content)),
  );
  for (const [index, chunk] of stale.entries()) {
    await repository.reembedChunk(
      chunk.id,
      userId,
      embeddings[index]!,
      embedder.model,
    );
  }
  return stale.length;
}
