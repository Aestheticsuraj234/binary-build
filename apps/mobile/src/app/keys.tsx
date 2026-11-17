import type {ProviderKeyStatus} from '@binary/shared';
import {
  colors,
  fontSize,
  fontWeight,
  getProvider,
  radius,
  saveKeySchema,
  spacing,
  validate,
} from '@binary/shared';
import * as WebBrowser from 'expo-web-browser';
import {useState} from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {Button} from '@/components/button';
import {TextField} from '@/components/text-field';
import {useApi} from '@/hooks/use-api';
import {ApiError, apiJson} from '@/lib/api';

/** One provider: add, replace or remove its key. */
function KeyRow({initialStatus}: {initialStatus: ProviderKeyStatus}) {
  const [status, setStatus] = useState(initialStatus);
  const [isEditing, setIsEditing] = useState(!initialStatus.connected);
  const [key, setKey] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<'save' | 'remove'>();
  const provider = getProvider(status.provider);

  async function save() {
    const result = validate(saveKeySchema, {key});
    if (!result.success) {
      setError(result.firstError);
      return;
    }
    setBusy('save');
    setError(undefined);
    try {
      const body = await apiJson<{key: ProviderKeyStatus}>(
        `/api/keys/${provider.id}`,
        {method: 'PUT', body: result.data},
      );
      setStatus(body.key);
      setKey('');
      setIsEditing(false);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  async function remove() {
    setBusy('remove');
    setError(undefined);
    try {
      const body = await apiJson<{key: ProviderKeyStatus}>(
        `/api/keys/${provider.id}`,
        {method: 'DELETE'},
      );
      setStatus(body.key);
      setIsEditing(true);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(undefined);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.name}>{provider.name}</Text>
        <View style={[styles.badge, status.connected && styles.badgeAdded]}>
          <Text style={styles.badgeText}>
            {status.connected ? 'Added' : 'Not added'}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => void WebBrowser.openBrowserAsync(provider.keysUrl)}
      >
        <Text style={styles.link}>Get a key ↗</Text>
      </Pressable>

      {status.connected && !isEditing ? (
        <View style={styles.saved}>
          <Text style={styles.hint}>
            Key ending in <Text style={styles.last4}>••••{status.last4}</Text>
          </Text>
          <View style={styles.actions}>
            <View style={styles.flex}>
              <Button
                label="Replace"
                variant="secondary"
                onPress={() => setIsEditing(true)}
              />
            </View>
            <View style={styles.flex}>
              <Button
                label="Remove"
                variant="danger"
                isLoading={busy === 'remove'}
                onPress={() => void remove()}
              />
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.form}>
          <TextField
            label={`${provider.name} API key`}
            value={key}
            onChangeText={setKey}
            placeholder={
              status.connected ? 'Paste your new key' : 'Paste your key'
            }
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            error={error}
          />
          <Button
            label="Save"
            variant="secondary"
            isLoading={busy === 'save'}
            onPress={() => void save()}
          />
        </View>
      )}
      {error && status.connected && !isEditing && (
        <Text style={styles.error}>{error}</Text>
      )}
    </View>
  );
}

/** API keys: one card per provider. Only the last 4 characters ever show. */
export default function KeysScreen() {
  const {data, error} = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.intro}>
          Binary calls AI models with your own keys, so you only pay your
          provider for what you use. Keys are encrypted, and only the last 4
          characters are ever shown.
        </Text>
        {error && <Text style={styles.error}>{error}</Text>}
        {!data && !error && <ActivityIndicator color={colors.accent} />}
        {data?.keys.map(status => (
          <KeyRow key={status.provider} initialStatus={status} />
        ))}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, backgroundColor: colors.background},
  content: {padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl},
  intro: {color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20},
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    color: colors.text,
    fontSize: fontSize.md,
    fontWeight: fontWeight.semibold,
  },
  badge: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  badgeAdded: {borderColor: colors.accent},
  badgeText: {color: colors.textMuted, fontSize: fontSize.xs},
  link: {color: colors.textMuted, fontSize: fontSize.sm},
  saved: {gap: spacing.md, marginTop: spacing.sm},
  hint: {color: colors.textMuted, fontSize: fontSize.sm},
  last4: {color: colors.text, fontFamily: 'Menlo'},
  actions: {flexDirection: 'row', gap: spacing.sm},
  flex: {flex: 1},
  form: {gap: spacing.md, marginTop: spacing.sm},
  error: {color: colors.danger, fontSize: fontSize.sm},
});
