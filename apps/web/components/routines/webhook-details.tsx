'use client';

import {WEBHOOK_BODY_MAX_BYTES} from '@binary/shared';
import {CheckIcon, CopyIcon, KeyRoundIcon} from 'lucide-react';
import {useState} from 'react';

import {Alert} from '@/components/ui/alert';
import {Button} from '@/components/ui/button';
import {Spinner} from '@/components/ui/spinner';
import {ApiError, callApi} from '@/lib/client-api';

/** A value in mono with a copy button. */
function CopyField({value, label}: {value: string; label: string}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-background py-1.5 pr-1.5 pl-3">
      <code className="min-w-0 flex-1 truncate font-mono text-xs">{value}</code>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={copied ? `${label} copied` : `Copy ${label}`}
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <CheckIcon className="text-primary" /> : <CopyIcon />}
      </Button>
    </div>
  );
}

/** A new secret, shown once, with a reminder that it won't be shown again. */
export function SecretReveal({secret}: {secret: string}) {
  return (
    <div
      role="status"
      className="flex flex-col gap-3 rounded-lg border border-primary/40 bg-background p-4"
    >
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRoundIcon aria-hidden className="size-4 text-primary" />
        Your webhook secret
      </p>
      <CopyField value={secret} label="secret" />
      <p className="text-sm text-muted-foreground">
        Copy it now: it&apos;s shown only once. Binary keeps just a hash of it.
      </p>
    </div>
  );
}

/**
 * The webhook's URL, how to call it, and a way to make a new secret. A new
 * secret shows once; the old one stops working at the same moment.
 */
export function WebhookDetails({
  routineId,
  url,
  secret,
  onNewSecret,
}: {
  routineId: string;
  url: string;
  /** A secret made just now, or null. */
  secret: string | null;
  onNewSecret: (secret: string) => void;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function newSecret() {
    setIsBusy(true);
    setError(undefined);
    try {
      const saved = await callApi<{webhookSecret: string}>(
        `/api/routines/${routineId}/webhook-secret`,
        {method: 'POST'},
      );
      onNewSecret(saved.webhookSecret);
      setIsConfirming(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setIsBusy(false);
    }
  }

  const example = [
    `curl -X POST ${url} \\`,
    `  -H "Authorization: Bearer ${secret ?? 'whsec_…'}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -d '{"event": "hello"}'`,
  ].join('\n');

  return (
    <section
      aria-labelledby="webhook-heading"
      className="flex flex-col gap-4 rounded-xl border bg-card p-6"
    >
      <h2 id="webhook-heading" className="text-lg font-semibold">
        Webhook
      </h2>
      <CopyField value={url} label="webhook URL" />
      {secret ? (
        <SecretReveal secret={secret} />
      ) : (
        <p className="text-sm text-muted-foreground">
          The secret was shown once when the webhook was turned on.
        </p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
          How to call it
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          <pre className="overflow-x-auto rounded-lg border bg-background p-3 font-mono text-xs">
            {example}
          </pre>
          <p className="text-muted-foreground">
            Send the secret as a Bearer token. The body (any text, up to{' '}
            {WEBHOOK_BODY_MAX_BYTES / 1024} KB) reaches the character as data to
            work on, never as instructions. Add an{' '}
            <code className="font-mono text-xs">Idempotency-Key</code> header
            and a repeated delivery starts only one run.
          </p>
        </div>
      </details>
      {error && (
        <Alert
          variant="destructive"
          className="border-destructive/40 bg-danger-surface"
        >
          {error}
        </Alert>
      )}
      {isConfirming ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">
            The old secret stops working. Make a new one?
          </span>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void newSecret()}
            disabled={isBusy}
          >
            {isBusy && <Spinner />}
            Make a new secret
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setIsConfirming(false)}
          >
            Keep it
          </Button>
        </div>
      ) : (
        <div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setIsConfirming(true)}
          >
            New secret
          </Button>
        </div>
      )}
    </section>
  );
}
