import type {AgentTemplateSummary, ProviderKeyStatus} from '@binary/shared';
import {characterOf, colors, getProvider, spacing} from '@binary/shared';
import {Stack, useLocalSearchParams} from 'expo-router';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';

import {AgentForm} from '@/components/agent-form';
import {NeedsKey} from '@/components/needs-key';
import {useApi} from '@/hooks/use-api';

/** Hire a character, starting from a template (?template=…) or from scratch. */
export default function NewAgentScreen() {
  const {template: slug} = useLocalSearchParams<{template?: string}>();
  const templates = useApi<{templates: AgentTemplateSummary[]}>(
    '/api/agent-templates',
  );
  const keys = useApi<{keys: ProviderKeyStatus[]}>('/api/keys');

  if (!templates.data || !keys.data) {
    return (
      <View style={styles.center}>
        {templates.error || keys.error ? (
          <Text style={styles.error}>{templates.error ?? keys.error}</Text>
        ) : (
          <ActivityIndicator color={colors.accent} />
        )}
      </View>
    );
  }

  const template = templates.data.templates.find(t => t.slug === slug);
  const character = characterOf(template?.character ?? 'ember');
  const providers = keys.data.keys
    .filter(k => k.connected)
    .map(k => k.provider);
  const title = template ? `Hire ${character.name}` : 'Design your own';

  if (providers.length === 0) {
    return (
      <View style={styles.padded}>
        <Stack.Screen options={{title}} />
        <NeedsKey
          message={`Agents think with your own OpenAI, Anthropic or Google Gemini key. Add one, then come back to hire ${character.name}.`}
        />
      </View>
    );
  }

  const provider = providers.includes('anthropic')
    ? 'anthropic'
    : providers[0]!;
  return (
    <>
      <Stack.Screen options={{title}} />
      <AgentForm
        mode="hire"
        connectedProviders={providers}
        templateId={template?.id ?? null}
        initial={{
          name: character.name,
          role: template?.role ?? '',
          instructions: template?.instructions ?? '',
          avatar: character.id,
          provider,
          model: getProvider(provider).defaultModel,
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  padded: {flex: 1, padding: spacing.xl, backgroundColor: colors.background},
  error: {color: colors.danger},
});
