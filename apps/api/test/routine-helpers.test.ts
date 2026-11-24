import {describe, expect, it} from 'vitest';

import {runPrompt, runTitle} from '../src/routines/prompt';
import {canonicalTimeZone, formatRunTime} from '../src/routines/timezone';
import {
  hashWebhookSecret,
  matchesWebhookSecret,
  newWebhookSecret,
  secretFromAuthorization,
} from '../src/routines/webhook-secret';

describe('webhook secrets', () => {
  it('makes a new random secret each time, and matches only it', () => {
    const one = newWebhookSecret();
    const two = newWebhookSecret();

    expect(one.secret).not.toBe(two.secret);
    expect(one.hash).toBe(hashWebhookSecret(one.secret));
    expect(one.hash).not.toContain(one.secret);
    expect(matchesWebhookSecret(one.secret, one.hash)).toBe(true);
    expect(matchesWebhookSecret(two.secret, one.hash)).toBe(false);
    expect(matchesWebhookSecret(undefined, one.hash)).toBe(false);
    expect(matchesWebhookSecret(one.secret, null)).toBe(false);
  });

  it('reads only "Bearer" Authorization headers', () => {
    expect(secretFromAuthorization('Bearer whsec_abc')).toBe('whsec_abc');
    expect(secretFromAuthorization('bearer  whsec_abc ')).toBe('whsec_abc');
    expect(secretFromAuthorization('whsec_abc')).toBeUndefined();
    expect(secretFromAuthorization('Basic whsec_abc')).toBeUndefined();
    expect(secretFromAuthorization(undefined)).toBeUndefined();
  });
});

describe('run prompts', () => {
  it('is just the instructions without a webhook body', () => {
    expect(runPrompt('Plan my day.', null)).toBe('Plan my day.');
  });

  it('fences the body with more backticks than it contains', () => {
    const prompt = runPrompt('Summarise.', 'a ```` b');
    expect(prompt).toContain('`````webhook-data\na ```` b\n`````');
  });

  it('names a transcript after the routine and the local time', () => {
    const nineInIndia = new Date('2026-11-24T03:30:00Z');
    expect(runTitle('Morning plan', nineInIndia, 'Asia/Calcutta')).toBe(
      'Morning plan · 24 Nov, 09:00',
    );
    const long = runTitle('x'.repeat(80), nineInIndia, 'UTC');
    expect(long.length).toBeLessThanOrEqual(60);
    expect(long).toMatch(/x… · 24 Nov, 03:30$/);
  });
});

describe('time zones', () => {
  it('gives every alias one canonical name', () => {
    expect(canonicalTimeZone('Asia/Kolkata')).toBe('Asia/Calcutta');
    expect(canonicalTimeZone('asia/kolkata')).toBe('Asia/Calcutta');
    expect(() => canonicalTimeZone('Mars/Olympus')).toThrow(
      "That isn't a time zone we know.",
    );
  });

  it('shows times in the given zone', () => {
    const at = new Date('2026-06-01T08:00:00Z');
    expect(formatRunTime(at, 'Europe/London')).toBe('1 Jun, 09:00');
    expect(formatRunTime(at, 'America/New_York')).toBe('1 Jun, 04:00');
  });
});
