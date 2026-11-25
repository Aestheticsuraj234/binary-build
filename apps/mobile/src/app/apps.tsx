import type {
  AppWithTools,
  ComputersOverview,
  ToolsOverview,
} from '@binary/shared';
import {
  colors,
  connectAppSchema,
  fontSize,
  fontWeight,
  radius,
  RISK_INFO,
  BROWSER_SETUP_HINT,
  DESKTOP_SETUP_HINT,
  SANDBOX_SETUP_HINT,
  spacing,
  TOOL_RISKS,
  validate,
} from '@binary/shared';
import {useRouter} from 'expo-router';
import {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {TextField} from '@/components/text-field';
import {RiskBadge, ToolList} from '@/components/tools';
import {useApi} from '@/hooks/use-api';
import {ApiError, apiJson} from '@/lib/api';

type FieldErrors = Partial<Record<'name' | 'url' | 'authorization', string>>;

/** Paste an MCP server URL (and token) to connect an app. */
function ConnectForm({onConnected}: {onConnected: () => void}) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [authorization, setAuthorization] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string>();
  const [isBusy, setIsBusy] = useState(false);

  async function connect() {
    const result = validate(connectAppSchema, {name, url, authorization});
    if (!result.success) {
      setErrors(result.errors);
      setFormError(undefined);
      return;
    }
    setErrors({});
    setFormError(undefined);
    setIsBusy(true);
    try {
      await apiJson('/api/apps', {method: 'POST', body: result.data});
      setName('');
      setUrl('');
      setAuthorization('');
      onConnected();
    } catch (error) {
      setFormError(error instanceof ApiError ? error.message : String(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <Text accessibilityRole="header" style={styles.cardTitle}>
        Connect an app
      </Text>
      <Text style={styles.muted}>
        Paste any MCP server URL. For Gmail, GitHub, Slack and other everyday
        apps, use the Composio section below.
      </Text>
      <TextField
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="Gmail"
        autoCorrect={false}
        error={errors.name}
      />
      <TextField
        label="MCP server URL"
        value={url}
        onChangeText={setUrl}
        placeholder="https://mcp.composio.dev/…"
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        error={errors.url}
      />
      <TextField
        label="Authorization header (optional)"
        value={authorization}
        onChangeText={setAuthorization}
        placeholder="Bearer …"
        autoCapitalize="none"
        autoCorrect={false}
        secureTextEntry
        error={errors.authorization}
      />
      <Text style={styles.hint}>
        Encrypted before it&apos;s stored, like your API keys. Put secrets here,
        not in the URL.
      </Text>
      {formError ? <Text style={styles.alert}>{formError}</Text> : null}
      <Button
        label={isBusy ? 'Connecting…' : 'Connect'}
        isLoading={isBusy}
        disabled={isBusy}
        onPress={() => void connect()}
      />
    </View>
  );
}

/** One connected app with its tools, or why it can't be reached. */
function AppCard({
  initial,
  onRemoved,
}: {
  initial: AppWithTools;
  onRemoved: () => void;
}) {
  const [entry, setEntry] = useState(initial);
  const [isRetrying, setIsRetrying] = useState(false);
  const {app, tools, error} = entry;

  async function retry() {
    setIsRetrying(true);
    try {
      setEntry(await apiJson<AppWithTools>(`/api/apps/${app.id}`));
    } catch (caught) {
      setEntry({
        ...entry,
        error: caught instanceof Error ? caught.message : String(caught),
      });
    } finally {
      setIsRetrying(false);
    }
  }

  function confirmRemove() {
    Alert.alert(`Remove ${app.name}?`, 'Your agents lose its tools.', [
      {text: 'Keep', style: 'cancel'},
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          apiJson(`/api/apps/${app.id}`, {method: 'DELETE'})
            .then(onRemoved)
            .catch((caught: unknown) =>
              Alert.alert(
                "Couldn't remove the app",
                caught instanceof Error ? caught.message : String(caught),
              ),
            );
        },
      },
    ]);
  }

  return (
    <View style={styles.card}>
      <View style={styles.appHeader}>
        <View style={styles.appTitle}>
          <Text accessibilityRole="header" style={styles.cardTitle}>
            {app.name}
          </Text>
          <Text numberOfLines={1} style={styles.url}>
            {app.url}
            {app.hasAuthorization ? '  🔒' : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${app.name}`}
          onPress={confirmRemove}
          hitSlop={8}
        >
          <Text style={styles.remove}>Remove</Text>
        </Pressable>
      </View>
      {error ? (
        <>
          <Text style={styles.alert}>
            {error} Your agents can still chat; they just can&apos;t use{' '}
            {app.name} until it answers.
          </Text>
          <Button
            label="Try again"
            variant="secondary"
            isLoading={isRetrying}
            disabled={isRetrying}
            onPress={() => void retry()}
          />
        </>
      ) : tools.length === 0 ? (
        <Text style={styles.muted}>This app has no tools.</Text>
      ) : (
        <ToolList tools={tools} />
      )}
    </View>
  );
}

/** Running sandboxes and browsers with Stop, and how to turn each on. */
function ComputersSection() {
  const router = useRouter();
  const overview = useApi<ComputersOverview>('/api/computers');

  function confirmStop(id: string, isBrowser: boolean) {
    Alert.alert(
      isBrowser ? 'Close this browser?' : 'Stop this sandbox?',
      isBrowser ? 'Its open page goes with it.' : 'Its files go with it.',
      [
        {text: 'Keep it', style: 'cancel'},
        {
          text: isBrowser ? 'Close' : 'Stop',
          style: 'destructive',
          onPress: () => {
            apiJson(`/api/computers/${id}/stop`, {method: 'POST'})
              .then(() => overview.reload())
              .catch((caught: unknown) =>
                Alert.alert(
                  "Couldn't stop it",
                  caught instanceof Error ? caught.message : String(caught),
                ),
              );
          },
        },
      ],
    );
  }

  return (
    <>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Computers
      </Text>
      {!overview.data ? (
        overview.error ? (
          <Text style={styles.alert}>{overview.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )
      ) : (
        <View style={styles.card}>
          <Text style={styles.muted}>
            {overview.data.sandbox.available
              ? `Cloud sandbox: a private Linux machine per chat; stops after ${overview.data.sandbox.idleMinutes} idle minutes.`
              : SANDBOX_SETUP_HINT}
          </Text>
          <Text style={styles.muted}>
            {overview.data.desktop.available
              ? `Cloud desktop: a Linux desktop per chat that you can watch live; stops after ${overview.data.desktop.idleMinutes} idle minutes.`
              : DESKTOP_SETUP_HINT}
          </Text>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/computers')}
          >
            <Text style={styles.cardTitle}>Your computers (the Runner) →</Text>
          </Pressable>
          <Text style={styles.muted}>
            {overview.data.browser.available
              ? `Browser: a headless Chromium per chat that only reaches public addresses; closes after ${overview.data.browser.idleMinutes} idle minutes.`
              : BROWSER_SETUP_HINT}
          </Text>
          {overview.data.computers.length === 0 ? (
            <Text style={styles.muted}>Nothing is running.</Text>
          ) : (
            overview.data.computers.map(computer => {
              const isBrowser = computer.kind === 'browser';
              const isDesktop = computer.kind === 'cloud_desktop';
              return (
                <View key={computer.id} style={styles.appHeader}>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() => router.push(`/chats/${computer.threadId}`)}
                    style={styles.appTitle}
                  >
                    <Text style={styles.cardTitle}>
                      {isBrowser
                        ? 'Browser'
                        : isDesktop
                          ? 'Desktop'
                          : 'Sandbox'}{' '}
                      · {computer.threadTitle ?? 'Untitled chat'}
                    </Text>
                    <Text numberOfLines={1} style={styles.muted}>
                      {computer.agentName}
                      {computer.url ? ` · ${computer.url}` : ''}
                    </Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isBrowser ? 'Close' : 'Stop'} it`}
                    onPress={() => confirmStop(computer.id, isBrowser)}
                    hitSlop={8}
                  >
                    <Text style={styles.remove}>
                      {isBrowser ? 'Close' : 'Stop'}
                    </Text>
                  </Pressable>
                </View>
              );
            })
          )}
        </View>
      )}
    </>
  );
}

