import {z} from 'zod';

import {
  IMAGES_FOR_MODEL_KEY,
  IMAGES_KEY,
  IMAGES_NOTE_KEY,
} from '../sandbox/images';
import type {SandboxOwner} from '../sandbox/manager';
import type {BinaryTool} from '../tools/toolbox';
import type {DesktopManager} from './manager';
import type {DesktopHandle} from './provider';

/** How long to let the screen settle after a step. */
const SETTLE_MS = 800;

/**
 * What a step shows: the new screen, for the person and the model alike
 * (the model needs to see it to know where to click next).
 */
async function look(desktop: DesktopHandle, did: string) {
  await desktop.wait(SETTLE_MS);
  const [png, size] = await Promise.all([
    desktop.screenshot(),
    desktop.screenSize(),
  ]);
  return {
    did,
    screen: `${size.width}×${size.height} pixels; (0, 0) is the top left.`,
    [IMAGES_KEY]: [{mime: 'image/png', data: png.toString('base64')}],
    [IMAGES_FOR_MODEL_KEY]: true,
    [IMAGES_NOTE_KEY]:
      'The screenshot is attached: look at it for what to do next.',
  };
}

const KEY = /^[a-z0-9]+(\+[a-z0-9]+)*$/i;

/**
 * The cloud desktop tools for one chat. Taking a screenshot is `read`;
 * clicking, typing, pressing keys, scrolling and opening things act on the
 * desktop, so they're `computer` tools that ask first. Every tool returns
 * the new screen, which the model sees.
 */
export function desktopTools(
  manager: DesktopManager,
  owner: SandboxOwner,
): BinaryTool[] {
  const source = (tool: string) => ({kind: 'desktop' as const, tool});
  const point = {
    x: z.number().int().min(0).describe('Pixels from the left of the screen.'),
    y: z.number().int().min(0).describe('Pixels from the top of the screen.'),
  };

  return [
    {
      name: 'desktop_screenshot',
      description:
        "Looks at this chat's cloud desktop: returns a screenshot you can " +
        'see. Starts the desktop if it is not running yet.',
      risk: 'read',
      source: source('desktop_screenshot'),
      inputSchema: z.object({}),
      async run() {
        return look(await manager.ensure(owner), 'Took a screenshot.');
      },
    },
    {
      name: 'desktop_click',
      description:
        'Clicks at a point on the desktop (from the latest screenshot). Asks ' +
        'the person first.',
      risk: 'computer',
      source: source('desktop_click'),
      inputSchema: z.object({
        ...point,
        button: z.enum(['left', 'right']).optional(),
        double: z.boolean().optional().describe('Double-click.'),
      }),
      async run(input) {
        const {
          x,
          y,
          button = 'left',
          double = false,
        } = input as {
          x: number;
          y: number;
          button?: 'left' | 'right';
          double?: boolean;
        };
        const desktop = await manager.ensure(owner);
        await desktop.click(x, y, {button, double});
        return look(
          desktop,
          `${double ? 'Double-clicked' : 'Clicked'} at (${x}, ${y}).`,
        );
      },
    },
    {
      name: 'desktop_type',
      description: 'Types text where the cursor is. Asks the person first.',
      risk: 'computer',
      source: source('desktop_type'),
      inputSchema: z.object({text: z.string().min(1).max(2000)}),
      async run(input) {
        const {text} = input as {text: string};
        const desktop = await manager.ensure(owner);
        await desktop.type(text);
        return look(desktop, 'Typed the text.');
      },
    },
    {
      name: 'desktop_key',
      description:
        'Presses a key or combination, like "enter", "tab", "ctrl+l" or ' +
        '"alt+f4". Asks the person first.',
      risk: 'computer',
      source: source('desktop_key'),
      inputSchema: z.object({
        keys: z.string().regex(KEY, 'Use keys like "enter" or "ctrl+l".'),
      }),
      async run(input) {
        const {keys} = input as {keys: string};
        const desktop = await manager.ensure(owner);
        await desktop.press(keys.toLowerCase().split('+'));
        return look(desktop, `Pressed ${keys}.`);
      },
    },
    {
      name: 'desktop_scroll',
      description: 'Scrolls the window under the mouse. Asks the person first.',
      risk: 'computer',
      source: source('desktop_scroll'),
      inputSchema: z.object({
        direction: z.enum(['up', 'down']),
        amount: z.number().int().min(1).max(20).optional(),
      }),
      async run(input) {
        const {direction, amount = 3} = input as {
          direction: 'up' | 'down';
          amount?: number;
        };
        const desktop = await manager.ensure(owner);
        await desktop.scroll(direction, amount);
        return look(desktop, `Scrolled ${direction}.`);
      },
    },
    {
      name: 'desktop_open',
      description:
        'Opens a web address in the desktop’s browser. Asks the person first.',
      risk: 'computer',
      source: source('desktop_open'),
      inputSchema: z.object({
        url: z.string().regex(/^https?:\/\//, 'Use a full http(s) address.'),
      }),
      async run(input) {
        const {url} = input as {url: string};
        const desktop = await manager.ensure(owner);
        await desktop.open(url);
        await desktop.wait(2000);
        return look(desktop, `Opened ${url}.`);
      },
    },
  ];
}
