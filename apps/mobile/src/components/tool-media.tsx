import type {ToolImage} from '@binary/shared';
import {colors, fontSize, radius, spacing, toolImagePath} from '@binary/shared';
import {useEffect, useState} from 'react';
import {Image, Platform, StyleSheet, Text, View} from 'react-native';

import {API_URL} from '@/lib/api';
import {authClient} from '@/lib/auth-client';

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});

/** The inputs of sandbox tools, as they're shown to people. */
interface CodeInput {
  language?: string;
  code?: string;
  command?: string;
  path?: string;
  content?: string;
  url?: string;
  ref?: number;
  element?: string;
  text?: string;
  submit?: boolean;
  key?: string;
  keys?: string;
  cwd?: string;
  x?: number;
  y?: number;
  button?: string;
  double?: boolean;
  direction?: string;
}

/** A cloud desktop step in words: "Click at (120, 340)". */
function desktopStep(name: string, value: CodeInput): string | null {
  switch (name) {
    case 'desktop_click':
      return `${value.double ? 'Double-click' : value.button === 'right' ? 'Right-click' : 'Click'} at (${value.x}, ${value.y})`;
    case 'desktop_type':
      return `Type "${value.text ?? ''}"`;
    case 'desktop_key':
      return `Press ${value.keys ?? ''}`;
    case 'desktop_scroll':
      return `Scroll ${value.direction ?? 'down'}`;
    case 'desktop_open':
      return value.url ? `Open ${value.url}` : null;
    default:
      return null;
  }
}

/** A browser step in words: "Click [3] More information…". */
function browserStep(name: string, value: CodeInput): string | null {
  switch (name) {
    case 'browser_open':
      return value.url ? `Open ${value.url}` : null;
    case 'browser_click':
      return `Click [${value.ref}] ${value.element ?? ''}`.trim();
    case 'browser_type':
      return (
        `Type "${value.text ?? ''}" into [${value.ref}] ${value.element ?? ''}`.trim() +
        (value.submit ? ', then press Enter' : '')
      );
    case 'browser_press':
      return value.key ? `Press ${value.key}` : null;
    default:
      return null;
  }
}

function Code({label, text}: {label: string; text: string}) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Text selectable style={styles.code}>
        {text}
      </Text>
    </View>
  );
}

/**
 * Code, commands and files read as themselves, so people see exactly what
 * will run before approving. Returns null for other tools (shown as JSON).
 */
export function CodeView({name, input}: {name: string; input: unknown}) {
  const value = (input ?? {}) as CodeInput;
  if (name === 'run_code' && typeof value.code === 'string') {
    return (
      <Code
        label={value.language === 'javascript' ? 'JavaScript' : 'Python'}
        text={value.code}
      />
    );
  }
  if (name === 'computer_run_command' && typeof value.command === 'string') {
    return (
      <Code
        label={`On your computer${value.cwd ? `, in ${value.cwd}` : ''}`}
        text={`$ ${value.command}`}
      />
    );
  }
  if (name === 'computer_write_file' && typeof value.path === 'string') {
    return (
      <Code
        label={`Write ${value.path} on your computer`}
        text={value.content ?? ''}
      />
    );
  }
  const desktop = desktopStep(name, value);
  if (desktop) {
    return <Code label="On the cloud desktop" text={desktop} />;
  }
  if (name === 'run_command' && typeof value.command === 'string') {
    return <Code label="Shell" text={`$ ${value.command}`} />;
  }
  if (name === 'write_file' && typeof value.path === 'string') {
    return <Code label={`Write ${value.path}`} text={value.content ?? ''} />;
  }
  const step = browserStep(name, value);
  return step ? <Code label="In the browser" text={step} /> : null;
}

/** Charts a tool made, loaded with the session cookie. Never sent to the model. */
export function ToolImages({images}: {images: ToolImage[] | undefined}) {
  const [cookie, setCookie] = useState<string>();
  useEffect(() => {
    let isCurrent = true;
    void Promise.resolve(authClient.getCookie()).then(
      value => isCurrent && setCookie(value),
    );
    return () => {
      isCurrent = false;
    };
  }, []);
  if (!images?.length || cookie === undefined) {
    return null;
  }
  return (
    <>
      {images.map(image => (
        <Image
          key={image.id}
          accessibilityLabel="Image from the tool"
          source={{
            uri: `${API_URL}${toolImagePath(image.id)}`,
            headers: {cookie},
          }}
          resizeMode="contain"
          style={styles.image}
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  block: {gap: spacing.xs},
  label: {color: colors.textMuted, fontSize: fontSize.xs},
  code: {
    color: colors.text,
    fontFamily: MONO,
    fontSize: fontSize.xs,
    lineHeight: 18,
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    padding: spacing.md,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#ffffff',
  },
});
