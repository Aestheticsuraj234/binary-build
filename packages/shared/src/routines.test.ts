import {describe, expect, it} from 'vitest';

import {
  cronToPreset,
  describeSchedule,
  isValidCron,
  isValidTimeZone,
  presetToCron,
  ROUTINE_MESSAGES,
  routineInputSchema,
  runDuration,
} from './routines';
import type {RoutineRun} from './routines';
import {validate} from './validate';

describe('isValidCron', () => {
  it.each([
    '0 9 * * 1-5',
    '*/15 * * * *',
    '0 0 1 * *',
    '30 8 * * 1,3,5',
    '0 9 L * *',
    '0 9 * * 1L',
    '5-10/2 0-23 * 1-12 0-7',
  ])('accepts %s', cron => {
    expect(isValidCron(cron)).toBe(true);
  });

  it.each([
    '',
    '0 9 * *',
    '0 0 9 * * *',
    '60 9 * * *',
    '0 24 * * *',
    '0 9 0 * *',
    '0 9 * 13 *',
    '0 9 * * 8',
    '5-1 * * * *',
    '*/0 * * * *',
    'every day',
  ])('refuses %j', cron => {
    expect(isValidCron(cron)).toBe(false);
  });
});

describe('schedule presets', () => {
  it('turns each preset into cron and back', () => {
    const presets = [
      {kind: 'hourly', minute: 15},
      {kind: 'daily', time: '7:30'},
      {kind: 'weekdays', time: '9:00'},
      {kind: 'weekly', weekday: 1, time: '18:05'},
      {kind: 'custom', cron: '0 */2 * * *'},
    ] as const;
    for (const preset of presets) {
      expect(cronToPreset(presetToCron(preset))).toEqual(preset);
    }
  });

  it('writes the cron the form means', () => {
    expect(presetToCron({kind: 'weekdays', time: '09:00'})).toBe('0 9 * * 1-5');
    expect(presetToCron({kind: 'none'})).toBeNull();
  });

  it('describes schedules in words', () => {
    expect(describeSchedule('0 9 * * 1-5')).toBe('Weekdays at 9:00');
    expect(describeSchedule('30 8 * * 1')).toBe('Mondays at 8:30');
    expect(describeSchedule('0 9 * * 7')).toBe('Sundays at 9:00');
    expect(describeSchedule('5 * * * *')).toBe('Every hour at :05');
    expect(describeSchedule('0 18 * * *')).toBe('Every day at 18:00');
    expect(describeSchedule('0 9 1 * *')).toBe('Cron: 0 9 1 * *');
    expect(describeSchedule(null)).toBe('No schedule');
  });
});

describe('routineInputSchema', () => {
  const valid = {
    name: ' Morning plan ',
    agentId: '8f0c3a1e-5d4b-4a8e-9c2f-1b6d7e8f9a0b',
    instructions: 'Plan my day in three bullet points.',
    cron: '0 9 * * 1-5',
    webhook: true,
    enabled: true,
  };

  it('accepts a routine and trims it', () => {
    const result = validate(routineInputSchema, valid);
    expect(result.success && result.data.name).toBe('Morning plan');
  });

  it('allows no schedule', () => {
    expect(validate(routineInputSchema, {...valid, cron: null}).success).toBe(
      true,
    );
  });

  it('explains a bad schedule on the cron field', () => {
    const result = validate(routineInputSchema, {...valid, cron: 'daily'});
    expect(!result.success && result.errors.cron).toBe(
      ROUTINE_MESSAGES.cronInvalid,
    );
  });

  it('needs something to do', () => {
    const result = validate(routineInputSchema, {...valid, instructions: ' '});
    expect(!result.success && result.errors.instructions).toBe(
      ROUTINE_MESSAGES.instructionsRequired,
    );
  });
});

describe('isValidTimeZone', () => {
  it('knows IANA names and refuses the rest', () => {
    expect(isValidTimeZone('Asia/Kolkata')).toBe(true);
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('runDuration', () => {
  const run = (startedAt: string | null, finishedAt: string | null) =>
    ({startedAt, finishedAt}) as RoutineRun;

  it('shows seconds, then minutes', () => {
    expect(
      runDuration(run('2026-11-24T09:00:00.000Z', '2026-11-24T09:00:02.400Z')),
    ).toBe('2.4s');
    expect(
      runDuration(run('2026-11-24T09:00:00.000Z', '2026-11-24T09:01:05.000Z')),
    ).toBe('1m 05s');
    expect(runDuration(run('2026-11-24T09:00:00.000Z', null))).toBeNull();
  });
});
