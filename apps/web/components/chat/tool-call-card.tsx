'use client';

import type {ToolCallRecord} from '@binary/shared';
import {readableToolName, toolImagePath} from '@binary/shared';
import {cn} from 'cn';
import {
  BanIcon,
  CheckIcon,
  ChevronDownIcon,
  ShieldAlertIcon,
  ShieldQuestionIcon,
  WrenchIcon,
  XIcon,
} from 'lucide-react';
import {useState} from 'react';

import {ToolInput} from '@/components/chat/tool-input';
import {RiskBadge} from '@/components/tools/risk-badge';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';

/** The most of an input or result shown before it's cut. */
const MAX_SHOWN_CHARS = 4000;

const VERBS: Record<ToolCallRecord['status'], string> = {
  running: 'Using',
  done: 'Used',
  failed: 'Tried',
  waiting: 'Wants to use',
  rejected: 'Rejected',
  blocked: 'Blocked',
};

export function asJson(value: unknown): string {
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
    case 'waiting':
      return <ShieldQuestionIcon aria-hidden className="size-4 text-warning" />;
    case 'rejected':
      return <BanIcon aria-hidden className="size-4 text-muted-foreground" />;
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
 * Approve and Reject, for a request. `onDecide` resolves to an error
 * message to show, or undefined when it went through.
 */
export function DecisionButtons({
  onDecide,
  label = 'Needs your OK',
}: {
  onDecide: (decision: 'approve' | 'reject') => Promise<string | undefined>;
  label?: string;
}) {
  const [busy, setBusy] = useState<'approve' | 'reject'>();
  const [error, setError] = useState<string>();

  async function decide(decision: 'approve' | 'reject') {
    setBusy(decision);
    setError(undefined);
    const problem = await onDecide(decision);
    setError(problem);
    setBusy(undefined);
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-sm text-warning">{label}</span>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void decide('approve')}
          disabled={busy !== undefined}
        >
          {busy === 'approve' ? <Spinner /> : <CheckIcon aria-hidden />}
          {busy === 'approve' ? 'Running…' : 'Approve'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => void decide('reject')}
          disabled={busy !== undefined}
        >
          {busy === 'reject' ? <Spinner /> : <XIcon aria-hidden />}
          Reject
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * One tool call inside an answer: what was called, its risk and where it's
 * up to. Open it to see the input and the result. Failed calls start open,
 * so the reason is visible. A call waiting for an OK shows Approve and
 * Reject once its answer is saved (`onDecide`).
 */
export function ToolCallCard({
  call,
  onDecide,
}: {
  call: ToolCallRecord;
  onDecide?: (decision: 'approve' | 'reject') => Promise<string | undefined>;
}) {
  const isWaiting = call.status === 'waiting';
  // A request starts open, so its exact input is seen before approving.
  const startsOpen =
    isWaiting || call.status === 'blocked' || call.status === 'failed';
  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-sm',
        (isWaiting || call.status === 'blocked') && 'border-warning/40',
      )}
    >
      <details open={startsOpen} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 select-none [&::-webkit-details-marker]:hidden">
          <WrenchIcon
            aria-hidden
            className="size-4 shrink-0 text-muted-foreground"
          />
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted-foreground">{VERBS[call.status]} </span>
            <span className="font-medium">{readableToolName(call.name)}</span>
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
          {call.error && !isWaiting && (
            <p
              className={cn(
                'rounded-md p-2.5',
                call.status === 'blocked'
                  ? 'bg-warning-surface text-warning'
                  : call.status === 'rejected'
                    ? 'bg-secondary text-muted-foreground'
                    : 'bg-danger-surface text-destructive',
              )}
            >
              {call.error}
            </p>
          )}
          <ToolInput name={call.name} input={call.input} />
          {call.status === 'done' && (
            <Block label="Result" value={call.output} />
          )}
          {call.status === 'running' && (
            <p className="text-xs text-muted-foreground">
              Waiting for the result…
            </p>
          )}
        </div>
      </details>
      {call.images?.map(image => (
        // Charts are for the person; the model never sees them.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={image.id}
          src={toolImagePath(image.id)}
          alt={
            call.name.startsWith('browser_')
              ? 'Screenshot of the page'
              : call.name.startsWith('desktop_')
                ? 'Screenshot of the cloud desktop'
                : `Chart from ${readableToolName(call.name)}`
          }
          className="block w-full border-t bg-white"
          loading="lazy"
        />
      ))}
      {isWaiting && (
        <div className="border-t border-warning/40 px-3 py-2">
          {onDecide ? (
            <DecisionButtons onDecide={onDecide} />
          ) : (
            <span className="text-sm text-warning">Needs your OK</span>
          )}
        </div>
      )}
    </div>
  );
}
