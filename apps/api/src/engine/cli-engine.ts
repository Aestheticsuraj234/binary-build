import type {
  ApprovalMode,
  ChatTurn,
  EngineKind,
  ProviderId,
  RunnerEvent,
  RunnerJob,
} from '@binary/shared';
import {ENGINE_INFO} from '@binary/shared';

import type {RunnerAccess} from '../runners/access';
import type {Engine, EnginePart, EngineRequest} from './engine';
import {EngineError} from './engine';

/** How long one CLI answer may take. */
const CLI_RUN_MS = 10 * 60 * 1000;

/**
 * A character's approval mode as a CLI permission. The CLI can't stop and
 * ask Binary mid-run, so: Plan only plans, Ask first and Auto-approve
 * reads may only read, and Accept edits may edit files in the shared
 * folder. Shell commands are never allowed.
 */
export function cliPermission(
  mode: ApprovalMode,
): Extract<RunnerJob, {type: 'engine'}>['permission'] {
  switch (mode) {
    case 'plan_only':
      return 'plan';
    case 'accept_edits':
      return 'edits';
    default:
      return 'read_only';
  }
}

/** Earlier turns, written into the prompt (the CLI starts fresh each time). */
function promptWithHistory(prompt: string, history: ChatTurn[] = []): string {
  if (history.length === 0) {
    return prompt;
  }
  const transcript = history
    .map(turn => `${turn.role === 'user' ? 'Person' : 'You'}: ${turn.content}`)
    .join('\n\n');
  return `Our conversation so far:\n\n${transcript}\n\nNow, the person says:\n\n${prompt}`;
}

/**
 * An engine that thinks with Claude Code or Codex, run by the person's
 * Runner in their first shared folder, signed in as them. Its own tool
 * calls stream back as cards; Binary's tools aren't offered to it.
 */
export class CliEngine implements Engine {
  readonly provider: ProviderId;
  readonly model: string;

  constructor(
    private readonly access: RunnerAccess,
    private readonly target: {userId: string; runnerId: string},
    private readonly kind: Exclude<EngineKind, 'api'>,
    private readonly mode: ApprovalMode,
  ) {
    this.provider = kind === 'claude_code' ? 'anthropic' : 'openai';
    this.model = ENGINE_INFO[kind].label;
  }

  async *stream(request: EngineRequest): AsyncIterable<EnginePart> {
    const queue: EnginePart[] = [];
    let wake: (() => void) | undefined;
    let finished: {error?: string} | undefined;
    const push = (part: EnginePart) => {
      queue.push(part);
      wake?.();
    };

    const onEvent = (event: RunnerEvent) => {
      switch (event.type) {
        case 'text':
          push({type: 'text', text: event.text});
          break;
        case 'tool-call':
          push({
            type: 'tool-call',
            id: event.id,
            name: event.name,
            input: event.input,
            risk: event.risk,
          });
          break;
        case 'tool-result':
          push({
            type: 'tool-result',
            id: event.id,
            name: '',
            output: event.output,
          });
          break;
        case 'tool-error':
          push({
            type: 'tool-error',
            id: event.id,
            name: '',
            error: event.error,
          });
          break;
      }
    };

    void this.access
      .run(
        this.target.userId,
        this.target.runnerId,
        {
          type: 'engine',
          engine: this.kind,
          prompt: promptWithHistory(request.prompt, request.history),
          system: request.system ?? '',
          permission: cliPermission(this.mode),
        },
        {onEvent, runMs: CLI_RUN_MS},
      )
      .then(result => {
        finished = result.ok ? {} : {error: result.error};
        wake?.();
      });

    while (true) {
      if (queue.length > 0) {
        yield queue.shift()!;
        continue;
      }
      if (finished) {
        if (finished.error) {
          throw new EngineError('unknown', finished.error);
        }
        return;
      }
      await new Promise<void>(resolve => {
        wake = resolve;
      });
      wake = undefined;
    }
  }
}
