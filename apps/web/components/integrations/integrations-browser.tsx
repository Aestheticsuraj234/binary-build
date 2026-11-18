'use client';

import type {Integration, IntegrationsCatalog} from '@binary/shared';
import {cn} from 'cn';
import {
  ChevronDownIcon,
  CircleCheckIcon,
  ExternalLinkIcon,
  RotateCwIcon,
  SearchIcon,
  ShieldCheckIcon,
  TriangleAlertIcon,
  XIcon,
} from 'lucide-react';
import {useSearchParams} from 'next/navigation';
import {useEffect, useRef, useState} from 'react';

import {IntegrationLogo} from '@/components/integrations/integration-logo';
import {ManageSheet} from '@/components/integrations/manage-sheet';
import {AuthMethods, StatusBadge} from '@/components/integrations/status-badge';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Spinner} from '@/components/ui/spinner';
import {callApi} from '@/lib/client-api';
import type {StatusFilter} from '@/lib/integrations-filter';
import {filterIntegrations, isConnectedish} from '@/lib/integrations-filter';

/** Rows shown at first, and added by "Show more". */
const PAGE_SIZE = 50;
/** How often to check whether a sign-in finished, and for how long. */
const POLL_EVERY_MS = 3000;
const POLL_FOR_MS = 3 * 60 * 1000;

const STATUS_TABS: Array<{value: StatusFilter; label: string}> = [
  {value: 'all', label: 'All'},
  {value: 'connected', label: 'Connected'},
  {value: 'not-connected', label: 'Not connected'},
];

/** Shown when this Binary has no Composio API key. */
function ComposioOff() {
  return (
    <div className="rounded-lg border border-dashed p-8 text-center">
      <h2 className="text-lg font-semibold">Composio isn&apos;t set up yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Integrations come from{' '}
        <a
          href="https://platform.composio.dev"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-4 hover:underline"
        >
          Composio
          <ExternalLinkIcon aria-hidden className="size-3.5" />
        </a>
        . Add your API key to{' '}
        <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-xs text-foreground">
          COMPOSIO_API_KEY
        </code>{' '}
        in <code className="font-mono text-xs">.env</code>, then restart{' '}
        <code className="font-mono text-xs">pnpm dev</code>.
      </p>
    </div>
  );
}

/** The action buttons at the end of a row. */
function RowActions({
  integration,
  isBusy,
  isWaiting,
  onConnect,
  onDisconnect,
  onManage,
}: {
  integration: Integration;
  isBusy: boolean;
  isWaiting: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onManage: () => void;
}) {
  const {status, needsNoAccount, name} = integration;
  return (
    <div className="flex items-center justify-end gap-1.5">
      {status === 'connected' ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={isBusy}
          onClick={onDisconnect}
          aria-label={`${needsNoAccount ? 'Turn off' : 'Disconnect'} ${name}`}
        >
          {isBusy ? <Spinner /> : null}
          {needsNoAccount ? 'Turn off' : 'Disconnect'}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          disabled={isBusy || isWaiting}
          onClick={onConnect}
          aria-label={`${needsNoAccount ? 'Turn on' : 'Connect'} ${name}`}
          title={
            integration.isManaged
              ? undefined
              : 'Needs an auth config in your Composio dashboard first.'
          }
        >
          {isBusy || isWaiting ? <Spinner /> : null}
          {needsNoAccount
            ? 'Turn on'
            : status === 'needs-attention'
              ? 'Reconnect'
              : 'Connect'}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onManage}
        aria-label={`Manage ${name}`}
      >
        Manage
      </Button>
    </div>
  );
}

/**
 * Every Composio integration, with search, a category filter and status
 * tabs. Connecting opens Composio's sign-in page in a new tab; the row
 * updates by itself once the account shows up.
 */
