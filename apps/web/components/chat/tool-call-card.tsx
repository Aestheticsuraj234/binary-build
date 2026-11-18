import type {ToolCallRecord} from '@binary/shared';
import {cn} from 'cn';
import {
  CheckIcon,
  ChevronDownIcon,
  ShieldAlertIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';

import {RiskBadge} from '@/components/tools/risk-badge';
import {Spinner} from '@/components/ui/spinner';

/** The most of an input or result shown before it's cut. */
const MAX_SHOWN_CHARS = 4000;

const VERBS: Record<ToolCallRecord['status'], string> = {
  running: 'Using',
  done: 'Used',
  failed: 'Tried',
  blocked: 'Blocked',
};

/** "shop_lookup_order" reads as "shop lookup order". */
function readableName(name: string): string {
  return name.replace(/[_-]+/g, ' ').trim();
}

function asJson(value: unknown): string {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return text.length > MAX_SHOWN_CHARS
    ? `${text.slice(0, MAX_SHOWN_CHARS)}\n…`
    : text;
}

function StatusIcon({status}: {status: ToolCallRecord['status']}) {
  switch (status) {
    case 'running':
      return <Spinner className="size-3.5" />;
    case 'done':
      return <CheckIcon aria-hidden className="size-4 text-primary" />;
    case 'failed':
      return <XIcon aria-hidden className="size-4 text-destructive" />;
    case 'blocked':
      return <ShieldAlertIcon aria-hidden className="size-4 text-warning" />;
  }
}

function Block({label, value}: {label: string; value: unknown}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">{label}</p>
      <pre className="max-h-64 overflow-auto rounded-md bg-background p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-words">
        {asJson(value)}
      </pre>
    </div>
  );
}

/**
 * One tool call inside an answer: what was called, its risk and where it's
 * up to. Open it to see the input and the result. Blocked and failed calls
 * start open, so the reason is visible.
 */
export function ToolCallCard({call}: {call: ToolCallRecord}) {
  const startsOpen = call.status === 'blocked' || call.status === 'failed';
  return (
    <details
      open={startsOpen}
      className={cn(
        'group rounded-lg border bg-card text-sm',
        call.status === 'blocked' && 'border-warning/40',
      )}
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
        <WrenchIcon
          aria-hidden
          className="size-4 shrink-0 text-muted-foreground"
        />
        <span className="min-w-0 flex-1 truncate">
          <span className="text-muted-foreground">{VERBS[call.status]} </span>
          <span className="font-medium">{readableName(call.name)}</span>
        </span>
        <RiskBadge risk={call.risk} />
        <span className="flex size-5 items-center justify-center">
          <StatusIcon status={call.status} />
        </span>
        <ChevronDownIcon
          aria-hidden
          className="size-4 text-muted-foreground transition-transform group-open:rotate-180 motion-reduce:transition-none"
        />
      </summary>
      <div className="flex flex-col gap-3 border-t px-3 py-3">
        {call.error && (
          <p
            className={cn(
              'rounded-md p-2.5',
              call.status === 'blocked'
                ? 'bg-warning-surface text-warning'
                : 'bg-danger-surface text-destructive',
            )}
          >
            {call.error}
          </p>
        )}
        <Block label="Input" value={call.input} />
        {call.status === 'done' && <Block label="Result" value={call.output} />}
        {call.status === 'running' && (
          <p className="text-xs text-muted-foreground">
            Waiting for the result…
          </p>
        )}
      </div>
    </details>
  );
}
