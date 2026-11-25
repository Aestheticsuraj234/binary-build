import {z} from 'zod';

import type {ProviderId} from './providers';

/**
 * Providers that make embeddings, in the order Binary picks them. Anthropic
 * has no embedding models, so it isn't here.
 */
export const EMBEDDING_PROVIDERS = ['openai', 'google'] as const;
export type EmbeddingProviderId = (typeof EMBEDDING_PROVIDERS)[number] &
  ProviderId;

/** The embedding model Binary uses for each provider. */
export const EMBEDDING_MODELS: Record<EmbeddingProviderId, string> = {
  openai: 'text-embedding-3-small',
  google: 'gemini-embedding-001',
};

/** What the Memory and Knowledge pages say when they're off. */
export const EMBEDDINGS_NEED_KEY =
  'Memory and knowledge need an OpenAI or Google key. Anthropic has no ' +
  'embedding models, so its key can’t turn them on. Add an OpenAI or ' +
  'Google key on the API keys page.';

/** Whether this person's memory and knowledge are on, and with what. */
export type EmbeddingStatus =
  | {
      available: true;
      provider: EmbeddingProviderId;
      /** e.g. "openai/text-embedding-3-small". */
      model: string;
    }
  | {available: false; message: string};

/** The longest memory: one lasting fact, not a diary. */
export const MEMORY_MAX_LENGTH = 300;

/**
 * Up to this many memories, a character gets all of them with every
 * message, because a fact like "likes short answers" never looks similar
 * to a question. Above it, the closest ones and the newest ones.
 */
export const ALL_MEMORIES_LIMIT = 20;

/** Who saved a memory. */
export type MemorySource = 'character' | 'person';

/** A memory as the Memory page shows it. */
export interface MemorySummary {
  id: string;
  content: string;
  source: MemorySource;
  /** False when another embedding model made it, so search can't find it. */
  searchable: boolean;
  createdAt: string;
}

/** A character's Memory page. */
export interface MemoriesOverview {
  status: EmbeddingStatus;
  memories: MemorySummary[];
  /** Memories made by another embedding model, which search can't reach. */
  otherModelCount: number;
}

/** What adding a memory did. */
export type AddMemoryResult =
  | {status: 'saved'; memory: MemorySummary}
  | {status: 'duplicate'; memory: MemorySummary};

export const MEMORY_MESSAGES = {
  empty: 'Write the fact to remember.',
  tooLong: `Keep a memory under ${MEMORY_MAX_LENGTH} characters.`,
  secret:
    'That looks like a password, key or other secret. Binary never ' +
    'remembers secrets.',
} as const;

export const addMemorySchema = z.object({
  content: z
    .string({error: MEMORY_MESSAGES.empty})
    .trim()
    .min(1, MEMORY_MESSAGES.empty)
    .max(MEMORY_MAX_LENGTH, MEMORY_MESSAGES.tooLong)
    .refine(text => !looksLikeSecret(text), MEMORY_MESSAGES.secret),
});
export type AddMemoryInput = z.infer<typeof addMemorySchema>;

/** Patterns of keys and tokens that have a recognisable shape. */
const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{16,}/, // OpenAI, Anthropic
  /\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9]{10,}/, // Stripe
  /\bAKIA[0-9A-Z]{16}\b/, // AWS
  /\bgh[pousr]_[A-Za-z0-9]{20,}/, // GitHub
  /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}/, // Slack
  /\bAIza[0-9A-Za-z_-]{30,}/, // Google
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/, // JWT
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
  /\b\d{3}-\d{2}-\d{4}\b/, // US social security number
  // "my password is …", "api key: …", "PIN = …"
  /\b(?:password|passwd|passcode|passphrase|pin|api[ _-]?key|secret|token|otp|2fa code|recovery code|security code|cvv)\b\s*(?:is|was|=|:)\s*\S+/i,
];

