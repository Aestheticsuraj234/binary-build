import type {IntegrationStatus} from '@binary/shared';
import {cn} from 'cn';

const LABELS: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  pending: 'Signing in…',
  'needs-attention': 'Reconnect needed',
  'not-connected': 'Not connected',
};

/** Where an integration stands, with a coloured dot. */
export function StatusBadge({
  status,
  needsNoAccount = false,
}: {
  status: IntegrationStatus;
  needsNoAccount?: boolean;
}) {
  const label =
    needsNoAccount && status === 'connected'
      ? 'On'
      : needsNoAccount
        ? 'Off'
        : LABELS[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm whitespace-nowrap',
        status === 'connected' && 'text-foreground',
        status === 'pending' && 'text-warning',
        status === 'needs-attention' && 'text-destructive',
        status === 'not-connected' && 'text-muted-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'size-2 rounded-full',
          status === 'connected' && 'bg-primary',
          status === 'pending' &&
            'animate-pulse bg-warning motion-reduce:animate-none',
          status === 'needs-attention' && 'bg-destructive',
          status === 'not-connected' && 'border border-subtle',
        )}
      />
      {label}
    </span>
  );
}

/** "OAuth2", "API Key"… as small mono pills, like Composio's dashboard. */
export function AuthMethods({methods}: {methods: string[]}) {
  return (
    <span className="flex flex-wrap gap-1.5">
      {methods.length === 0 ? (
        <span className="text-sm text-muted-foreground">—</span>
      ) : (
        methods.map(method => (
          <span
            key={method}
            className={cn(
              'rounded-md border px-1.5 py-0.5 font-mono text-[11px] whitespace-nowrap',
              method === 'No Auth'
                ? 'border-input text-muted-foreground'
                : 'border-input bg-secondary/60 text-foreground',
            )}
          >
            {method}
          </span>
        ))
      )}
    </span>
  );
}
