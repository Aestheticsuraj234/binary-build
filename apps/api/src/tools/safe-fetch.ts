import type {LookupAddress, LookupOptions} from 'node:dns';
import {lookup as dnsLookup} from 'node:dns';
import type {IncomingMessage} from 'node:http';
import http from 'node:http';
import https from 'node:https';
import {isIP} from 'node:net';

import ipaddr from 'ipaddr.js';

import {UnsafeUrlError} from '../errors';

/**
 * True only for ordinary public internet addresses. Loopback, private
 * networks, link-local (including cloud metadata at 169.254.169.254),
 * carrier NAT, multicast, reserved ranges and IPv6 forms that wrap another
 * address (6to4, NAT64, Teredo) are all refused.
 */
export function isPublicAddress(address: string): boolean {
  if (!ipaddr.isValid(address)) {
    return false;
  }
  let parsed = ipaddr.parse(address);
  if (parsed.kind() === 'ipv6') {
    const v6 = parsed as ipaddr.IPv6;
    if (v6.isIPv4MappedAddress()) {
      parsed = v6.toIPv4Address();
    }
  }
  return parsed.range() === 'unicast';
}

type LookupFunction = typeof dnsLookup;

export interface PageFetcherOptions {
  /** Which addresses may be reached. Tests loosen this. */
  isAllowedAddress?: (address: string) => boolean;
  /** DNS lookup. Tests swap this to point names at chosen addresses. */
  lookup?: LookupFunction;
  /** Stop reading after this many bytes. */
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
}

/** What `fetchPage` returns. */
export interface FetchedPage {
  /** Where the page ended up, after redirects. */
  url: string;
  status: number;
  contentType: string;
  body: string;
  /** True if the page was longer than `maxBytes` and was cut. */
  truncated: boolean;
}

/**
 * Makes a `fetchPage(url)` that only ever connects to allowed addresses.
 *
 * The check runs inside the connection's own DNS lookup, so the address
 * that is checked is the address that is used: a name can't pass the check
 * and then point somewhere private. Every redirect is checked again.
 */
export function createPageFetcher({
  isAllowedAddress = isPublicAddress,
  lookup = dnsLookup,
  maxBytes = 1_000_000,
  timeoutMs = 10_000,
  maxRedirects = 5,
}: PageFetcherOptions = {}) {
  /** A DNS lookup that refuses names pointing at disallowed addresses. */
  const guardedLookup = ((
    hostname: string,
    options: LookupOptions,
    callback: (
      error: NodeJS.ErrnoException | null,
      address: string | LookupAddress[],
      family?: number,
    ) => void,
  ) => {
    lookup(hostname, {...options, all: true}, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      const list = addresses as unknown as LookupAddress[];
      if (list.length === 0 || !list.every(a => isAllowedAddress(a.address))) {
        callback(new UnsafeUrlError() as NodeJS.ErrnoException, []);
        return;
      }
      if (options.all) {
        callback(null, list);
      } else {
        callback(null, list[0]!.address, list[0]!.family);
      }
    });
  }) as unknown as LookupFunction;

  /** Checks the scheme, and literal IP addresses (which skip DNS). */
  function checkUrl(url: URL): void {
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      throw new UnsafeUrlError('Binary only opens http and https addresses.');
    }
    const host = url.hostname.replace(/^\[|\]$/g, '');
    if (isIP(host) && !isAllowedAddress(host)) {
      throw new UnsafeUrlError();
    }
  }

  /** One request, without following redirects. */
  function requestOnce(
    url: URL,
    signal: AbortSignal,
  ): Promise<IncomingMessage> {
    const client = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = client.get(
        url,
        {
          lookup: guardedLookup,
          signal,
          headers: {
            'user-agent': 'BinaryBot/1.0 (+personal assistant)',
            accept: 'text/html,text/plain,application/json;q=0.9,*/*;q=0.5',
          },
        },
        resolve,
      );
      request.on('error', reject);
    });
  }

  /** Reads a response body as text, up to `maxBytes`. */
  async function readBody(response: IncomingMessage) {
    const chunks: Buffer[] = [];
    let size = 0;
    let truncated = false;
    for await (const chunk of response) {
      const buffer = chunk as Buffer;
      if (size + buffer.length > maxBytes) {
        chunks.push(buffer.subarray(0, maxBytes - size));
        truncated = true;
        response.destroy();
        break;
      }
      chunks.push(buffer);
      size += buffer.length;
    }
    return {body: Buffer.concat(chunks).toString('utf8'), truncated};
  }

  return async function fetchPage(
    address: string,
    signal?: AbortSignal,
  ): Promise<FetchedPage> {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      throw new UnsafeUrlError('That is not a web address.');
    }
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

    for (let redirects = 0; ; redirects++) {
      checkUrl(url);
      let response: IncomingMessage;
      try {
        response = await requestOnce(url, combined);
      } catch (error) {
        if (error instanceof UnsafeUrlError) {
          throw error;
        }
        if (timeout.aborted) {
          throw new Error('The page took too long to answer.', {cause: error});
        }
        throw new Error(`Couldn't open ${url.hostname}.`, {cause: error});
      }

      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirects >= maxRedirects) {
          throw new Error('The page redirected too many times.');
        }
        url = new URL(location, url);
        continue;
      }

      const {body, truncated} = await readBody(response);
      return {
        url: url.toString(),
        status,
        contentType: String(response.headers['content-type'] ?? ''),
        body,
        truncated,
      };
    }
  };
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/**
 * Turns a web page into readable text: scripts, styles and tags go, block
 * elements become line breaks, and common entities are decoded.
 */
export function htmlToText(html: string): {title: string; text: string} {
  const decode = (value: string) =>
    value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity.startsWith('#')) {
        const code =
          entity[1]?.toLowerCase() === 'x'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    });

  const title = decode(
    /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? '',
  );
  const text = decode(
    html
      .replace(
        /<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi,
        ' ',
      )
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(
        /<(br|\/p|\/div|\/h[1-6]|\/tr|\/section|\/article)\b[^>]*>/gi,
        '\n',
      )
      .replace(/<li\b[^>]*>/gi, '\n• ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {title, text};
}