/** True for 13 to 19 digits that pass the Luhn check: a card number. */
function hasCardNumber(text: string): boolean {
  for (const match of text.matchAll(/\b(?:\d[ -]?){12,18}\d\b/g)) {
    const digits = match[0].replace(/\D/g, '');
    let sum = 0;
    for (let i = 0; i < digits.length; i++) {
      let digit = Number(digits[digits.length - 1 - i]);
      if (i % 2 === 1) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    if (sum % 10 === 0) {
      return true;
    }
  }
  return false;
}

/** A long run of mixed letters and digits, the way generated keys look. */
function hasKeyLikeToken(text: string): boolean {
  for (const [token] of text.matchAll(/[A-Za-z0-9_\-+/=]{32,}/g)) {
    if (/[A-Za-z]/.test(token) && /\d/.test(token) && !token.includes('//')) {
      return true;
    }
  }
  return false;
}

/**
 * True when `text` looks like it holds a secret: a password, an API key or
 * token, a private key, a card or social security number. Memories never
 * store these, whoever tries to save them.
 */
export function looksLikeSecret(text: string): boolean {
  return (
    SECRET_PATTERNS.some(pattern => pattern.test(text)) ||
    hasCardNumber(text) ||
    hasKeyLikeToken(text)
  );
}

/** Lower case, single spaces, no closing punctuation: for spotting repeats. */
export function normalizeMemory(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?\s]+$/, '')
    .trim();
}

/** The most text one document may hold. */
export const KNOWLEDGE_MAX_CHARACTERS = 500_000;
export const KNOWLEDGE_TITLE_MAX_LENGTH = 120;

/** Files Knowledge reads as text. */
export const KNOWLEDGE_FILE_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.csv',
  '.json',
  '.html',
  '.htm',
] as const;

/** True when `fileName` ends in one of `KNOWLEDGE_FILE_EXTENSIONS`. */
export function isKnowledgeFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return KNOWLEDGE_FILE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export const KNOWLEDGE_MESSAGES = {
  noTitle: 'Give this document a title.',
  titleTooLong: `Keep the title under ${KNOWLEDGE_TITLE_MAX_LENGTH} characters.`,
  noText: 'Paste the text to add.',
  tooLong: `A document can hold up to ${KNOWLEDGE_MAX_CHARACTERS.toLocaleString('en-US')} characters.`,
  badFile: `Binary reads text files: ${KNOWLEDGE_FILE_EXTENSIONS.join(', ')}.`,
  badUrl: 'Enter a full address, starting with https://',
  noQuery: 'Ask a question to try.',
} as const;

const titleSchema = z
  .string({error: KNOWLEDGE_MESSAGES.noTitle})
  .trim()
  .min(1, KNOWLEDGE_MESSAGES.noTitle)
  .max(KNOWLEDGE_TITLE_MAX_LENGTH, KNOWLEDGE_MESSAGES.titleTooLong);

const textSchema = z
  .string({error: KNOWLEDGE_MESSAGES.noText})
  .max(KNOWLEDGE_MAX_CHARACTERS, KNOWLEDGE_MESSAGES.tooLong)
  .refine(text => text.trim().length > 0, KNOWLEDGE_MESSAGES.noText);

/** Adds a document: pasted text, a text file's contents, or a public page. */
export const addKnowledgeSchema = z.discriminatedUnion('kind', [
  z.object({kind: z.literal('text'), title: titleSchema, text: textSchema}),
  z.object({
    kind: z.literal('file'),
    title: titleSchema.refine(isKnowledgeFile, KNOWLEDGE_MESSAGES.badFile),
    text: textSchema,
  }),
  z.object({
    kind: z.literal('url'),
    url: z
      .string({error: KNOWLEDGE_MESSAGES.badUrl})
      .trim()
      .pipe(z.url({protocol: /^https?$/, error: KNOWLEDGE_MESSAGES.badUrl})),
  }),
]);
export type AddKnowledgeInput = z.infer<typeof addKnowledgeSchema>;

export const knowledgeSearchSchema = z.object({
  query: z
    .string({error: KNOWLEDGE_MESSAGES.noQuery})
    .trim()
    .min(1, KNOWLEDGE_MESSAGES.noQuery)
    .max(1000, 'Keep the question under 1,000 characters.'),
});

/** A document as the Knowledge page shows it. */
export interface KnowledgeDocumentSummary {
  id: string;
  title: string;
  kind: 'text' | 'file' | 'url';
  url: string | null;
  characters: number;
  /** How many passages it was cut into. */
  passages: number;
  /** Passages made by another embedding model, which search can't reach. */
  otherModelPassages: number;
  createdAt: string;
}

/** The Knowledge page. */
export interface KnowledgeOverview {
  status: EmbeddingStatus;
  documents: KnowledgeDocumentSummary[];
}

/** A passage a search found. */
export interface KnowledgeMatch {
  documentId: string;
  title: string;
  url: string | null;
  /** Its place in the document, from 0. */
  position: number;
  content: string;
  /** How close in meaning, from 0 to 1. */
  similarity: number;
}
