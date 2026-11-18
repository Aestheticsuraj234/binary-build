'use client';

import {createCodePlugin} from '@streamdown/code';
import {cn} from 'cn';
import {Streamdown} from 'streamdown';

// Binary is dark-only, so both slots get the dark theme.
const code = createCodePlugin({themes: ['github-dark', 'github-dark']});

const TRANSLATIONS = {
  openExternalLink: 'Leave Binary?',
  externalLinkWarning:
    'This link opens a website outside Binary. Only continue if you trust it.',
};

/**
 * An answer rendered as Markdown, with highlighted code. While `isStreaming`,
 * half-written Markdown (an open `**` or code fence) is closed for display,
 * so it never flashes as raw symbols. Links ask before leaving Binary.
 */
export function Markdown({
  children,
  isStreaming = false,
  className,
}: {
  children: string;
  isStreaming?: boolean;
  className?: string;
}) {
  return (
    <Streamdown
      mode={isStreaming ? 'streaming' : 'static'}
      isAnimating={isStreaming}
      plugins={{code}}
      shikiTheme={['github-dark', 'github-dark']}
      linkSafety={{enabled: true}}
      translations={TRANSLATIONS}
      controls={{code: true, table: false}}
      className={cn('markdown text-sm leading-relaxed', className)}
    >
      {children}
    </Streamdown>
  );
}
