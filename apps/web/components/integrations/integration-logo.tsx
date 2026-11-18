import type {Integration} from '@binary/shared';
import {cn} from 'cn';

/** An app's logo on a white tile, or its first letter when there's none. */
export function IntegrationLogo({
  integration,
  size = 'md',
}: {
  integration: Pick<Integration, 'name' | 'logo'>;
  size?: 'md' | 'lg';
}) {
  const box = size === 'lg' ? 'size-12 p-2' : 'size-9 p-1.5';
  if (!integration.logo) {
    return (
      <span
        aria-hidden
        className={cn(
          'flex shrink-0 items-center justify-center rounded-md bg-secondary text-sm font-semibold',
          box,
        )}
      >
        {integration.name.slice(0, 1)}
      </span>
    );
  }
  return (
    // Logos come from Composio's CDN; a plain img avoids configuring
    // next/image for an outside host.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={integration.logo}
      alt=""
      loading="lazy"
      className={cn('shrink-0 rounded-md bg-white object-contain', box)}
    />
  );
}
