import type {AgentSummary, AgentTemplateSummary} from '@binary/shared';
import {
  characterOf,
  colors,
  fontSize,
  fontWeight,
  getProvider,
  radius,
  spacing,
} from '@binary/shared';
import {Link} from 'expo-router';
import type {ReactNode} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {CharacterFace} from '@/components/character-face';

/** "Anthropic · claude-sonnet-5-5". */
export function ModelBadge({
  provider,
  model,
}: {
  provider: AgentSummary['provider'];
  model: string | null;
}) {
  if (!provider || !model) {
    return null;
  }
  return (
    <View style={styles.badge}>
      <Text numberOfLines={1} style={styles.badgeText}>
        {getProvider(provider).name} · {model}
      </Text>
    </View>
  );
}

/** A card with the character on a tinted panel to its left. */
function CharacterCard({
  href,
  character,
  label,
  children,
}: {
  href: string;
  character: string;
  label: string;
  children: ReactNode;
}) {
  const info = characterOf(character);
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={label}
        style={({pressed}) => [styles.card, pressed && styles.cardPressed]}
      >
        <View style={[styles.art, {backgroundColor: info.tint}]}>
          <CharacterFace character={info.id} size={76} animated={false} />
        </View>
        <View style={styles.cardBody}>{children}</View>
      </Pressable>
    </Link>
  );
}

/** One of your hired agents. */
export function AgentCard({agent}: {agent: AgentSummary}) {
  return (
    <CharacterCard
      href={`/agents/${agent.id}`}
      character={agent.avatar}
      label={`Talk to ${agent.name}`}
    >
      <Text style={styles.title}>{agent.name}</Text>
      <Text numberOfLines={2} style={styles.text}>
        {agent.role}
      </Text>
      <ModelBadge provider={agent.provider} model={agent.model} />
    </CharacterCard>
  );
}

/** A template, played by its character, ready to hire. */
export function TemplateCard({template}: {template: AgentTemplateSummary}) {
  const info = characterOf(template.character);
  return (
    <CharacterCard
      href={`/agents/new?template=${template.slug}`}
      character={info.id}
      label={`Hire ${info.name}, ${template.name}`}
    >
      <Text style={styles.title}>{info.name}</Text>
      <Text style={styles.subtle}>{template.name}</Text>
      <Text numberOfLines={2} style={styles.text}>
        {info.personality}
      </Text>
      <Text style={styles.cta}>Hire {info.name} →</Text>
    </CharacterCard>
  );
}

/** The "start from scratch" card. */
export function DesignYourOwnCard() {
  return (
    <Link href="/agents/new" asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel="Design your own agent"
        style={({pressed}) => [
          styles.card,
          styles.dashed,
          pressed && styles.cardPressed,
        ]}
      >
        <View style={[styles.art, styles.group]}>
          {['ember', 'moss', 'pebble', 'juno'].map((id, index) => (
            <View
              key={id}
              style={[
                styles.bubble,
                {backgroundColor: characterOf(id).tint},
                index > 0 && styles.overlap,
              ]}
            >
              <CharacterFace character={id} size={30} animated={false} />
            </View>
          ))}
        </View>
        <View style={styles.cardBody}>
          <Text style={styles.title}>Design your own</Text>
          <Text style={styles.text}>
            Pick any character, give it a name and a job.
          </Text>
          <Text style={styles.cta}>+ Start from scratch</Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  cardPressed: {borderColor: colors.borderStrong},
  dashed: {
    borderStyle: 'dashed',
    borderColor: colors.borderStrong,
    backgroundColor: colors.background,
  },
  art: {width: 104, alignItems: 'center', justifyContent: 'center'},
  group: {flexDirection: 'row', paddingHorizontal: spacing.sm},
  bubble: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.background,
  },
  overlap: {marginLeft: -12},
  cardBody: {flex: 1, padding: spacing.lg, gap: spacing.xs},
  title: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  subtle: {color: colors.textSubtle, fontSize: fontSize.xs},
  text: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  cta: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    marginTop: spacing.xs,
  },
  badge: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    marginTop: spacing.xs,
  },
  badgeText: {color: colors.textMuted, fontSize: 11, fontFamily: 'Menlo'},
});
