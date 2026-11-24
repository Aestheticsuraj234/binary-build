import type {MessageRow} from '@binary/db';
import type {ChatTurn, ToolCallRecord} from '@binary/shared';
import {readableToolName} from '@binary/shared';

/** The most of a tool's input or result a note passes to the model. */
const MAX_NOTE_CHARS = 4000;

function clip(value: unknown): string {
  const text =
    typeof value === 'string' ? value : (JSON.stringify(value ?? null) ?? '');
  return text.length > MAX_NOTE_CHARS
    ? `${text.slice(0, MAX_NOTE_CHARS)}…`
    : text;
}

/**
 * What a note from Binary tells the model: what the person decided, and
 * what happened. `followUp` adds what to do now; later turns just read it
 * as part of the conversation.
 */
export function noteForModel(
  note: Pick<MessageRow, 'content' | 'toolCalls'>,
  {followUp = false}: {followUp?: boolean} = {},
): string {
  const call = (note.toolCalls as ToolCallRecord[])[0];
  if (!call) {
    return `Note from Binary, not the person: ${note.content}`;
  }
  const what = `your request to use ${call.name} with ${clip(call.input)}`;
  let text: string;
  switch (call.status) {
    case 'done':
      text =
        `The person approved ${what}. It ran once and returned: ` +
        `${clip(call.output)}.` +
        (followUp ? ' Tell them what happened.' : '');
      break;
    case 'failed':
      text =
        `The person approved ${what}, but it failed: ${call.error ?? 'unknown error'}.` +
        (followUp ? ' Tell them, and suggest what they could do.' : '');
      break;
    case 'rejected':
      text =
        `The person rejected ${what}. It did not run. Don't try it again ` +
        'unless they ask.' +
        (followUp ? ' Acknowledge it briefly.' : '');
      break;
    default:
      text = note.content;
  }
  return `Note from Binary, not the person: ${text}`;
}

/** The note people see in the chat. */
export function noteForPerson(call: ToolCallRecord): string {
  const name = readableToolName(call.name);
  switch (call.status) {
    case 'done':
      return `You approved ${name}.`;
    case 'failed':
      return `You approved ${name}, but it failed.`;
    default:
      return `You rejected ${name}.`;
  }
}

/** Saved messages as the model reads them: notes become turns from Binary. */
export function modelTurns(
  rows: ReadonlyArray<Pick<MessageRow, 'role' | 'content' | 'toolCalls'>>,
): ChatTurn[] {
  return rows.map(row =>
    row.role === 'note'
      ? {role: 'user', content: noteForModel(row)}
      : {role: row.role, content: row.content},
  );
}
