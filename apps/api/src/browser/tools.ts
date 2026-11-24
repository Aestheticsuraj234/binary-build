import {BROWSER_IDLE_MINUTES} from '@binary/shared';
import {z} from 'zod';

import {UnsafeUrlError} from '../errors';
import {IMAGES_KEY, IMAGES_NOTE_KEY} from '../sandbox/images';
import type {BinaryTool} from '../tools/toolbox';
import type {BrowserManager, BrowserOwner, OpenBrowser} from './manager';
import {BLOCKED_HEADER} from './proxy';
import {
  formatElements,
  normaliseLabel,
  REF_ATTRIBUTE,
  snapshotPage,
} from './snapshot';

/** How long opening a page may take. */
const NAVIGATION_TIMEOUT_MS = 20_000;
/** How long a click or typing may take to find its element. */
const ACTION_TIMEOUT_MS = 5_000;

const NO_BROWSER =
  "This chat's browser isn't open: nothing has been opened yet, or it " +
  `closed after ${BROWSER_IDLE_MINUTES} idle minutes. Open a page first.`;

/**
 * What a step shows: the page's text and numbered elements for the model,
 * and a screenshot for the person (the model never sees it).
 */
async function look(open: OpenBrowser) {
  const snapshot = await snapshotPage(open.page);
  open.elements = snapshot.elements;
  const screenshot = await open.page.screenshot({type: 'jpeg', quality: 70});
  return {
    url: snapshot.url,
    title: snapshot.title,
    text: snapshot.text,
    elements: formatElements(snapshot.elements),
    [IMAGES_KEY]: [{mime: 'image/jpeg', data: screenshot.toString('base64')}],
    [IMAGES_NOTE_KEY]:
      "The person sees a screenshot of this page; you can't, so go by the text.",
  };
}

/** Waits for what an action started (a new page, a form post) to settle. */
async function settle(open: OpenBrowser) {
  await open.page
    .waitForLoadState('domcontentloaded', {timeout: NAVIGATION_TIMEOUT_MS})
    .catch(() => {});
  await open.page.waitForTimeout(300);
}

/**
 * The element `ref` from the last look, checked against the label the
 * character said it means. If the page changed, nothing is done.
 */
function elementFor(open: OpenBrowser, ref: number, label: string) {
  const listed = open.elements.find(element => element.ref === ref);
  if (!listed) {
    throw new Error(
      `There's no element ${ref} on the page now. Read the page again.`,
    );
  }
  const wanted = normaliseLabel(label);
  const actual = normaliseLabel(listed.name);
  if (
    wanted &&
    actual &&
    !actual.includes(wanted) &&
    !wanted.includes(actual)
  ) {
    throw new Error(
      `Element ${ref} is ${listed.role} "${listed.name}" now, not "${label}". ` +
        'Nothing was done. Read the page again.',
    );
  }
  return {
    listed,
    locator: open.page.locator(`[${REF_ATTRIBUTE}="${ref}"]`).first(),
  };
}

/** Why a page didn't open, in words a person can act on. */
async function openError(
  manager: BrowserManager,
  url: URL,
  error: unknown,
): Promise<Error> {
  const blocked = await manager.blockedHosts();
  if (blocked.some(entry => entry.startsWith(`${url.hostname}:`))) {
    return new UnsafeUrlError();
  }
  const text = error instanceof Error ? error.message : String(error);
  if (/ERR_TUNNEL_CONNECTION_FAILED|403/.test(text)) {
    return new UnsafeUrlError(
      'That page sent the browser to an address Binary won’t open.',
    );
  }
  if (/Timeout/i.test(text)) {
    return new Error(`${url.host} took too long to load.`);
  }
  return new Error(`Couldn't open ${url.host}.`);
}

/**
 * The browser tools for one chat. Looking (opening, reading, scrolling,
 * going back) is `read`; clicking, typing and pressing keys act on the
 * page, so they're `computer` tools that ask first. Elements are picked by
 * their number in the last look, never by CSS selector.
 */
