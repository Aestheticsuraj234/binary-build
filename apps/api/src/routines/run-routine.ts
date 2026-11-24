import type {Database} from '@binary/db';
import {
  RoutineRepository,
  RoutineRunRepository,
  UserSettingsRepository,
} from '@binary/db';
import {getProvider} from '@binary/shared';

import type {AnswerDeps} from '../chat/answer';
import {generateAnswer} from '../chat/answer';
import type {Engine} from '../engine/engine';
import type {EngineFactory, ModelBuilder} from '../engine/factory';
import {createEngineFactory, MissingKeyError} from '../engine/factory';
import {builtInTools as defaultBuiltInTools} from '../tools/built-in';
import type {ComposioGateway} from '../tools/composio';
import type {BinaryTool} from '../tools/toolbox';
import type {Vault} from '../vault';
import {VaultError} from '../vault';
import {runPrompt, runTitle} from './prompt';

/** Everything a run needs: the chat pipeline's deps plus an engine factory. */
export interface RunDeps extends AnswerDeps {
  engineFor: EngineFactory;
}

export interface RunOptions {
  /**
   * Also take a run left `running` by an earlier attempt that died. Only a
   * retry of the same job should pass this.
   */
  reclaim?: boolean;
}

/** What happened to a run when a worker picked it up. */
export type RunResult =
  | {status: 'done' | 'failed'}
  /** Another worker has (or had) it, so this one did nothing. */
  | {status: 'skipped'};

/** Runs one queued run to the end. The job runners call this. */
export type RoutineExecutor = (
  runId: string,
  options?: RunOptions,
) => Promise<RunResult>;

/** A problem that ends a run with a message the person can act on. */
class RunFailure extends Error {}

/**
 * Runs one routine run through the same chat pipeline as a normal chat.
 *
 * 1. **Claim** it. A run that's already claimed or finished is skipped, so
 *    a job delivered twice does nothing the second time.
 * 2. **Open a transcript**: a new chat whose first message is the
 *    routine's instructions (plus any webhook data, fenced off as data).
 * 3. **Answer** with the agent's model, tools and rules.
 * 4. **Save the answer and mark the run done in one transaction**, only if
 *    this attempt still owns the run. That is what makes a run answer at
 *    most once.
 *
 * Problems the person can fix (no key, fired agent, the provider failing)
 * end the run as `failed` with a reason. Anything unexpected is thrown, so
 * a durable runner can retry; the run stays `running` until then.
 */
export async function runRoutine(
  deps: RunDeps,
  runId: string,
  {reclaim = false}: RunOptions = {},
): Promise<RunResult> {
  const runs = new RoutineRunRepository(deps.db);
  const claimed = await runs.claim(runId, {reclaim});
  if (!claimed) {
    return {status: 'skipped'};
  }
  const {run, attempt} = claimed;

  try {
    const found = await new RoutineRepository(deps.db).findWithAgent(
      run.routineId,
    );
    if (!found) {
      throw new RunFailure('This routine was deleted.');
    }
    const {routine, agent} = found;
    if (agent.firedAt) {
      throw new RunFailure(
        `${agent.name} was fired, so this routine can't run. Choose someone else to run it.`,
      );
    }
    if (!agent.provider || !agent.model) {
      throw new RunFailure(
        `${agent.name} has no model yet. Pick one on the edit page.`,
      );
    }
    let engine: Engine;
    try {
      engine = await deps.engineFor(
        routine.userId,
        agent.provider,
        agent.model,
      );
    } catch (error) {
      if (error instanceof MissingKeyError || error instanceof VaultError) {
        const name = getProvider(agent.provider).name;
        throw new RunFailure(
          `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page.`,
        );
      }
      throw error;
    }

    const prompt = runPrompt(routine.instructions, run.payload);
    // A retry carries on in the transcript the first attempt opened.
    let threadId = run.threadId;
    if (!threadId) {
      const timeZone =
        (await new UserSettingsRepository(deps.db).timeZoneOf(
          routine.userId,
        )) ?? 'UTC';
      const thread = await runs.startTranscript(claimed, {
        userId: routine.userId,
        agentId: agent.id,
        title: runTitle(routine.name, run.startedAt ?? new Date(), timeZone),
        prompt,
      });
      if (!thread) {
        return {status: 'skipped'};
      }
      threadId = thread.id;
    }

    const outcome = await generateAnswer(deps, {
      engine,
      agent,
      userId: routine.userId,
      prompt,
      history: [],
      run: {routineName: routine.name, hasWebhookData: run.payload !== null},
    });
    if (!outcome.ok) {
      throw new RunFailure(outcome.error);
    }
    // Requests it made wait in Today; the run itself is done.
    const saved = await runs.completeWithAnswer(claimed, threadId, {
      content: outcome.text,
      toolCalls: outcome.toolCalls,
      approvals: outcome.approvals,
    });
    return saved ? {status: 'done'} : {status: 'skipped'};
  } catch (error) {
    if (error instanceof RunFailure) {
      await runs.fail(run.id, error.message, attempt);
      return {status: 'failed'};
    }
    throw error;
  }
}

export interface ExecutorOptions {
  db: Database;
  vault: Vault;
  /** Tests pass a fake model builder. */
  buildModel?: ModelBuilder;
  builtInTools?: () => BinaryTool[];
  composio?: ComposioGateway | null;
}

/** Builds `runRoutine` with its dependencies filled in. */
export function createRoutineExecutor({
  db,
  vault,
  buildModel,
  builtInTools = defaultBuiltInTools,
  composio = null,
}: ExecutorOptions): RoutineExecutor {
  const deps: RunDeps = {
    db,
    vault,
    builtInTools,
    composio,
    engineFor: createEngineFactory({db, vault, buildModel}),
  };
  return (runId, options) => runRoutine(deps, runId, options);
}
