import type {Database} from '@binary/db';
import {ThreadRepository} from '@binary/db';
import type {ComputerSummary, ComputersOverview} from '@binary/shared';
import {BROWSER_IDLE_MINUTES, SANDBOX_IDLE_MINUTES} from '@binary/shared';

import type {BrowserManager} from './browser/manager';
import type {SandboxManager} from './sandbox/manager';

/**
 * Every kind of computer in one place: cloud sandboxes (rows, on E2B) and
 * browsers (in this API's memory). Lists them together and stops either by
 * id, so the chat, Apps & tools and chat deletion don't care which is which.
 */
export class Computers {
  private readonly threads: ThreadRepository;

  constructor(
    db: Database,
    readonly sandboxes: SandboxManager,
    readonly browsers: BrowserManager,
  ) {
    this.threads = new ThreadRepository(db);
  }

  /** This person's open browsers, with their chat and character. */
  private async browsersFor(userId: string): Promise<ComputerSummary[]> {
    const open = this.browsers.listForUser(userId);
    const summaries = await Promise.all(
      open.map(async browser => {
        const found = await this.threads.findForUser(
          browser.owner.threadId,
          userId,
        );
        if (!found) {
          return null;
        }
        const summary: ComputerSummary = {
          id: browser.id,
          kind: 'browser',
          threadId: browser.owner.threadId,
          threadTitle: found.thread.title,
          agentName: found.agent.name,
          avatar: found.agent.avatar ?? 'pebble',
          startedAt: browser.startedAt.toISOString(),
          lastUsedAt: browser.lastUsedAt.toISOString(),
          expiresAt: this.browsers.expiresAt(browser).toISOString(),
          url: browser.page.url() === 'about:blank' ? null : browser.page.url(),
        };
        return summary;
      }),
    );
    return summaries.filter(summary => summary !== null);
  }

  /** Everything running for this person, newest first. */
  async listForUser(userId: string): Promise<ComputerSummary[]> {
    const [sandboxes, browsers] = await Promise.all([
      this.sandboxes.available ? this.sandboxes.listForUser(userId) : [],
      this.browsersFor(userId),
    ]);
    return [...sandboxes, ...browsers].sort((a, b) =>
      b.startedAt.localeCompare(a.startedAt),
    );
  }

  async overview(userId: string): Promise<ComputersOverview> {
    return {
      sandbox: {
        available: this.sandboxes.available,
        idleMinutes: SANDBOX_IDLE_MINUTES,
      },
      browser: {
        available: this.browsers.available,
        idleMinutes: BROWSER_IDLE_MINUTES,
        maxOpen: this.browsers.maxOpen,
      },
      computers: await this.listForUser(userId),
    };
  }

  /** One chat's running computers. */
  async forThread(
    threadId: string,
    userId: string,
  ): Promise<ComputerSummary[]> {
    return (await this.listForUser(userId)).filter(
      computer => computer.threadId === threadId,
    );
  }

  /** Stops one of this person's computers. False if it isn't theirs. */
  async stop(id: string, userId: string): Promise<boolean> {
    if (await this.browsers.closeById(id, userId)) {
      return true;
    }
    return this.sandboxes.stop(id, userId);
  }

  /** Stops a chat's sandbox and browser (before the chat is deleted). */
  async stopForThread(threadId: string): Promise<void> {
    await Promise.all([
      this.sandboxes.stopForThread(threadId),
      this.browsers.close(threadId),
    ]);
  }
}
