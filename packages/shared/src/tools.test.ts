import {describe, expect, it} from 'vitest';

import {
  APP_MESSAGES,
  authMethodLabel,
  connectAppSchema,
  runsWithoutAsking,
} from './tools';
import {validate} from './validate';

describe('runsWithoutAsking', () => {
  it('only lets read tools run', () => {
    expect(runsWithoutAsking('read')).toBe(true);
    expect(runsWithoutAsking('write')).toBe(false);
    expect(runsWithoutAsking('computer')).toBe(false);
  });
});

describe('connectAppSchema', () => {
  it('accepts a URL and an optional Authorization header', () => {
    const result = validate(connectAppSchema, {
      name: ' Gmail ',
      url: 'https://mcp.composio.dev/abc',
      authorization: 'Bearer secret',
    });

    expect(result.success && result.data).toEqual({
      name: 'Gmail',
      url: 'https://mcp.composio.dev/abc',
      authorization: 'Bearer secret',
    });
  });

  it('treats an empty Authorization header as none', () => {
    const result = validate(connectAppSchema, {
      name: 'Shop',
      url: 'http://localhost:4000/mcp',
      authorization: '  ',
    });

    expect(result.success && result.data.authorization).toBeUndefined();
  });

  it('only takes http and https URLs', () => {
    for (const url of [
      'ftp://example.com',
      'not a url',
      'file:///etc/passwd',
    ]) {
      const result = validate(connectAppSchema, {name: 'X', url});
      expect(!result.success && result.errors.url).toBe(
        APP_MESSAGES.urlInvalid,
      );
    }
  });
});

describe('authMethodLabel', () => {
  it('names the common schemes and tidies the rest', () => {
    expect(authMethodLabel('OAUTH2')).toBe('OAuth2');
    expect(authMethodLabel('API_KEY')).toBe('API Key');
    expect(authMethodLabel('DCR_OAUTH')).toBe('DCR OAuth');
    expect(authMethodLabel('SOME_NEW_THING')).toBe('Some New Thing');
  });
});