export function IntegrationsBrowser({initial}: {initial: IntegrationsCatalog}) {
  const searchParams = useSearchParams();
  const justConnected = searchParams.get('connected');
  const [catalog, setCatalog] = useState(initial);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const [busySlug, setBusySlug] = useState<string>();
  const [waitingFor, setWaitingFor] = useState<string>();
  const [managing, setManaging] = useState<string>();
  const [error, setError] = useState<string>();
  const [isReloading, setIsReloading] = useState(false);
  const pollTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(pollTimer.current), []);

  async function reload(): Promise<IntegrationsCatalog | undefined> {
    setIsReloading(true);
    try {
      const next = await callApi<IntegrationsCatalog>('/api/integrations');
      setCatalog(next);
      return next;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      return undefined;
    } finally {
      setIsReloading(false);
    }
  }

  // Coming back from signing in elsewhere: check for the new account.
  useEffect(() => {
    const onFocus = () => {
      if (waitingFor) {
        void reload();
      }
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [waitingFor]);

  function stopWaiting() {
    clearInterval(pollTimer.current);
    setWaitingFor(undefined);
  }

  function waitForSignIn(slug: string) {
    setWaitingFor(slug);
    const startedAt = Date.now();
    clearInterval(pollTimer.current);
    pollTimer.current = setInterval(() => {
      void reload().then(next => {
        const found = next?.integrations.find(i => i.slug === slug);
        if (
          found?.status === 'connected' ||
          Date.now() - startedAt > POLL_FOR_MS
        ) {
          stopWaiting();
        }
      });
    }, POLL_EVERY_MS);
  }

  async function connect(integration: Integration) {
    setError(undefined);
    setBusySlug(integration.slug);
    // Open the tab now, while the click still counts, so it isn't blocked.
    const tab = integration.needsNoAccount ? null : window.open('', '_blank');
    try {
      const {redirectUrl} = await callApi<{redirectUrl: string | null}>(
        `/api/integrations/${integration.slug}/connect`,
        {method: 'POST', body: {returnTo: 'web'}},
      );
      if (!redirectUrl) {
        await reload();
      } else if (tab) {
        tab.location.href = redirectUrl;
        waitForSignIn(integration.slug);
      } else {
        window.location.href = redirectUrl;
      }
    } catch (caught) {
      tab?.close();
      setError(
        `${integration.name}: ${caught instanceof Error ? caught.message : String(caught)}`,
      );
    } finally {
      setBusySlug(undefined);
    }
  }

  async function disconnect(integration: Integration) {
    const verb = integration.needsNoAccount ? 'Turn off' : 'Disconnect';
    if (
      !window.confirm(
        `${verb} ${integration.name}? Your agents lose its tools until you ${integration.needsNoAccount ? 'turn it on' : 'connect it'} again.`,
      )
    ) {
      return;
    }
    setError(undefined);
    setBusySlug(integration.slug);
    try {
      await callApi(`/api/integrations/${integration.slug}`, {
        method: 'DELETE',
      });
      await reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusySlug(undefined);
    }
  }

  if (!catalog.available) {
    return <ComposioOff />;
  }

  const all = catalog.integrations;
  const connectedCount = all.filter(i => isConnectedish(i.status)).length;
  const counts: Record<StatusFilter, number> = {
    all: all.length,
    connected: connectedCount,
    'not-connected': all.length - connectedCount,
  };
  const matches = filterIntegrations(all, {query, category, status});
  const shown = matches.slice(0, shownCount);
  const hasFilters = query !== '' || category !== '' || status !== 'all';
  const managed = all.find(i => i.slug === managing) ?? null;
  const connectedName = all.find(i => i.slug === justConnected)?.name;

  function clearFilters() {
    setQuery('');
    setCategory('');
    setStatus('all');
    setShownCount(PAGE_SIZE);
  }

  return (
    <div className="flex flex-col gap-5">
      {justConnected && connectedName && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-md border border-primary/40 bg-card p-3 text-sm"
        >
          <CircleCheckIcon aria-hidden className="size-4 text-primary" />
          {connectedName} is connected. If this opened in a new tab, you can
          close it.
        </p>
      )}

      {(catalog.error ?? error) && (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-3 rounded-md border border-destructive/40 bg-danger-surface p-3 text-sm text-destructive"
        >
          <TriangleAlertIcon aria-hidden className="size-4 shrink-0" />
          <span className="flex-1">
            {error ?? catalog.error} Your agents can still chat without it.
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={isReloading}
            onClick={() => {
              setError(undefined);
              void reload();
            }}
          >
            {isReloading ? <Spinner /> : <RotateCwIcon aria-hidden />}
            Try again
          </Button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <label htmlFor="integration-search" className="sr-only">
            Search integrations
          </label>
          <Input
            id="integration-search"
            type="search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setShownCount(PAGE_SIZE);
            }}
            placeholder={`Search ${all.length} integrations…`}
            className="h-10 pl-9"
          />
        </div>
        <div className="relative lg:w-56">
          <label htmlFor="integration-category" className="sr-only">
            Category
          </label>
          <select
            id="integration-category"
            value={category}
            onChange={event => {
              setCategory(event.target.value);
              setShownCount(PAGE_SIZE);
            }}
            className="h-10 w-full appearance-none rounded-md border border-input bg-card px-3 pr-9 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <option value="">All categories</option>
            {catalog.categories.map(option => (
              <option key={option.slug} value={option.name}>
                {option.name} ({option.count})
              </option>
            ))}
          </select>
          <ChevronDownIcon
            aria-hidden
            className="pointer-events-none absolute top-3 right-3 size-4 text-muted-foreground"
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Connection status"
          className="flex rounded-md border bg-card p-0.5"
        >
          {STATUS_TABS.map(tab => (
            <button
              key={tab.value}
              type="button"
              role="radio"
              aria-checked={status === tab.value}
              onClick={() => {
                setStatus(tab.value);
                setShownCount(PAGE_SIZE);
              }}
              className={cn(
                'flex h-8 flex-1 items-center justify-center gap-1.5 rounded px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                status === tab.value
                  ? 'bg-secondary font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
              <span className="text-xs text-muted-foreground tabular-nums">
                {counts[tab.value]}
              </span>
            </button>
          ))}
        </div>
      </div>

      <p aria-live="polite" className="sr-only">
        {matches.length} integrations shown.
      </p>

      {/* The list */}
      {matches.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <p className="font-medium">
            {all.length === 0
              ? 'No integrations to show.'
              : 'No integrations match.'}
          </p>
          {hasFilters && (
            <Button
              variant="secondary"
              size="sm"
              className="mt-4"
              onClick={clearFilters}
            >
              <XIcon aria-hidden />
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Composio integrations</caption>
            <thead className="border-b bg-card text-xs tracking-wider text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium">
                  App
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-medium lg:table-cell"
                >
                  Toolkit slug
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-medium md:table-cell"
                >
                  Auth
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-medium xl:table-cell"
                >
                  <span className="sr-only">Managed by Composio</span>
                </th>
                <th
                  scope="col"
                  className="hidden px-4 py-3 font-medium sm:table-cell"
                >
                  Status
                </th>
                <th scope="col" className="px-4 py-3 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shown.map(integration => (
                <tr
                  key={integration.slug}
                  className="transition-colors hover:bg-card/60"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <IntegrationLogo integration={integration} />
                      <div className="min-w-0">
                        <button
                          type="button"
                          onClick={() => setManaging(integration.slug)}
                          className="truncate text-left font-medium hover:underline focus-visible:underline focus-visible:outline-none"
                        >
                          {integration.name}
                        </button>
                        <p className="truncate text-xs text-muted-foreground">
                          {integration.categories.slice(0, 2).join(' · ') ||
                            `${integration.toolsCount} tools`}
                        </p>
                        {/* On small screens the hidden columns show here. */}
                        <div className="mt-1.5 sm:hidden">
                          <StatusBadge
                            status={integration.status}
                            needsNoAccount={integration.needsNoAccount}
                          />
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                    {integration.slug}
                  </td>
                  <td className="hidden px-4 py-3 md:table-cell">
                    <AuthMethods methods={integration.authMethods} />
                  </td>
                  <td className="hidden px-4 py-3 xl:table-cell">
                    {integration.isManaged && !integration.needsNoAccount && (
                      <ShieldCheckIcon
                        role="img"
                        aria-label="Managed by Composio"
                        className="size-4 text-muted-foreground"
                      >
                        <title>Managed by Composio: just sign in</title>
                      </ShieldCheckIcon>
                    )}
                  </td>
                  <td className="hidden px-4 py-3 sm:table-cell">
                    <StatusBadge
                      status={integration.status}
                      needsNoAccount={integration.needsNoAccount}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <RowActions
                      integration={integration}
                      isBusy={busySlug === integration.slug}
                      isWaiting={waitingFor === integration.slug}
                      onConnect={() => void connect(integration)}
                      onDisconnect={() => void disconnect(integration)}
                      onManage={() => setManaging(integration.slug)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {waitingFor && (
        <p
          aria-live="polite"
          className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
        >
          <Spinner />
          Finish signing in to{' '}
          {all.find(i => i.slug === waitingFor)?.name ?? waitingFor} in the new
          tab…
          <button
            type="button"
            onClick={stopWaiting}
            className="underline underline-offset-4 hover:text-foreground"
          >
            Stop waiting
          </button>
        </p>
      )}

      {matches.length > shown.length && (
        <div className="flex items-center justify-center gap-3 text-sm text-muted-foreground">
          Showing {shown.length} of {matches.length}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShownCount(count => count + PAGE_SIZE)}
          >
            Show more
          </Button>
        </div>
      )}

      <ManageSheet
        integration={managed}
        isBusy={busySlug !== undefined && busySlug === managing}
        onClose={() => setManaging(undefined)}
        onConnect={integration => void connect(integration)}
        onDisconnect={integration => void disconnect(integration)}
      />
    </div>
  );
}
