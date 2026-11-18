import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {common, createLowlight} from 'lowlight';
import type {Token, Tokens} from 'marked';
import {lexer} from 'marked';
import type {ReactNode} from 'react';
import type {TextStyle} from 'react-native';
import {
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import remend from 'remend';

const lowlight = createLowlight(common);

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});

/** Code colors, close to the web's GitHub Dark theme. */
const CODE_COLORS: Record<string, string> = {
  keyword: '#ff7b72',
  built_in: '#ffa657',
  type: '#ffa657',
  literal: '#79c0ff',
  number: '#79c0ff',
  string: '#a5d6ff',
  regexp: '#a5d6ff',
  comment: '#8b949e',
  title: '#d2a8ff',
  'title.function': '#d2a8ff',
  'title.class': '#ffa657',
  attr: '#79c0ff',
  attribute: '#79c0ff',
  variable: '#ffa657',
  property: '#79c0ff',
  params: '#e6edf3',
  meta: '#79c0ff',
  tag: '#7ee787',
  name: '#7ee787',
  'selector-tag': '#7ee787',
  'selector-class': '#d2a8ff',
  symbol: '#79c0ff',
  operator: '#ff7b72',
  punctuation: '#e6edf3',
  addition: '#aff5b4',
  deletion: '#ffdcd7',
};

/** The bits of a lowlight (hast) tree this file reads. */
interface HastNode {
  type: string;
  value?: string;
  properties?: {className?: unknown};
  children?: HastNode[];
}

/** Turns lowlight's tree into nested, colored Text. */
function renderHast(node: HastNode, key: string): ReactNode {
  if (node.type === 'text') {
    return node.value;
  }
  const classes = Array.isArray(node.properties?.className)
    ? (node.properties.className as string[])
    : [];
  const kind = classes
    .map(name => name.replace(/^hljs-/, ''))
    .find(name => name in CODE_COLORS);
  const children = node.children?.map((child, index) =>
    renderHast(child, `${key}.${index}`),
  );
  return kind ? (
    <Text key={key} style={{color: CODE_COLORS[kind]}}>
      {children}
    </Text>
  ) : (
    children
  );
}

/** Colors code when its language is known; plain otherwise. */
function highlight(code: string, language: string | undefined): ReactNode {
  const name = language?.trim().split(/\s/)[0]?.toLowerCase();
  if (!name || !lowlight.registered(name)) {
    return code;
  }
  try {
    const tree = lowlight.highlight(name, code) as unknown as HastNode;
    return tree.children?.map((child, index) => renderHast(child, `${index}`));
  } catch {
    return code;
  }
}

/** Opens a link only after the person agrees to leave Binary. */
function confirmLink(href: string) {
  if (!/^(https?:|mailto:)/i.test(href)) {
    return;
  }
  Alert.alert(
    'Leave Binary?',
    `This opens a website outside Binary:\n\n${href}`,
    [
      {text: 'Cancel', style: 'cancel'},
      {text: 'Open link', onPress: () => void Linking.openURL(href)},
    ],
  );
}

/** Text inside a paragraph, heading, list item or table cell. */
function renderInline(tokens: Token[] | undefined, key: string): ReactNode {
  return tokens?.map((token, index) => {
    const id = `${key}.${index}`;
    switch (token.type) {
      case 'strong':
        return (
          <Text key={id} style={styles.strong}>
            {renderInline((token as Tokens.Strong).tokens, id)}
          </Text>
        );
      case 'em':
        return (
          <Text key={id} style={styles.em}>
            {renderInline((token as Tokens.Em).tokens, id)}
          </Text>
        );
      case 'del':
        return (
          <Text key={id} style={styles.del}>
            {renderInline((token as Tokens.Del).tokens, id)}
          </Text>
        );
      case 'codespan':
        return (
          <Text key={id} style={styles.codespan}>
            {(token as Tokens.Codespan).text}
          </Text>
        );
      case 'link': {
        const link = token as Tokens.Link;
        return (
          <Text
            key={id}
            accessibilityRole="link"
            onPress={() => confirmLink(link.href)}
            style={styles.link}
          >
            {renderInline(link.tokens, id)}
          </Text>
        );
      }
      case 'br':
        return '\n';
      case 'text': {
        const text = token as Tokens.Text;
        return text.tokens ? renderInline(text.tokens, id) : text.text;
      }
      case 'escape':
        return (token as Tokens.Escape).text;
      default:
        return 'text' in token ? String(token.text) : token.raw;
    }
  });
}

const HEADING_STYLES: Record<number, TextStyle> = {
  1: {fontSize: fontSize.xl, lineHeight: 30},
  2: {fontSize: fontSize.lg, lineHeight: 26},
  3: {fontSize: fontSize.md, lineHeight: 22},
};

