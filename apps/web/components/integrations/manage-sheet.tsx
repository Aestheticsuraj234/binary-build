'use client';

import type {Integration, IntegrationDetail} from '@binary/shared';
import {ExternalLinkIcon, ShieldCheckIcon, XIcon} from 'lucide-react';
import {useEffect, useRef, useState} from 'react';

import {IntegrationLogo} from '@/components/integrations/integration-logo';
import {AuthMethods, StatusBadge} from '@/components/integrations/status-badge';
import {ToolList} from '@/components/tools/risk-badge';
import {Button} from '@/components/ui/button';
import {Skeleton} from '@/components/ui/skeleton';
import {Spinner} from '@/components/ui/spinner';
import {callApi} from '@/lib/client-api';

/** "2026-11-18T07:00:00Z" becomes "Nov 18, 2026". */
function formatDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '—';
}

interface ManageSheetProps {
  /** The integration to show, or null when the sheet is closed. */
  integration: Integration | null;
  isBusy: boolean;
  onClose: () => void;
  onConnect: (integration: Integration) => void;
  onDisconnect: (integration: Integration) => void;
}

/**
 * A side panel for one integration: what it is, how it signs in, the
 * accounts behind it and the tools agents get, with their risk.
 */
export function ManageSheet({
  integration,
  isBusy,
  onClose,
  onConnect,
  onDisconnect,
}: ManageSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [detail, setDetail] = useState<IntegrationDetail>();
  const [error, setError] = useState<string>();
  const slug = integration?.slug;
  const status = integration?.status;

  // Open and close the native dialog with the prop.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (integration && !dialog?.open) {
      dialog?.showModal();
    } else if (!integration && dialog?.open) {
      dialog.close();
    }
  }, [integration]);

  // Load the details, again whenever the status changes.
  useEffect(() => {
    if (!slug) {
      return;
    }
    let isCurrent = true;
    callApi<IntegrationDetail>(`/api/integrations/${slug}`)
      .then(body => {
        if (isCurrent) {
          setDetail(body);
          setError(undefined);
        }
      })
      .catch((caught: unknown) => {
        if (isCurrent) {
          setError(caught instanceof Error ? caught.message : String(caught));
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [slug, status]);

  const shown = detail?.integration.slug === slug ? detail : undefined;
  const readCount = shown?.tools.filter(tool => tool.risk === 'read').length;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="manage-title"
      onClose={onClose}
      onClick={event => {
        // A click on the backdrop (the dialog itself) closes it.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-lg border-l bg-background p-0 text-foreground backdrop:bg-black/60"
    >
      {integration && (
        <div className="flex h-full flex-col">
          <header className="flex items-start gap-3 border-b p-5">
            <IntegrationLogo integration={integration} size="lg" />
            <div className="min-w-0 flex-1">
              <h2 id="manage-title" className="text-lg font-semibold">
                {integration.name}
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {integration.slug}
              </p>
              <div className="mt-2">
                <StatusBadge
                  status={integration.status}
                  needsNoAccount={integration.needsNoAccount}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Close"
              onClick={onClose}
            >
              <XIcon aria-hidden />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto p-5">
            {integration.description && (
              <p className="text-sm text-muted-foreground">
                {integration.description}
              </p>
            )}
            <dl className="mt-5 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              <dt className="text-muted-foreground">Categories</dt>
              <dd>{integration.categories.join(', ') || '—'}</dd>
              <dt className="text-muted-foreground">Sign-in</dt>
              <dd>
                <AuthMethods methods={integration.authMethods} />
              </dd>
              <dt className="text-muted-foreground">Setup</dt>
              <dd className="flex items-start gap-1.5">
                {integration.isManaged ? (
                  <>
                    <ShieldCheckIcon
                      aria-hidden
                      className="mt-0.5 size-4 shrink-0 text-primary"
                    />
                    {integration.needsNoAccount
                      ? 'Nothing to set up.'
                      : 'Managed by Composio. Just sign in.'}
                  </>
                ) : (
                  'Needs an auth config in your Composio dashboard first.'
                )}
              </dd>
            </dl>

            {!integration.needsNoAccount && (
              <section aria-labelledby="accounts-heading" className="mt-8">
                <h3 id="accounts-heading" className="font-semibold">
                  Accounts
                </h3>
                {!shown && !error ? (
                  <Skeleton className="mt-3 h-12 rounded-md" />
                ) : shown && shown.accounts.length > 0 ? (
                  <ul className="mt-3 divide-y rounded-md border text-sm">
                    {shown.accounts.map(account => (
                      <li
                        key={account.id}
                        className="flex items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <span className="font-mono text-xs break-all">
                          {account.id}
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {account.status.toLowerCase()} ·{' '}
                          {formatDate(account.createdAt)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No account connected yet.
                  </p>
                )}
              </section>
            )}

            <section aria-labelledby="tools-heading" className="mt-8">
              <h3 id="tools-heading" className="font-semibold">
                Tools
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {shown
                  ? `${integration.status === 'connected' ? 'Your agents have' : 'Your agents get'} these ${shown.tools.length} tools${integration.status === 'connected' ? '' : ' once it’s connected'}. ${readCount} run straight away; the rest are blocked until approvals arrive.`
                  : 'Loading…'}
              </p>
              {error && (
                <p
                  role="alert"
                  className="mt-3 rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
                >
                  {error}
                </p>
              )}
              <div className="mt-4">
                {!shown && !error ? (
                  <div className="flex flex-col gap-3">
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                    <Skeleton className="h-10" />
                  </div>
                ) : (
                  shown && <ToolList tools={shown.tools} />
                )}
              </div>
            </section>
          </div>

          <footer className="flex flex-wrap items-center justify-end gap-2 border-t p-4">
            {integration.status !== 'not-connected' && (
              <Button
                variant="ghost"
                disabled={isBusy}
                onClick={() => onDisconnect(integration)}
              >
                {integration.needsNoAccount ? 'Turn off' : 'Disconnect'}
              </Button>
            )}
            {integration.status !== 'connected' && (
              <Button disabled={isBusy} onClick={() => onConnect(integration)}>
                {isBusy ? <Spinner /> : <ExternalLinkIcon aria-hidden />}
                {integration.needsNoAccount
                  ? 'Turn on'
                  : integration.status === 'needs-attention'
                    ? 'Reconnect'
                    : 'Connect'}
              </Button>
            )}
          </footer>
        </div>
      )}
    </dialog>
  );
}
