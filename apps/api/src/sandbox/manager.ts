import type {Database, SandboxListItem} from '@binary/db';
import {SandboxRepository} from '@binary/db';
import type {ComputerSummary} from '@binary/shared';
import {SANDBOX_IDLE_MINUTES} from '@binary/shared';

import type {SandboxHandle, SandboxProvider} from './provider';

/** How long a sandbox stays up after its last use. */
export const IDLE_MS = SANDBOX_IDLE_MINUTES * 60 * 1000;

/** Which chat a sandbox belongs to. */
export interface SandboxOwner {
  userId: string;
  threadId: string;
  agentId: string;
}

export function toSandboxSummary({
  sandbox,
  agent,
  threadTitle,
}: SandboxListItem): ComputerSummary {
  return {
    id: sandbox.id,
    kind: 'cloud_sandbox',
    threadId: sandbox.threadId,
    threadTitle,
    agentName: agent.name,
    avatar: agent.avatar ?? 'pebble',
    startedAt: sandbox.startedAt.toISOString(),
    lastUsedAt: sandbox.lastUsedAt.toISOString(),
    expiresAt: sandbox.expiresAt.toISOString(),
    url: null,
  };
}

/**
 * One sandbox per chat. It starts the first time an approved run needs
 * it, is reused while it's alive, and stops after `IDLE_MS` without use
 * (the provider stops it; the row follows), when someone stops it, or
 * when its chat is deleted.
 */
export class SandboxManager {
  private readonly rows: SandboxRepository;

  constructor(
    db: Database,
    /** Null when sandboxes are off (no E2B key). */
    private readonly provider: SandboxProvider | null,
    private readonly now: () => number = Date.now,
  ) {
    this.rows = new SandboxRepository(db);
  }

  get available(): boolean {
    return this.provider !== null;
  }

  private expiry(): Date {
    return new Date(this.now() + IDLE_MS);
  }

  /** Connects to the chat's running sandbox, or null. Never starts one. */
  async existing(owner: SandboxOwner): Promise<SandboxHandle | null> {
    if (!this.provider) {
      return null;
    }
    const row = await this.rows.runningForThread(owner.threadId, owner.userId);
    if (!row) {
      return null;
    }
    const handle = await this.provider.connect(row.externalId);
    if (!handle) {
      // It stopped on the provider's side; the row catches up.
      await this.rows.markStopped([row.id]);
      return null;
    }
    await handle.keepAlive(IDLE_MS);
    await this.rows.touch(row.id, this.expiry());
    return handle;
  }

  /**
   * The chat's sandbox, started if there isn't one. Two runs that start
   * one at the same moment end up sharing one: the loser's is stopped.
   */
  async ensure(owner: SandboxOwner): Promise<SandboxHandle> {
    if (!this.provider) {
      throw new Error('Cloud sandboxes are off on this Binary.');
    }
    const running = await this.existing(owner);
    if (running) {
      return running;
    }
    const created = await this.provider.create({
      timeoutMs: IDLE_MS,
      metadata: {binaryThread: owner.threadId},
    });
    const row = await this.rows.insertRunning({
      ...owner,
      provider: this.provider.name,
      externalId: created.id,
      expiresAt: this.expiry(),
    });
    if (row) {
      return created;
    }
    // Another run got there first: keep one sandbox per chat.
    await this.provider.kill(created.id).catch(() => {});
    const winner = await this.existing(owner);
    if (!winner) {
      throw new Error("Couldn't start this chat's sandbox. Try again.");
    }
    return winner;
  }

  /** This person's running sandboxes, newest first. */
  async listForUser(userId: string): Promise<ComputerSummary[]> {
    await this.rows.expireIdle(new Date(this.now()));
    return (await this.rows.listRunningForUser(userId)).map(toSandboxSummary);
  }

  /** Stops one of this person's sandboxes. False if it isn't theirs. */
  async stop(id: string, userId: string): Promise<boolean> {
    const row = await this.rows.findForUser(id, userId);
    if (!row) {
      return false;
    }
    await this.kill([row]);
    return true;
  }

  /** Stops every sandbox of a chat, for when it's deleted. */
  async stopForThread(threadId: string): Promise<void> {
    await this.kill(await this.rows.allRunningForThread(threadId));
  }

  private async kill(rows: Array<{id: string; externalId: string}>) {
    const stopped = await this.rows.markStopped(rows.map(row => row.id));
    if (this.provider) {
      const provider = this.provider;
      await Promise.all(
        stopped.map(row =>
          provider.kill(row.externalId).catch((error: unknown) => {
            // It stops by itself when idle anyway.
            console.warn('[sandbox] could not stop', row.externalId, error);
          }),
        ),
      );
    }
  }
}
