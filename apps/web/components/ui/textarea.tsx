import {cn} from 'cn';
import type {ComponentProps} from 'react';

/** A multi-line text input in the same style as `Input`. */
export function Textarea({className, ...props}: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'flex min-h-24 w-full rounded-md border border-input bg-card px-3 py-2.5 text-base transition-colors outline-none placeholder:text-subtle focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm',
        className,
      )}
      {...props}
    />
  );
}
