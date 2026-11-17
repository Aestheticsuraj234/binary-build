import {cn} from 'cn';
import type {ComponentProps} from 'react';

/** A small rounded label for a status, such as "Not added". */
export function Badge({className, ...props}: ComponentProps<'span'>) {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full border border-input px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground',
        className,
      )}
      {...props}
    />
  );
}
