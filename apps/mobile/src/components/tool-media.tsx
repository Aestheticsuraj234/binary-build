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
  if (name === 'run_command' && typeof value.command === 'string') {
    return <Code label="Shell" text={`$ ${value.command}`} />;
  }
  if (name === 'write_file' && typeof value.path === 'string') {
    return <Code label={`Write ${value.path}`} text={value.content ?? ''} />;
  }
  return null;
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
          accessibilityLabel="Chart"
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
