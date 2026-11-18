import type {
  Integration,
  IntegrationsCatalog,
  IntegrationStatus,
} from '@binary/shared';
import {colors, fontSize, fontWeight, radius, spacing} from '@binary/shared';
import * as WebBrowser from 'expo-web-browser';
import {useState} from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {useApi} from '@/hooks/use-api';
import {apiJson} from '@/lib/api';

type StatusFilter = 'all' | 'connected' | 'not-connected';

const STATUS_LABELS: Record<IntegrationStatus, string> = {
  connected: 'Connected',
  pending: 'Signing in…',
  'needs-attention': 'Reconnect needed',
  'not-connected': 'Not connected',
};

const STATUS_COLORS: Record<IntegrationStatus, string> = {
  connected: colors.accent,
  pending: colors.warning,
  'needs-attention': colors.danger,
  'not-connected': colors.textSubtle,
};

/** How many rows to show before "Show more". */
const PAGE_SIZE = 40;

function matches(
  integration: Integration,
  query: string,
  status: StatusFilter,
): boolean {
  const isOn = integration.status !== 'not-connected';
  if (
    (status === 'connected' && !isOn) ||
    (status === 'not-connected' && isOn)
  ) {
    return false;
  }
  const haystack =
    `${integration.name} ${integration.slug} ${integration.categories.join(' ')}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every(word => haystack.includes(word));
}

/** One integration: logo, name, auth methods, status and its action. */
function Row({
  integration,
  onChanged,
}: {
  integration: Integration;
  onChanged: () => Promise<void>;
}) {
  const [isBusy, setIsBusy] = useState(false);
  const {status, needsNoAccount, name} = integration;
  const statusLabel = needsNoAccount
    ? status === 'connected'
      ? 'On'
      : 'Off'
    : STATUS_LABELS[status];

  async function connect() {
    setIsBusy(true);
    try {
      const {redirectUrl} = await apiJson<{redirectUrl: string | null}>(
        `/api/integrations/${integration.slug}/connect`,
        {method: 'POST', body: {returnTo: 'phone'}},
      );
      if (redirectUrl) {
        // Composio's sign-in page; it closes when it sends us back.
        await WebBrowser.openAuthSessionAsync(
          redirectUrl,
          'binary://integrations',
        );
      }
      await onChanged();
    } catch (error) {
      Alert.alert(
        `Couldn't connect ${name}`,
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setIsBusy(false);
    }
  }

  function confirmDisconnect() {
    const verb = needsNoAccount ? 'Turn off' : 'Disconnect';
    Alert.alert(`${verb} ${name}?`, 'Your agents lose its tools.', [
      {text: 'Keep', style: 'cancel'},
      {
        text: verb,
        style: 'destructive',
        onPress: () => {
          setIsBusy(true);
          apiJson(`/api/integrations/${integration.slug}`, {method: 'DELETE'})
            .then(onChanged)
            .catch((error: unknown) =>
              Alert.alert(
                `Couldn't ${verb.toLowerCase()}`,
                error instanceof Error ? error.message : String(error),
              ),
            )
            .finally(() => setIsBusy(false));
        },
      },
    ]);
  }

  return (
    <View style={styles.row}>
      {integration.logo ? (
        <Image
          source={{uri: integration.logo}}
          style={styles.logo}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <View style={[styles.logo, styles.logoBlank]}>
          <Text style={styles.logoLetter}>{name.slice(0, 1)}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={styles.name}>
          {name}
        </Text>
        <Text numberOfLines={1} style={styles.slug}>
          {integration.slug} · {integration.authMethods.join(', ') || '—'}
        </Text>
        <View style={styles.statusLine}>
          <View
            style={[styles.dot, {backgroundColor: STATUS_COLORS[status]}]}
          />
          <Text style={[styles.status, {color: STATUS_COLORS[status]}]}>
            {statusLabel}
          </Text>
        </View>
      </View>
      {isBusy ? (
        <ActivityIndicator color={colors.accent} />
      ) : status === 'connected' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${needsNoAccount ? 'Turn off' : 'Disconnect'} ${name}`}
          onPress={confirmDisconnect}
          hitSlop={8}
        >
          <Text style={styles.quietAction}>
            {needsNoAccount ? 'Turn off' : 'Disconnect'}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${needsNoAccount ? 'Turn on' : 'Connect'} ${name}`}
          onPress={() => void connect()}
          style={styles.action}
        >
          <Text style={styles.actionText}>
            {needsNoAccount
              ? 'Turn on'
              : status === 'needs-attention'
                ? 'Reconnect'
                : 'Connect'}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

/** Every Composio integration, searchable, with connect and disconnect. */
export default function IntegrationsScreen() {
  const catalog = useApi<IntegrationsCatalog>('/api/integrations');
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [shownCount, setShownCount] = useState(PAGE_SIZE);
  const data = catalog.data;

  if (catalog.error) {
    return (
      <View style={styles.center}>
        <Text style={styles.alert}>{catalog.error}</Text>
        <Button
          label="Try again"
          variant="secondary"
          onPress={() => void catalog.reload()}
        />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
        <Text style={styles.muted}>Loading integrations…</Text>
      </View>
    );
  }
  if (!data.available) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Composio isn&apos;t set up yet</Text>
        <Text style={[styles.muted, styles.centerText]}>
          Add COMPOSIO_API_KEY to .env and restart pnpm dev to browse
          integrations.
        </Text>
      </View>
    );
  }

  const filtered = data.integrations.filter(integration =>
    matches(integration, query, status),
  );
  const connectedCount = data.integrations.filter(
    integration => integration.status !== 'not-connected',
  ).length;
  const tabs: Array<{value: StatusFilter; label: string}> = [
    {value: 'all', label: `All ${data.integrations.length}`},
    {value: 'connected', label: `Connected ${connectedCount}`},
    {
      value: 'not-connected',
      label: `Not connected ${data.integrations.length - connectedCount}`,
    },
  ];

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      data={filtered.slice(0, shownCount)}
      keyExtractor={integration => integration.slug}
      refreshControl={
        <RefreshControl
          refreshing={false}
          onRefresh={() => void catalog.reload()}
          tintColor={colors.accent}
        />
      }
      ListHeaderComponent={
        <View style={styles.header}>
          {data.error ? (
            <Text style={styles.alert}>
              {data.error} Your agents can still chat without it.
            </Text>
          ) : null}
          <TextInput
            accessibilityLabel="Search integrations"
            value={query}
            onChangeText={value => {
              setQuery(value);
              setShownCount(PAGE_SIZE);
            }}
            placeholder={`Search ${data.integrations.length} integrations…`}
            placeholderTextColor={colors.textSubtle}
            selectionColor={colors.accent}
            autoCapitalize="none"
            autoCorrect={false}
            clearButtonMode="while-editing"
            style={styles.search}
          />
          <View accessibilityRole="radiogroup" style={styles.tabs}>
            {tabs.map(tab => {
              const isSelected = status === tab.value;
              return (
                <Pressable
                  key={tab.value}
                  accessibilityRole="radio"
                  accessibilityState={{checked: isSelected}}
                  onPress={() => {
                    setStatus(tab.value);
                    setShownCount(PAGE_SIZE);
                  }}
                  style={[styles.tab, isSelected && styles.tabSelected]}
                >
                  <Text
                    style={[
                      styles.tabText,
                      isSelected && styles.tabTextSelected,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      }
      renderItem={({item}) => (
        <Row integration={item} onChanged={catalog.reload} />
      )}
      ItemSeparatorComponent={() => <View style={styles.separator} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.muted}>No integrations match.</Text>
          <Button
            label="Clear filters"
            variant="secondary"
            onPress={() => {
              setQuery('');
              setStatus('all');
            }}
          />
        </View>
      }
      ListFooterComponent={
        filtered.length > shownCount ? (
          <View style={styles.footer}>
            <Button
              label={`Show more (${filtered.length - shownCount} left)`}
              variant="secondary"
              onPress={() => setShownCount(count => count + PAGE_SIZE)}
            />
          </View>
        ) : undefined
      }
    />
  );
}

const MONO = Platform.select({ios: 'Menlo', default: 'monospace'});

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, paddingBottom: spacing.xxxl},
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.background,
  },
  centerText: {textAlign: 'center'},
  title: {
    color: colors.text,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
  header: {gap: spacing.md, marginBottom: spacing.lg},
  search: {
    height: 44,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: fontSize.md,
    paddingHorizontal: spacing.md,
  },
  tabs: {flexDirection: 'row', gap: spacing.sm},
  tab: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
  },
  tabSelected: {
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceRaised,
  },
  tabText: {color: colors.textMuted, fontSize: fontSize.xs},
  tabTextSelected: {color: colors.text, fontWeight: fontWeight.semibold},
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
  },
  separator: {height: 1, backgroundColor: colors.border},
  logo: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: '#ffffff',
  },
  logoBlank: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceRaised,
  },
  logoLetter: {color: colors.text, fontWeight: fontWeight.semibold},
  rowText: {flex: 1, gap: 2},
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
  },
  slug: {color: colors.textMuted, fontSize: fontSize.xs, fontFamily: MONO},
  statusLine: {flexDirection: 'row', alignItems: 'center', gap: spacing.xs},
  dot: {width: 7, height: 7, borderRadius: 4},
  status: {fontSize: fontSize.xs},
  action: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceRaised,
  },
  actionText: {
    color: colors.text,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
  },
  quietAction: {color: colors.textMuted, fontSize: fontSize.sm},
  muted: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
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
  empty: {alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xxl},
  footer: {marginTop: spacing.lg},
});
