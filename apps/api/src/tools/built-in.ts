import {z} from 'zod';

import type {FetchedPage} from './safe-fetch';
import {createPageFetcher, htmlToText} from './safe-fetch';
import type {BinaryTool} from './toolbox';

/** The most page text handed to the model, so one page can't flood it. */
export const PAGE_TEXT_MAX_CHARS = 20_000;

const timeInput = z.object({
  timeZone: z
    .string()
    .optional()
    .describe('An IANA time zone like "Asia/Tokyo". Leave out for UTC.'),
});

/** `get_current_time`: the date and time now, anywhere. */
export function currentTimeTool(
  now: () => Date = () => new Date(),
): BinaryTool {
  return {
    name: 'get_current_time',
    description: 'Get the current date and time, optionally in a time zone.',
    risk: 'read',
    inputSchema: timeInput,
    async run(input) {
      const {timeZone = 'UTC'} = timeInput.parse(input);
      let formatted: string;
      try {
        formatted = new Intl.DateTimeFormat('en-US', {
          timeZone,
          dateStyle: 'full',
          timeStyle: 'long',
        }).format(now());
      } catch {
        throw new Error(`"${timeZone}" isn't a time zone I know.`);
      }
      return {timeZone, now: formatted, iso: now().toISOString()};
    },
  };
}

const pageInput = z.object({
  url: z.string().describe('The full address, starting with https://'),
});

/** `fetch_web_page`: the readable text of a public page. */
export function webPageTool(
  fetchPage: (
    url: string,
    signal?: AbortSignal,
  ) => Promise<FetchedPage> = createPageFetcher(),
): BinaryTool {
  return {
    name: 'fetch_web_page',
    description:
      'Read the text of a public web page. Only public internet addresses work.',
    risk: 'read',
    inputSchema: pageInput,
    async run(input, signal) {
      const {url} = pageInput.parse(input);
      let page: FetchedPage;
      try {
        page = await fetchPage(url, signal);
      } catch (error) {
        // Our own errors already say what went wrong, safely.
        throw new Error(
          error instanceof Error ? error.message : "Couldn't open that page.",
          {cause: error},
        );
      }
      const type = page.contentType.toLowerCase();
      const isHtml = type.includes('html') || /^\s*</.test(page.body);
      const isText =
        isHtml || type.startsWith('text/') || type.includes('json');
      if (!isText) {
        throw new Error(`That page isn't text (it's ${type || 'unknown'}).`);
      }
      const {title, text} = isHtml
        ? htmlToText(page.body)
        : {title: '', text: page.body.trim()};
      const truncated = page.truncated || text.length > PAGE_TEXT_MAX_CHARS;
      return {
        url: page.url,
        status: page.status,
        title,
        text: text.slice(0, PAGE_TEXT_MAX_CHARS),
        truncated,
      };
    },
  };
}

/** Every built-in tool. */
export function builtInTools(): BinaryTool[] {
  return [currentTimeTool(), webPageTool()];
}