/** A link to the Knowledge screen. */
function KnowledgeLink() {
  const router = useRouter();
  return (
    <>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Your documents
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/knowledge')}
        style={({pressed}) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.cardTitle}>Knowledge →</Text>
        <Text style={styles.muted}>
          Add handbooks, notes and web pages that every character can search and
          cite.
        </Text>
      </Pressable>
    </>
  );
}

/** A link to the Integrations screen. */
function IntegrationsLink() {
  const router = useRouter();
  return (
    <>
      <Text accessibilityRole="header" style={styles.sectionTitle}>
        Gmail, GitHub, Slack and many more
      </Text>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/integrations')}
        style={({pressed}) => [styles.card, pressed && styles.cardPressed]}
      >
        <Text style={styles.cardTitle}>Browse integrations →</Text>
        <Text style={styles.muted}>
          Search every app Composio connects, sign in, and manage what your
          agents can reach.
        </Text>
      </Pressable>
    </>
  );
}

/** Built-in tools and connected apps, with each tool's risk. */
export default function AppsScreen() {
  const overview = useApi<ToolsOverview>('/api/apps');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => void overview.reload()}
            tintColor={colors.accent}
          />
        }
      >
        <Text style={styles.intro}>
          Tools let your characters look things up and act for you. Every
          character can use every tool here.
        </Text>
        <View style={styles.risks}>
          {TOOL_RISKS.map(risk => (
            <View key={risk} style={styles.risk}>
              <RiskBadge risk={risk} />
              <Text style={styles.riskText}>{RISK_INFO[risk].description}</Text>
            </View>
          ))}
        </View>

        {overview.error ? (
          <Text style={styles.alert}>{overview.error}</Text>
        ) : !overview.data ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Built into Binary
            </Text>
            <View style={styles.card}>
              <ToolList tools={overview.data.builtIn} />
            </View>
            <Text accessibilityRole="header" style={styles.sectionTitle}>
              Connected apps
            </Text>
            <ConnectForm onConnected={() => void overview.reload()} />
            {overview.data.apps.map(entry => (
              <AppCard
                key={`${entry.app.id}:${entry.error ?? ''}:${entry.tools.length}`}
                initial={entry}
                onRemoved={() => void overview.reload()}
              />
            ))}
          </>
        )}
        <ComputersSection />
        <KnowledgeLink />
        <IntegrationsLink />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  intro: {color: colors.textMuted, fontSize: fontSize.md, lineHeight: 22},
  risks: {gap: spacing.sm},
  risk: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  riskText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    marginTop: spacing.lg,
  },
  card: {
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  hint: {color: colors.textSubtle, fontSize: fontSize.xs, lineHeight: 18},
  appHeader: {flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md},
  appTitle: {flex: 1, gap: 2},
  url: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    fontFamily: Platform.select({ios: 'Menlo', default: 'monospace'}),
  },
  remove: {color: colors.textMuted, fontSize: fontSize.sm},
  cardPressed: {backgroundColor: colors.surfaceRaised},
  connect: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  connectText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  alert: {
    color: colors.danger,
    fontSize: fontSize.sm,
    lineHeight: 20,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.md,
    backgroundColor: colors.dangerSurface,
    padding: spacing.md,
    overflow: 'hidden',
  },
});