export function browserTools(
  manager: BrowserManager,
  owner: BrowserOwner,
): BinaryTool[] {
  const source = (tool: string) => ({kind: 'browser' as const, tool});
  const current = () => {
    const open = manager.existing(owner.threadId, owner.userId);
    if (!open) {
      throw new Error(NO_BROWSER);
    }
    return open;
  };
  const refInput = {
    ref: z
      .number()
      .int()
      .positive()
      .describe('The element number, from the list.'),
    element: z
      .string()
      .min(1)
      .describe('Its label exactly as listed, e.g. "More information…".'),
  };

  return [
    {
      name: 'browser_open',
      description:
        "Opens a public web page in this chat's browser. Returns the page's " +
        'text and a numbered list of what can be clicked or typed into. The ' +
        'person sees a screenshot.',
      risk: 'read',
      source: source('browser_open'),
      inputSchema: z.object({
        url: z.string().min(1).describe('A full http or https address.'),
      }),
      async run(input) {
        const {url: raw} = input as {url: string};
        let url: URL;
        try {
          url = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
        } catch {
          throw new Error(`"${raw}" isn't a web address.`);
        }
        if (url.protocol !== 'http:' && url.protocol !== 'https:') {
          throw new UnsafeUrlError(
            'Binary only opens http and https addresses.',
          );
        }
        // Refused before the browser even starts.
        await manager.resolve(url.hostname);
        const open = await manager.ensure(owner);
        let response: Awaited<ReturnType<typeof open.page.goto>>;
        try {
          response = await open.page.goto(url.toString(), {
            waitUntil: 'domcontentloaded',
            timeout: NAVIGATION_TIMEOUT_MS,
          });
        } catch (error) {
          throw await openError(manager, url, error);
        }
        // It redirected somewhere private, and the proxy refused it.
        if (response?.headers()[BLOCKED_HEADER]) {
          await open.page.goto('about:blank').catch(() => {});
          throw new UnsafeUrlError(
            'That page sent the browser to an address Binary won’t open.',
          );
        }
        await open.page.waitForTimeout(300);
        return look(open);
      },
    },
    {
      name: 'browser_read',
      description:
        "Reads the page open in this chat's browser again: its text and " +
        'numbered elements.',
      risk: 'read',
      source: source('browser_read'),
      inputSchema: z.object({}),
      async run() {
        return look(current());
      },
    },
    {
      name: 'browser_scroll',
      description: "Scrolls the page in this chat's browser up or down.",
      risk: 'read',
      source: source('browser_scroll'),
      inputSchema: z.object({direction: z.enum(['down', 'up'])}),
      async run(input) {
        const {direction} = input as {direction: 'down' | 'up'};
        const open = current();
        await open.page.mouse.wheel(0, direction === 'down' ? 700 : -700);
        await open.page.waitForTimeout(300);
        return look(open);
      },
    },
    {
      name: 'browser_back',
      description: "Goes back one page in this chat's browser.",
      risk: 'read',
      source: source('browser_back'),
      inputSchema: z.object({}),
      async run() {
        const open = current();
        await open.page
          .goBack({
            waitUntil: 'domcontentloaded',
            timeout: NAVIGATION_TIMEOUT_MS,
          })
          .catch(() => {});
        return look(open);
      },
    },
    {
      name: 'browser_click',
      description:
        'Clicks an element by its number from the latest list (and its ' +
        'label, so the person sees what you mean). Asks the person first.',
      risk: 'computer',
      source: source('browser_click'),
      inputSchema: z.object(refInput),
      async run(input) {
        const {ref, element} = input as {ref: number; element: string};
        const open = current();
        const {locator} = elementFor(open, ref, element);
        await locator.click({timeout: ACTION_TIMEOUT_MS});
        await settle(open);
        return look(open);
      },
    },
    {
      name: 'browser_type',
      description:
        'Types text into a field by its number from the latest list, ' +
        'replacing what is there. Set submit to press Enter after. Asks the ' +
        'person first.',
      risk: 'computer',
      source: source('browser_type'),
      inputSchema: z.object({
        ...refInput,
        text: z.string().describe('What to type.'),
        submit: z.boolean().optional().describe('Press Enter afterwards.'),
      }),
      async run(input) {
        const {ref, element, text, submit} = input as {
          ref: number;
          element: string;
          text: string;
          submit?: boolean;
        };
        const open = current();
        const {locator} = elementFor(open, ref, element);
        await locator.fill(text, {timeout: ACTION_TIMEOUT_MS});
        if (submit) {
          await locator.press('Enter', {timeout: ACTION_TIMEOUT_MS});
        }
        await settle(open);
        return look(open);
      },
    },
    {
      name: 'browser_press',
      description:
        'Presses a key in the page, like Enter, Tab, Escape or ArrowDown. ' +
        'Asks the person first.',
      risk: 'computer',
      source: source('browser_press'),
      inputSchema: z.object({
        key: z
          .enum([
            'Enter',
            'Tab',
            'Escape',
            'ArrowDown',
            'ArrowUp',
            'ArrowLeft',
            'ArrowRight',
            'PageDown',
            'PageUp',
            'Backspace',
            'Space',
          ])
          .describe('The key to press.'),
      }),
      async run(input) {
        const {key} = input as {key: string};
        const open = current();
        await open.page.keyboard.press(key === 'Space' ? ' ' : key);
        await settle(open);
        return look(open);
      },
    },
  ];
}