/** One block: a paragraph, heading, list, code block, table and so on. */
function renderBlock(token: Token, key: string): ReactNode {
  switch (token.type) {
    case 'space':
      return null;
    case 'heading': {
      const heading = token as Tokens.Heading;
      return (
        <Text
          key={key}
          accessibilityRole="header"
          style={[
            styles.heading,
            HEADING_STYLES[heading.depth] ?? HEADING_STYLES[3],
          ]}
        >
          {renderInline(heading.tokens, key)}
        </Text>
      );
    }
    case 'paragraph':
      return (
        <Text key={key} style={styles.text}>
          {renderInline((token as Tokens.Paragraph).tokens, key)}
        </Text>
      );
    case 'text': {
      // Text directly inside a tight list item.
      const text = token as Tokens.Text;
      return (
        <Text key={key} style={styles.text}>
          {text.tokens ? renderInline(text.tokens, key) : text.text}
        </Text>
      );
    }
    case 'list': {
      const list = token as Tokens.List;
      const start = typeof list.start === 'number' ? list.start : 1;
      return (
        <View key={key} style={styles.list}>
          {list.items.map((item, index) => (
            <View key={`${key}.${index}`} style={styles.listItem}>
              <Text style={styles.bullet}>
                {item.task
                  ? item.checked
                    ? '☑'
                    : '☐'
                  : list.ordered
                    ? `${start + index}.`
                    : '•'}
              </Text>
              <View style={styles.listBody}>
                {item.tokens
                  .filter(child => child.type !== 'checkbox')
                  .map((child, childIndex) =>
                    renderBlock(child, `${key}.${index}.${childIndex}`),
                  )}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case 'code': {
      const code = token as Tokens.Code;
      return (
        <View key={key} style={styles.codeBlock}>
          {code.lang ? <Text style={styles.codeLang}>{code.lang}</Text> : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <Text selectable style={styles.code}>
              {highlight(code.text, code.lang)}
            </Text>
          </ScrollView>
        </View>
      );
    }
    case 'blockquote':
      return (
        <View key={key} style={styles.quote}>
          {(token as Tokens.Blockquote).tokens.map((child, index) =>
            renderBlock(child, `${key}.${index}`),
          )}
        </View>
      );
    case 'table': {
      const table = token as Tokens.Table;
      const rows = [table.header, ...table.rows];
      return (
        <ScrollView
          key={key}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tableScroll}
        >
          <View style={styles.table}>
            {rows.map((row, rowIndex) => (
              <View
                key={`${key}.${rowIndex}`}
                style={[styles.tableRow, rowIndex === 0 && styles.tableHead]}
              >
                {row.map((cell, cellIndex) => (
                  <Text
                    key={`${key}.${rowIndex}.${cellIndex}`}
                    style={[styles.cell, rowIndex === 0 && styles.strong]}
                  >
                    {renderInline(
                      cell.tokens,
                      `${key}.${rowIndex}.${cellIndex}`,
                    )}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    }
    case 'hr':
      return <View key={key} style={styles.rule} />;
    default:
      return (
        <Text key={key} style={styles.text}>
          {token.raw.trim()}
        </Text>
      );
  }
}

/**
 * Makes a half-written answer safe to show: `remend` closes open bold,
 * italics, code and links, and a marker that has nothing after it yet
 * ("Here are **") is held back until its text arrives.
 */
function closeForDisplay(markdown: string): string {
  return remend(markdown).replace(/(^|\s)[*_~]+$/, '$1');
}

/**
 * An answer rendered as Markdown: headings, lists, tables, quotes and
 * colored code. While `isStreaming`, half-written Markdown (an open `**` or
 * code fence) is closed for display, so raw symbols never flash. Links ask
 * before leaving Binary.
 */
export function Markdown({
  children,
  isStreaming = false,
}: {
  children: string;
  isStreaming?: boolean;
}) {
  const tokens = lexer(isStreaming ? closeForDisplay(children) : children);
  return (
    <View style={styles.root}>
      {tokens.map((token, index) => renderBlock(token, `${index}`))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {gap: spacing.md},
  text: {color: colors.text, fontSize: fontSize.md, lineHeight: 22},
  heading: {color: colors.text, fontWeight: fontWeight.semibold},
  strong: {fontWeight: fontWeight.semibold},
  em: {fontStyle: 'italic'},
  del: {textDecorationLine: 'line-through'},
  codespan: {
    fontFamily: MONO,
    fontSize: fontSize.sm,
    backgroundColor: colors.surfaceRaised,
    color: colors.text,
  },
  link: {color: colors.accent, textDecorationLine: 'underline'},
  list: {gap: spacing.xs},
  listItem: {flexDirection: 'row', gap: spacing.sm},
  bullet: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 22,
    minWidth: 18,
    textAlign: 'right',
  },
  listBody: {flex: 1, gap: spacing.xs},
  codeBlock: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  codeLang: {color: colors.textSubtle, fontSize: fontSize.xs, fontFamily: MONO},
  code: {
    color: '#e6edf3',
    fontFamily: MONO,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  quote: {
    borderLeftWidth: 3,
    borderLeftColor: colors.borderStrong,
    paddingLeft: spacing.md,
    gap: spacing.sm,
  },
  tableScroll: {flexGrow: 0},
  table: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  tableHead: {backgroundColor: colors.surfaceRaised, borderTopWidth: 0},
  cell: {
    width: 130,
    color: colors.text,
    fontSize: fontSize.sm,
    lineHeight: 20,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  rule: {height: 1, backgroundColor: colors.border},
});
