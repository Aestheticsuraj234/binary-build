import {ROUTINE_MESSAGES} from '@binary/shared';

import {InvalidInputError} from '../errors';

/**
 * The one name a time zone goes by here. Browsers disagree (Chrome says
 * "Asia/Calcutta", Safari "Asia/Kolkata") and Trigger.dev accepts only
 * some spellings, so every name is passed through `Intl`, which maps
 * aliases onto one canonical name ("Asia/Kolkata" → "Asia/Calcutta").
 */
export function canonicalTimeZone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en', {timeZone}).resolvedOptions().timeZone;
  } catch {
    throw new InvalidInputError(ROUTINE_MESSAGES.timeZoneInvalid, {
      timeZone: ROUTINE_MESSAGES.timeZoneInvalid,
    });
  }
}

/** "24 Nov, 09:00" in the person's time zone, for a transcript's title. */
export function formatRunTime(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(p => p.type === type)?.value ?? '';
  return `${part('day')} ${part('month')}, ${part('hour')}:${part('minute')}`;
}
