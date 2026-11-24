import type {AgentRow} from '@binary/db';
import {ENGINE_INFO, getProvider} from '@binary/shared';

import type {RunnerAccess} from '../runners/access';
import {VaultError} from '../vault';
import {CliEngine} from './cli-engine';
import type {Engine} from './engine';
import type {EngineFactory} from './factory';
import {MissingKeyError} from './factory';

/** An engine for an agent, or why it can't think right now (safe to show). */
export type AgentEngine =
  {ok: true; engine: Engine} | {ok: false; error: string};

/**
 * What an agent thinks with: its API model (with the person's key), or
 * Claude Code / Codex on its Runner. Chats, routines and follow-ups all
 * get their engine here.
 */
export async function engineForAgent(
  {engineFor, runners}: {engineFor: EngineFactory; runners: RunnerAccess},
  agent: AgentRow,
  userId: string,
): Promise<AgentEngine> {
  if (agent.engine !== 'api') {
    if (!agent.runnerId) {
      return {
        ok: false,
        error: `${agent.name} thinks with ${ENGINE_INFO[agent.engine].label}, which runs on your computer. Choose a computer on the edit page.`,
      };
    }
    return {
      ok: true,
      engine: new CliEngine(
        runners,
        {userId, runnerId: agent.runnerId},
        agent.engine,
        agent.approvalMode,
      ),
    };
  }
  if (!agent.provider || !agent.model) {
    return {
      ok: false,
      error: `${agent.name} has no model yet. Pick one on the edit page.`,
    };
  }
  try {
    return {
      ok: true,
      engine: await engineFor(userId, agent.provider, agent.model),
    };
  } catch (error) {
    if (error instanceof MissingKeyError || error instanceof VaultError) {
      const name = getProvider(agent.provider).name;
      return {
        ok: false,
        error: `${agent.name} thinks with ${name}. Add your ${name} key on the API keys page.`,
      };
    }
    throw error;
  }
}
