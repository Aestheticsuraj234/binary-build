import type {ToolCallRecord, ToolRisk, ToolSummary} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  radius,
  RISK_INFO,
  spacing,
} from '@binary/shared';
import {useState} from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});
/** The most of an input or result shown before it's cut. */
const MAX_SHOWN_CHARS = 3000;

/** "Read", "Write" or "Computer". Anything past `read` is amber. */
export function RiskBadge({risk}: {risk: ToolRisk}) {
  const isCaution = risk !== 'read';
  return (
    <View
      accessibilityLabel={`${RISK_INFO[risk].label} tool`}
      style={[styles.badge, isCaution && styles.badgeCaution]}
    >
      <Text style={[styles.badgeText, isCaution && styles.badgeTextCaution]}>
        {RISK_INFO[risk].label}
      </Text>
    </View>
  );
}

/** Tools with what they do and their risk. */
export function ToolList({tools}: {tools: ToolSummary[]}) {
  return (
    <View>
      {tools.map((tool, index) => (
        <View
          key={tool.name}
          style={[styles.toolRow, index > 0 && styles.toolRowDivider]}
        >
          <View style={styles.toolText}>
            <Text style={styles.toolName}>{tool.name}</Text>
            <Text style={styles.muted}>{tool.description}</Text>
          </View>
          <RiskBadge risk={tool.risk} />
        </View>
      ))}
    </View>
  );
}

const VERBS: Record<ToolCallRecord['status'], string> = {
  running: 'Using',
  done: 'Used',
  failed: 'Tried',
  blocked: 'Blocked',
};

const STATUS_MARKS: Record<ToolCallRecord['status'], string> = {
  running: '',
  done: '✓',
  failed: '✕',
  blocked: '⛔︎',
};

function asJson(value: unknown): string {
  const text =
    typeof value === 'string' ? value : JSON.stringify(value ?? null, null, 2);
  return text.length > MAX_SHOWN_CHARS
    ? `${text.slice(0, MAX_SHOWN_CHARS)}\n…`
    : text;
}

function Block({label, value}: {label: string; value: unknown}) {
  return (
    <View style={styles.block}>
      <Text style={styles.blockLabel}>{label}</Text>
      <ScrollView horizontal style={styles.code}>
        <Text selectable style={styles.codeText}>
          {asJson(value)}
        </Text>
      </ScrollView>
    </View>
  );
}

/**
 * One tool call inside an answer. Tap it to see the input and the result.
 * Blocked and failed calls start open, so the reason is visible.
 */
export function ToolCallCard({call}: {call: ToolCallRecord}) {
  const [isOpen, setIsOpen] = useState(
    call.status === 'blocked' || call.status === 'failed',
  );
  const name = call.name.replace(/[_-]+/g, ' ');
  return (
    <View
      style={[styles.card, call.status === 'blocked' && styles.cardBlocked]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{expanded: isOpen}}
        accessibilityLabel={`${VERBS[call.status]} ${name}`}
        onPress={() => setIsOpen(open => !open)}
        style={styles.summary}
      >
        <Text numberOfLines={1} style={styles.summaryText}>
          <Text style={styles.muted}>{VERBS[call.status]} </Text>
          {name}
        </Text>
        <RiskBadge risk={call.risk} />
        {call.status === 'running' ? (
          <ActivityIndicator size="small" color={colors.textMuted} />
        ) : (
          <Text
            style={[
              styles.mark,
              call.status === 'done' && {color: colors.accent},
              call.status === 'failed' && {color: colors.danger},
              call.status === 'blocked' && {color: colors.warning},
            ]}
          >
            {STATUS_MARKS[call.status]}
          </Text>
        )}
        <Text style={styles.chevron}>{isOpen ? '▴' : '▾'}</Text>
      </Pressable>
      {isOpen && (
        <View style={styles.details}>
          {call.error ? (
            <Text
              style={[
                styles.note,
                call.status === 'blocked'
                  ? styles.noteBlocked
                  : styles.noteFailed,
              ]}
            >
              {call.error}
            </Text>
          ) : null}
          <Block label="Input" value={call.input} />
          {call.status === 'done' && (
            <Block label="Result" value={call.output} />
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeCaution: {borderColor: colors.warning},
  badgeText: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
  },
  badgeTextCaution: {color: colors.warning},
  toolRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  toolRowDivider: {borderTopWidth: 1, borderTopColor: colors.border},
  toolText: {flex: 1, gap: 2},
  toolName: {color: colors.text, fontFamily: MONO, fontSize: fontSize.sm},
  muted: {color: colors.textMuted, fontSize: fontSize.sm},
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardBlocked: {borderColor: colors.warning},
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 44,
  },
  summaryText: {
    flex: 1,
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  mark: {fontSize: fontSize.sm, width: 18, textAlign: 'center'},
  chevron: {color: colors.textMuted, fontSize: fontSize.sm},
  details: {
    gap: spacing.md,
    padding: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  note: {
    fontSize: fontSize.sm,
    lineHeight: 20,
    borderRadius: radius.sm,
    padding: spacing.sm,
    overflow: 'hidden',
  },
  noteBlocked: {color: colors.warning, backgroundColor: colors.warningSurface},
  noteFailed: {color: colors.danger, backgroundColor: colors.dangerSurface},
  block: {gap: spacing.xs},
  blockLabel: {color: colors.textMuted, fontSize: fontSize.xs},
  code: {
    borderRadius: radius.sm,
    backgroundColor: colors.background,
    padding: spacing.sm,
    maxHeight: 220,
  },
  codeText: {
    color: colors.text,
    fontFamily: MONO,
    fontSize: fontSize.xs,
    lineHeight: 18,
  },
});
