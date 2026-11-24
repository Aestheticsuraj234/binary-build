import {randomUUID} from 'node:crypto';
import {existsSync} from 'node:fs';

import {BROWSER_IDLE_MINUTES, BROWSER_MAX_OPEN} from '@binary/shared';
import type {Browser, BrowserContext, Page} from 'playwright';
import {chromium} from 'playwright';

import {createHostResolver} from '../tools/safe-fetch';
import type {GuardedProxy, HostResolver} from './proxy';
import {startGuardedProxy} from './proxy';
import type {PageElement} from './snapshot';

/** Which chat a browser belongs to. */
export interface BrowserOwner {
  userId: string;
  threadId: string;
  agentId: string;
}

/** One chat's browser: its own context (cookies, storage) and one tab. */
export interface OpenBrowser {
  id: string;
  owner: BrowserOwner;
  context: BrowserContext;
  page: Page;
  startedAt: Date;
  lastUsedAt: Date;
  /** The numbered elements from the last look at the page. */
  elements: PageElement[];
}

export interface BrowserManagerOptions {
  /** Which addresses the browser may reach. Tests loosen this. */
  resolve?: HostResolver;
  idleMs?: number;
  maxOpen?: number;
  /** Whether Chromium is installed. Found out by itself by default. */
  available?: boolean;
}

/** Flags that keep the browser's traffic inside the proxy. */
const CHROMIUM_ARGS = [
  // WebRTC could reach your network without going through the proxy.
  '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
  '--webrtc-ip-handling-policy=disable_non_proxied_udp',
  // No background requests of Chrome's own.
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--no-first-run',
];

/** Whether Playwright's Chromium is installed on this machine. */
function chromiumInstalled(): boolean {
  try {
    return existsSync(chromium.executablePath());
  } catch {
    return false;
  }
}

/**
 * One headless Chromium for this API, with one isolated context per chat.
 * A chat's browser opens the first time it's used, closes after
 * `idleMs` without use or when its chat is deleted, and at most `maxOpen`
 * are open at once (opening one more closes the least recently used).
 * Every request goes through a proxy that only reaches public addresses.
 * Browsers live in memory: restarting the API closes them.
 */
export class BrowserManager {
  private readonly browsers = new Map<string, OpenBrowser>();
  private readonly opening = new Map<string, Promise<OpenBrowser>>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private engine?: Promise<{browser: Browser; proxy: GuardedProxy}>;
  readonly resolve: HostResolver;
  readonly idleMs: number;
  readonly maxOpen: number;
  readonly available: boolean;

  constructor({
    resolve = createHostResolver(),
    idleMs = BROWSER_IDLE_MINUTES * 60 * 1000,
    maxOpen = BROWSER_MAX_OPEN,
    available = chromiumInstalled(),
  }: BrowserManagerOptions = {}) {
    this.resolve = resolve;
    this.idleMs = idleMs;
    this.maxOpen = maxOpen;
    this.available = available;
  }

  /** Starts the proxy and Chromium, once. */
  private start() {
    this.engine ??= (async () => {
      const proxy = await startGuardedProxy(this.resolve);
      // Playwright also stops Chromium's built-in shortcut for localhost
      // (`<-loopback>`), so even loopback requests go through the proxy.
      const browser = await chromium.launch({
        headless: true,
        proxy: {server: proxy.url},
        args: CHROMIUM_ARGS,
      });
      return {browser, proxy};
    })();
    return this.engine;
  }

  /** Hosts the proxy refused lately ("host:port"), newest last. */
  async blockedHosts(): Promise<string[]> {
    return this.engine ? (await this.engine).proxy.blocked : [];
  }

  /** The chat's open browser, if any. Using it keeps it open longer. */
  existing(threadId: string, userId: string): OpenBrowser | null {
    const open = this.browsers.get(threadId);
    if (!open || open.owner.userId !== userId) {
      return null;
    }
    this.touch(open);
    return open;
  }

  /** The chat's browser, opened if there isn't one. */
  async ensure(owner: BrowserOwner): Promise<OpenBrowser> {
    if (!this.available) {
      throw new Error('There is no browser on this Binary.');
    }
    const open = this.existing(owner.threadId, owner.userId);
    if (open) {
      return open;
    }
    // Two steps that open it at the same moment share one browser.
    let pending = this.opening.get(owner.threadId);
    if (!pending) {
      pending = this.open(owner).finally(() =>
        this.opening.delete(owner.threadId),
      );
      this.opening.set(owner.threadId, pending);
    }
    return pending;
  }

  private async open(owner: BrowserOwner): Promise<OpenBrowser> {
    while (this.browsers.size >= this.maxOpen) {
      const oldest = [...this.browsers.values()].sort(
        (a, b) => a.lastUsedAt.getTime() - b.lastUsedAt.getTime(),
      )[0]!;
      await this.close(oldest.owner.threadId);
    }
    const {browser} = await this.start();
    const context = await browser.newContext({
      viewport: {width: 1280, height: 800},
      // Service workers could fetch outside what Binary sees.
      serviceWorkers: 'block',
      acceptDownloads: false,
      locale: 'en-US',
    });
    const page = await context.newPage();
    const now = new Date();
    const entry: OpenBrowser = {
      id: randomUUID(),
      owner,
      context,
      page,
      startedAt: now,
      lastUsedAt: now,
      elements: [],
    };
    this.browsers.set(owner.threadId, entry);
    this.touch(entry);
    return entry;
  }

  private touch(entry: OpenBrowser) {
    entry.lastUsedAt = new Date();
    clearTimeout(this.timers.get(entry.owner.threadId));
    const timer = setTimeout(
      () => void this.close(entry.owner.threadId),
      this.idleMs,
    );
    // An idle timer never keeps the API (or a test) running.
    timer.unref();
    this.timers.set(entry.owner.threadId, timer);
  }

  /** When an open browser closes by itself, unless it's used again. */
  expiresAt(entry: OpenBrowser): Date {
    return new Date(entry.lastUsedAt.getTime() + this.idleMs);
  }

  /** This person's open browsers, newest first. */
  listForUser(userId: string): OpenBrowser[] {
    return [...this.browsers.values()]
      .filter(open => open.owner.userId === userId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
  }

  /** Closes a chat's browser. Already closed is fine. */
  async close(threadId: string): Promise<void> {
    const open = this.browsers.get(threadId);
    clearTimeout(this.timers.get(threadId));
    this.timers.delete(threadId);
    if (!open) {
      return;
    }
    this.browsers.delete(threadId);
    await open.context.close().catch(() => {});
  }

  /** Closes one of this person's browsers by id. False if it isn't theirs. */
  async closeById(id: string, userId: string): Promise<boolean> {
    const open = [...this.browsers.values()].find(
      entry => entry.id === id && entry.owner.userId === userId,
    );
    if (!open) {
      return false;
    }
    await this.close(open.owner.threadId);
    return true;
  }

  /** Closes everything, Chromium and the proxy too (on shutdown). */
  async closeAll(): Promise<void> {
    await Promise.all(
      [...this.browsers.keys()].map(threadId => this.close(threadId)),
    );
    if (this.engine) {
      const {browser, proxy} = await this.engine;
      this.engine = undefined;
      await browser.close().catch(() => {});
      await proxy.close();
    }
  }
}
