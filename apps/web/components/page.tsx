import {cn} from 'cn';
import type {ReactNode} from 'react';

interface PageProps {
  title: string;
  description?: string;
  /** `wide` gives room for side-by-side columns, like the Playground. */
  width?: 'narrow' | 'wide';
  children: ReactNode;
}

/** The title block and content area every signed-in page shares. */
export function Page({
  title,
  description,
  width = 'narrow',
  children,
}: PageProps) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-12 sm:py-16',
        width === 'narrow' ? 'max-w-3xl' : 'max-w-6xl',
      )}
    >
      <header className="mb-8">
        <h1 className="text-4xl font-semibold tracking-tight">{title}</h1>
        {description && (
          <p className="mt-3 text-muted-foreground">{description}</p>
        )}
      </header>
      {children}
    </div>
  );
}
