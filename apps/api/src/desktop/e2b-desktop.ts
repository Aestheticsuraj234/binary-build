import {Sandbox} from '@e2b/desktop';

import type {DesktopHandle, DesktopProvider} from './provider';

function isGone(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : '';
  return /not ?found|404|not running|paused|expired/i.test(text);
}

function handleOf(desktop: Sandbox, liveUrl: string | null): DesktopHandle {
  return {
    id: desktop.sandboxId,
    liveUrl,
    keepAlive: ms => desktop.setTimeout(ms),
    async screenshot() {
      return Buffer.from(await desktop.screenshot());
    },
    async screenSize() {
      return desktop.getScreenSize();
    },
    async click(x, y, {button, double}) {
      if (double) {
        await desktop.doubleClick(x, y);
      } else if (button === 'right') {
        await desktop.rightClick(x, y);
      } else {
        await desktop.leftClick(x, y);
      }
    },
    type: text => desktop.write(text),
    press: keys => desktop.press(keys.length === 1 ? keys[0]! : keys),
    scroll: (direction, amount) => desktop.scroll(direction, amount),
    open: target => desktop.open(target),
    wait: ms => desktop.wait(ms),
  };
}

/**
 * Cloud desktops from E2B Desktop: a Linux desktop per chat, with a
 * view-only live stream the person can watch while the model works.
 */
export class E2BDesktopProvider implements DesktopProvider {
  readonly name = 'e2b';

  constructor(private readonly apiKey: string) {}

  async create({
    timeoutMs,
    metadata,
  }: {
    timeoutMs: number;
    metadata: Record<string, string>;
  }): Promise<DesktopHandle> {
    const desktop = await Sandbox.create({
      apiKey: this.apiKey,
      timeoutMs,
      metadata,
    });
    await desktop.stream.start();
    const liveUrl = desktop.stream.getUrl({viewOnly: true});
    return handleOf(desktop, liveUrl);
  }

  async connect(id: string): Promise<DesktopHandle | null> {
    try {
      const desktop = await Sandbox.connect(id, {apiKey: this.apiKey});
      // The live URL was saved when it started; it isn't needed here.
      return handleOf(desktop, null);
    } catch (error) {
      if (isGone(error)) {
        return null;
      }
      throw error;
    }
  }

  async kill(id: string): Promise<void> {
    try {
      await Sandbox.kill(id, {apiKey: this.apiKey});
    } catch (error) {
      if (!isGone(error)) {
        throw error;
      }
    }
  }
}
