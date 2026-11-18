/**
 * Binary's design tokens. See docs/design-system.md for how to use them.
 *
 * The mobile app reads these values directly. The web app mirrors them as CSS
 * variables in apps/web/app/globals.css, and a test checks the two match.
 */

/** Dark-only palette. `accent` is reserved for the one main action. */
export const colors = {
  background: '#09090b',
  surface: '#18181b',
  surfaceRaised: '#27272a',
  border: '#27272a',
  borderStrong: '#3f3f46',
  text: '#fafafa',
  textMuted: '#a1a1aa',
  textSubtle: '#71717a',
  accent: '#d1fe17',
  accentPressed: '#b6e000',
  onAccent: '#09090b',
  danger: '#f87171',
  dangerSurface: '#2a1215',
  /** Caution, not failure: tools that can change things, blocked calls. */
  warning: '#fbbf24',
  warningSurface: '#2a2008',
} as const;

/** Spacing steps in pixels. Use these instead of one-off numbers. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

/** Corner radius in pixels. */
export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 999,
} as const;

/** Font sizes in pixels. */
export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

/** Font weights, as strings because React Native expects them that way. */
export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
} as const;
