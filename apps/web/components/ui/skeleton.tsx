import {cn} from 'cn';
import type {ComponentProps} from 'react';

/** A grey placeholder shown while something loads. */
export function Skeleton({className, ...props}: ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-secondary', className)}
      {...props}
    />
  );
}
