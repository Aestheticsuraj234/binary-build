// `snapshotInPage` runs inside the browser page, so it needs DOM types.
/// <reference lib="dom" />
import type {Page} from 'playwright';

/** One thing on the page the model can act on, by number. */
export interface PageElement {
  ref: number;
  /** link, button, textbox, checkbox, select… */
  role: string;
  /** Its label, as a person would read it. */
  name: string;
  /** What a field holds now (never a password). */
  value?: string;
}

/** What the model reads about a page: no screenshot, no selectors. */
export interface PageSnapshot {
  url: string;
  title: string;
  /** The page's visible text, cut to fit. */
  text: string;
  elements: PageElement[];
}

/** The most elements listed, and the most text kept, per page. */
const MAX_ELEMENTS = 80;
const MAX_TEXT = 6000;

/** The attribute that ties a number in the list to an element on the page. */
export const REF_ATTRIBUTE = 'data-binary-ref';

/**
 * Runs in the page: numbers every visible thing a person could click or
 * type into, tags it with `data-binary-ref`, and returns the list with the
 * page's text. Numbers are fresh on every snapshot.
 *
 * It's sent to the browser as source, so it must not define named inner
 * functions: bundlers (tsx, esbuild) wrap those in a `__name` helper that
 * doesn't exist in the page. Inline callbacks are fine.
 */
function snapshotInPage({
  refAttribute,
  maxElements,
  maxText,
}: {
  refAttribute: string;
  maxElements: number;
  maxText: number;
}) {
  document
    .querySelectorAll(`[${refAttribute}]`)
    .forEach(element => element.removeAttribute(refAttribute));

  const selector = [
    'a[href]',
    'button',
    'input:not([type=hidden])',
    'textarea',
    'select',
    'summary',
    '[contenteditable=""]',
    '[contenteditable="true"]',
    ...[
      'button',
      'link',
      'checkbox',
      'radio',
      'tab',
      'menuitem',
      'option',
      'switch',
      'textbox',
      'combobox',
      'searchbox',
    ].map(role => `[role=${role}]`),
  ].join(',');

  const elements: Array<{
    ref: number;
    role: string;
    name: string;
    value?: string;
  }> = [];
  for (const element of Array.from(document.querySelectorAll(selector))) {
    if (elements.length >= maxElements) {
      break;
    }
    const box = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    if (
      box.width === 0 ||
      box.height === 0 ||
      style.visibility === 'hidden' ||
      style.display === 'none'
    ) {
      continue;
    }
    const tag = element.tagName.toLowerCase();
    const type = (element.getAttribute('type') ?? '').toLowerCase();
    const role =
      element.getAttribute('role') ??
      (tag === 'a'
        ? 'link'
        : tag === 'button' || ['submit', 'button', 'reset'].includes(type)
          ? 'button'
          : tag === 'select'
            ? 'select'
            : type === 'checkbox' || type === 'radio'
              ? type
              : tag === 'input' || tag === 'textarea'
                ? 'textbox'
                : tag === 'summary'
                  ? 'button'
                  : 'textbox');
    const field = element as HTMLInputElement;
    const labelled = element.id
      ? document.querySelector(`label[for="${CSS.escape(element.id)}"]`)
      : null;
    const name = (
      element.getAttribute('aria-label') ||
      (labelled as HTMLElement | null)?.innerText ||
      (element as HTMLElement).innerText ||
      (['submit', 'button'].includes(type) ? field.value : '') ||
      element.getAttribute('placeholder') ||
      element.getAttribute('title') ||
      element.getAttribute('alt') ||
      element.getAttribute('name') ||
      // A link that's only a picture (a logo): its image's alt, or where it goes.
      element.querySelector('img[alt]')?.getAttribute('alt') ||
      (tag === 'a' ? element.getAttribute('href') : '') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80);
    const ref = elements.length + 1;
    element.setAttribute(refAttribute, String(ref));
    const hasValue =
      (tag === 'input' || tag === 'textarea') &&
      !['password', 'submit', 'button', 'checkbox', 'radio'].includes(type);
    elements.push({
      ref,
      role,
      name,
      ...(hasValue && field.value ? {value: field.value.slice(0, 40)} : {}),
    });
  }

  const text = (document.body?.innerText ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    url: location.href,
    title: document.title,
    text:
      text.length > maxText
        ? `${text.slice(0, maxText)}\n… (more below; scroll to see it)`
        : text,
    elements,
  };
}

/** Numbers what's on the page and reads its text. */
export function snapshotPage(page: Page): Promise<PageSnapshot> {
  return page.evaluate(snapshotInPage, {
    refAttribute: REF_ATTRIBUTE,
    maxElements: MAX_ELEMENTS,
    maxText: MAX_TEXT,
  });
}

/** `[3] link "More information…"`, one per line, for the model. */
export function formatElements(elements: PageElement[]): string {
  if (elements.length === 0) {
    return 'Nothing to click or type into.';
  }
  return elements
    .map(
      element =>
        `[${element.ref}] ${element.role} "${element.name}"` +
        (element.value ? ` (now: "${element.value}")` : ''),
    )
    .join('\n');
}

/** For comparing labels: lower case, single spaces, no punctuation at the ends. */
export function normaliseLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    .trim();
}
