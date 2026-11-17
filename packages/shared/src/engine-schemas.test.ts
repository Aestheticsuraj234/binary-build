import {describe, expect, it} from 'vitest';

import {
  ENGINE_MESSAGES,
  playgroundSchema,
  saveKeySchema,
} from './engine-schemas';
import {getProvider, isProviderId, PROVIDERS} from './providers';
import {validate} from './validate';

const goodKey = 'sk-test-0123456789abcdefghij';

describe('saveKeySchema', () => {
  it('accepts a key and trims spaces around it', () => {
    expect(validate(saveKeySchema, {key: `  ${goodKey}\n`})).toEqual({
      success: true,
      data: {key: goodKey},
    });
  });

  it.each([
    ['', ENGINE_MESSAGES.keyRequired],
    ['   ', ENGINE_MESSAGES.keyRequired],
    ['sk-short', ENGINE_MESSAGES.keyTooShort],
    ['a'.repeat(501), ENGINE_MESSAGES.keyTooLong],
    ['sk-test 0123456789 abcdefghij', ENGINE_MESSAGES.keyHasSpaces],
  ])('rejects %j', (key, message) => {
    const result = validate(saveKeySchema, {key});

    expect(!result.success && result.errors.key).toBe(message);
  });
});

describe('playgroundSchema', () => {
  it('accepts a prompt for a known provider', () => {
    const result = validate(playgroundSchema, {
      provider: 'anthropic',
      prompt: ' Hello ',
    });

    expect(result).toEqual({
      success: true,
      data: {provider: 'anthropic', prompt: 'Hello'},
    });
  });

  it('rejects an empty prompt', () => {
    const result = validate(playgroundSchema, {provider: 'openai', prompt: ''});

    expect(!result.success && result.errors.prompt).toBe(
      ENGINE_MESSAGES.promptRequired,
    );
  });

  it('rejects a prompt that is too long', () => {
    const result = validate(playgroundSchema, {
      provider: 'openai',
      prompt: 'a'.repeat(4001),
    });

    expect(!result.success && result.errors.prompt).toBe(
      ENGINE_MESSAGES.promptTooLong,
    );
  });

  it('rejects an unknown provider', () => {
    const result = validate(playgroundSchema, {provider: 'acme', prompt: 'Hi'});

    expect(!result.success && result.errors.provider).toBe(
      ENGINE_MESSAGES.providerInvalid,
    );
  });
});

describe('providers', () => {
  it('lists OpenAI, Anthropic and Google with a default model each', () => {
    expect(PROVIDERS.map(p => p.id)).toEqual(['openai', 'anthropic', 'google']);
    for (const provider of PROVIDERS) {
      expect(provider.defaultModel).not.toBe('');
      expect(provider.keysUrl).toMatch(/^https:\/\//);
    }
  });

  it('recognises provider ids', () => {
    expect(isProviderId('google')).toBe(true);
    expect(isProviderId('acme')).toBe(false);
    expect(getProvider('openai').name).toBe('OpenAI');
  });
});
