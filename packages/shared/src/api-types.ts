import type {ApprovalMode} from './approvals';
import type {ComputerKind, ComputerSummary} from './computers';
import type {ProviderId} from './providers';
import type {ToolCallRecord} from './tools';

/**
 * How the API describes one provider's key to the apps. The key itself is
 * never included: only whether it exists and its last 4 characters.
 */
export interface ProviderKeyStatus {
  provider: ProviderId;
  connected: boolean;
  /** Last 4 characters of the key, or null when no key is saved. */
  last4: string | null;
  /** ISO date the key was last saved, or null. */
  updatedAt: string | null;
}

/**
 * One line of the Playground's streamed answer. The API sends these as
 * newline-delimited JSON so text, errors and the end arrive in order.
 */
export type PlaygroundEvent =
  | {type: 'start'; model: string}
  | {type: 'text'; text: string}
  | {type: 'error'; message: string}
  | {type: 'done'};

/**
 * One saved message in a chat. A `note` is from Binary, not a person or
 * the character: "You approved shop refund order."
 */
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'note';
  content: string;
  /** Tools the agent used while answering, in order. */
  toolCalls: ToolCallRecord[];
  /** ISO date. */
  createdAt: string;
}

/**
 * One line of a chat answer, sent as newline-delimited JSON. `start` comes
 * once your message is saved, `delta` carries the next few words, `tool`
 * reports a tool call each time it changes (running, then done, failed or
 * blocked), and the stream ends with `done` (the answer, now saved) or
 * `error` (nothing saved).
 */
export type ChatEvent =
  | {type: 'start'; model: string; userMessage: ChatMessage}
  | {type: 'delta'; text: string}
  | {type: 'tool'; call: ToolCallRecord}
  | {type: 'error'; message: string}
  | {type: 'done'; message: ChatMessage};

/** A chat as Recent chats lists it. */
export interface ThreadSummary {
  id: string;
  /** Named after the first message; null until there is one. */
  title: string | null;
  agentId: string;
  agentName: string;
  /** The character that plays the agent (a `CharacterId`). */
  avatar: string;
  /** ISO date of the last message, used to sort newest first. */
  updatedAt: string;
}

/** A chat with everything needed to pick it up again. */
export interface ThreadDetail {
  thread: ThreadSummary;
  agent: AgentSummary;
  /** A fired agent's chats can be read, but not continued. */
  isFired: boolean;
  messages: ChatMessage[];
  /** This chat's running computers (its sandbox, its browser). */
  computers: ComputerSummary[];
}

/** Error codes the API returns as `{code, message}` with a 4xx status. */
export const API_ERROR_CODES = {
  invalidInput: 'INVALID_INPUT',
  unauthorized: 'UNAUTHORIZED',
  noKey: 'NO_KEY',
  notFound: 'NOT_FOUND',
  readOnly: 'READ_ONLY',
  conflict: 'CONFLICT',
  unsafeUrl: 'UNSAFE_URL',
  appUnreachable: 'APP_UNREACHABLE',
  tooLarge: 'TOO_LARGE',
  jobsUnavailable: 'JOBS_UNAVAILABLE',
  alreadyDecided: 'ALREADY_DECIDED',
} as const;

export type ApiErrorCode =
  (typeof API_ERROR_CODES)[keyof typeof API_ERROR_CODES];

/**
 * An agent as the apps see it: only the fields they need. The owner and
 * timestamps stay on the server.
 */
export interface AgentSummary {
  id: string;
  name: string;
  /** The character that plays this agent (a `CharacterId`). */
  avatar: string;
  role: string;
  instructions: string;
  provider: ProviderId | null;
  model: string | null;
  templateId: string | null;
  /** How freely it may use tools. */
  approvalMode: ApprovalMode;
  /** Its computers: a cloud sandbox, a browser, both or none. */
  computers: ComputerKind[];
}

/** A ready-made starting point for a new agent. */
export interface AgentTemplateSummary {
  id: string;
  slug: string;
  name: string;
  role: string;
  instructions: string;
  /** The character who plays this template (a `CharacterId`). */
  character: string;
  /** The computers a character hired from it starts with. */
  computers: ComputerKind[];
}
