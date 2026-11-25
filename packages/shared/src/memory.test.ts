import {describe, expect, it} from 'vitest';

import {
  addKnowledgeSchema,
  addMemorySchema,
  isKnowledgeFile,
  looksLikeSecret,
  MEMORY_MESSAGES,
  normalizeMemory,
} from './memory';
import {validate} from './validate';

describe('looksLikeSecret', () => {
  it.each([
    'My OpenAI key is sk-proj-abcdefghijklmnopqrstuvwx',
    'AWS: AKIAIOSFODNN7EXAMPLE',
    'token ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N',
    '-----BEGIN RSA PRIVATE KEY-----',
    'My password is hunter2',
    'The wifi passcode: correct-horse',
    'PIN = 4821',
    'Card 4242 4242 4242 4242 for groceries',
    'SSN 123-45-6789',
    'use 9f8a7b6c5d4e3f2a1b0c9d8e7f6a5b4c3d2e1f0a as the deploy secret',
  ])('flags %s', text => {
    expect(looksLikeSecret(text)).toBe(true);
  });

  it.each([
    'Prefers short answers',
    'Lives in Lisbon and works in UTC+1',
    'Never wants their password stored',
    'Has a dog called Pixel, born 2019',
    'Their order number is long but they don’t mind',
    'Uses https://example.com/docs/getting-started for reference',
  ])('lets %s through', text => {
    expect(looksLikeSecret(text)).toBe(false);
  });
});

describe('addMemorySchema', () => {
  it('trims a fact', () => {
    expect(addMemorySchema.parse({content: '  Likes tea  '})).toEqual({
      content: 'Likes tea',
    });
  });

  it('refuses a secret', () => {
    const result = validate(addMemorySchema, {content: 'password is abc123'});
    expect(result).toMatchObject({
      success: false,
      firstError: MEMORY_MESSAGES.secret,
    });
  });
});

describe('normalizeMemory', () => {
  it('ignores case, spacing and the full stop', () => {
    expect(normalizeMemory('Prefers  SHORT answers.')).toBe(
      normalizeMemory('prefers short answers'),
    );
  });
});

describe('addKnowledgeSchema', () => {
  it('takes pasted text, a text file and a web page', () => {
    expect(
      addKnowledgeSchema.safeParse({kind: 'text', title: 'Notes', text: 'Hi'})
        .success,
    ).toBe(true);
    expect(
      addKnowledgeSchema.safeParse({
        kind: 'file',
        title: 'handbook.md',
        text: '# Hi',
      }).success,
    ).toBe(true);
    expect(
      addKnowledgeSchema.safeParse({kind: 'url', url: 'https://example.com'})
        .success,
    ).toBe(true);
  });

  it('refuses a PDF, empty text and a non-web address', () => {
    expect(
      addKnowledgeSchema.safeParse({
        kind: 'file',
        title: 'report.pdf',
        text: 'x',
      }).success,
    ).toBe(false);
    expect(
      addKnowledgeSchema.safeParse({kind: 'text', title: 'Notes', text: '  '})
        .success,
    ).toBe(false);
    expect(
      addKnowledgeSchema.safeParse({kind: 'url', url: 'file:///etc/passwd'})
        .success,
    ).toBe(false);
  });

  it('knows its file types', () => {
    expect(isKnowledgeFile('Team Handbook.MD')).toBe(true);
    expect(isKnowledgeFile('photo.png')).toBe(false);
  });
});
