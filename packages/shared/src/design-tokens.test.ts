import {readFileSync} from 'node:fs';

import {describe, expect, it} from 'vitest';

import {colors} from './design-tokens';

const webCss = readFileSync(
  new URL('../../../apps/web/app/globals.css', import.meta.url),
  'utf8',
);

/** Turns `surfaceRaised` into `surface-raised`, the CSS variable spelling. */
function toKebabCase(name: string): string {
  return name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`);
}

describe('design tokens', () => {
  it('match the CSS variables used by the web app', () => {
    for (const [name, value] of Object.entries(colors)) {
      const declaration = `--binary-${toKebabCase(name)}: ${value};`;
      expect(webCss, `globals.css should contain "${declaration}"`).toContain(
        declaration,
      );
    }
  });
});
