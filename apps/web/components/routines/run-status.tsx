import type {RunStatus} from '@binary/shared';
import {RUN_STATUS_LABELS} from '@binary/shared';
import {cn} from 'cn';
import {CheckIcon, ClockIcon, XIcon} from 'lucide-react';

import {Spinner} from '@/components/ui/spinner';

/** Where a run is up to: Queued, Running, Done (lime check) or Failed. */
export function RunStatusBadge({status}: {status: RunStatus}) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap',
        status === 'done' && 'border-input text-primary',
        status === 'failed' &&
          'border-destructive/40 bg-danger-surface text-destructive',
        (status === 'queued' || status === 'running') &&
          'border-input text-muted-foreground',
      )}
    >
      {status === 'done' && <CheckIcon aria-hidden className="size-3" />}
      {status === 'failed' && <XIcon aria-hidden className="size-3" />}
      {status === 'queued' && <ClockIcon aria-hidden className="size-3" />}
      {status === 'running' && <Spinner className="size-3" />}
      {RUN_STATUS_LABELS[status]}
    </span>
  );
}

/** "Nov 24, 9:00 AM" in the person's time zone (the same on server and browser). */
export function formatRunDate(iso: string, timeZone: string | null): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone ?? 'UTC',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));
}
