import type {
  AgentSummary,
  AgentTemplateSummary,
  ProviderKeyStatus,
  ThreadSummary,
} from '@binary/shared';
import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import {useRouter} from 'expo-router';
import type {ReactNode} from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {AgentCard, DesignYourOwnCard, TemplateCard} from '@/components/cards';
import {CharacterFace} from '@/components/character-face';
import {Logo} from '@/components/logo';
import {NeedsKey} from '@/components/needs-key';
import {ThreadList} from '@/components/thread-list';
import {useApi} from '@/hooks/use-api';
import {authClient} from '@/lib/auth-client';

/** How many recent chats the home screen shows before "See all". */
const RECENT_ON_HOME = 4;

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        {title}
      </Text>
      <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      <View style={styles.list}>{children}</View>
    </View>
  );
}

/** Discover: your crew and the cast. The home screen once signed in. */
export default function DiscoverScreen() {
  const router = useRouter();
  const {data: session} = authClient.useSession();
  const agents = useApi<{agents: AgentSummary[]}>('/api/agents');
  const templates = useApi<{templates: AgentTemplateSummary[]}>(
    '/api/agent-templates',
  );
  const keys = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');
  const threads = useApi<{threads: ThreadSummary[]}>('/api/threads');
  const recent = threads.data?.threads ?? [];

  const firstName = session?.user.name.split(' ')[0] ?? 'there';
  const hasKey = keys.data?.keys.some(key => key.connected) ?? true;
  const error = agents.error ?? templates.error ?? keys.error;
  const isLoading = !agents.data || !templates.data;

  async function refresh() {
    await Promise.all([
      agents.reload(),
      templates.reload(),
      keys.reload(),
      threads.reload(),
    ]);
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.topBar}>
        <Logo />
        <View style={styles.topActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/apps')}
            style={styles.topButton}
          >
            <Text style={styles.topButtonText}>Apps</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/keys')}
            style={styles.topButton}
          >
            <Text style={styles.topButtonText}>Keys</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            onPress={() => void authClient.signOut()}
            style={styles.topButton}
          >
            <Text style={styles.topButtonText}>Sign out</Text>
          </Pressable>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void refresh()}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.hero}>
          <View style={styles.heroText}>
            <Text style={styles.greeting}>Hi {firstName}</Text>
            <Text accessibilityRole="header" style={styles.title}>
              Who are we working with today?
            </Text>
          </View>
          <CharacterFace character="nova" size={88} />
        </View>
        <Text style={styles.intro}>
          Every character has a job, a personality and a model to think with.
          Hire one and give it something to do.
        </Text>

        {error && <Text style={styles.error}>{error}</Text>}

        {!hasKey && (
          <View style={styles.block}>
            <NeedsKey message="Your agents think with your own OpenAI, Anthropic or Google Gemini key. Add one to start hiring." />
          </View>
        )}

        {isLoading && !error ? (
          <ActivityIndicator color={colors.accent} style={styles.block} />
        ) : (
          <>
            {recent.length > 0 && (
              <Section
                title="Recent chats"
                subtitle="Pick up where you left off."
              >
                <ThreadList
                  threads={recent.slice(0, RECENT_ON_HOME)}
                  onDeleted={() => void threads.reload()}
                />
                {recent.length > RECENT_ON_HOME && (
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push('/chats')}
                    style={styles.seeAll}
                  >
                    <Text style={styles.seeAllText}>
                      See all {recent.length} chats →
                    </Text>
                  </Pressable>
                )}
              </Section>
            )}
            {agents.data && agents.data.agents.length > 0 && (
              <Section
                title="Your crew"
                subtitle="Tap someone to start a new chat."
              >
                {agents.data.agents.map(agent => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </Section>
            )}
            <Section
              title="Meet the cast"
              subtitle="Ready-made roles. Change anything before you hire them."
            >
              {templates.data?.templates.map(template => (
                <TemplateCard key={template.id} template={template} />
              ))}
              <DesignYourOwnCard />
            </Section>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {flex: 1, backgroundColor: colors.background},
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  topActions: {flexDirection: 'row', gap: spacing.xs},
  topButton: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  topButtonText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  content: {padding: spacing.xl, paddingBottom: spacing.xxxl},
  hero: {flexDirection: 'row', alignItems: 'center', gap: spacing.md},
  heroText: {flex: 1},
  greeting: {color: colors.textMuted, fontSize: fontSize.sm},
  title: {
    color: colors.text,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.xs,
  },
  intro: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 24,
    marginTop: spacing.md,
  },
  error: {color: colors.danger, marginTop: spacing.lg},
  block: {marginTop: spacing.xl},
  section: {marginTop: spacing.xxl},
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    marginTop: spacing.xs,
  },
  list: {gap: spacing.md, marginTop: spacing.lg},
  seeAll: {alignSelf: 'flex-start', paddingVertical: spacing.xs},
  seeAllText: {
    color: colors.accent,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
});
