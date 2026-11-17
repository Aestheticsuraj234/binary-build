/** The AI providers Binary can use with a person's own key. */
export const PROVIDER_IDS = ['openai', 'anthropic', 'google'] as const;

/** One of `PROVIDER_IDS`. */
export type ProviderId = (typeof PROVIDER_IDS)[number];

/** What the apps need to know about a provider. */
export interface ProviderInfo {
  id: ProviderId;
  /** Shown in the interface. */
  name: string;
  /** The model the Playground uses. A small, fast model keeps tests cheap. */
  defaultModel: string;
  /** Models an agent can pick from, fastest first. */
  models: readonly string[];
  /** Where people create a key. */
  keysUrl: string;
}

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'openai',
    name: 'OpenAI',
    defaultModel: 'gpt-5.4-mini',
    models: ['gpt-5.4-mini', 'gpt-5.5'],
    keysUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    defaultModel: 'claude-haiku-5-5',
    models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'],
    keysUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'google',
    name: 'Google Gemini',
    defaultModel: 'gemini-flash-latest',
    models: ['gemini-flash-latest', 'gemini-pro-latest'],
    keysUrl: 'https://aistudio.google.com/apikey',
  },
];

/** True when `value` names a provider Binary supports. */
export function isProviderId(value: unknown): value is ProviderId {
  return PROVIDER_IDS.includes(value as ProviderId);
}

/** Looks up a provider's details. */
export function getProvider(id: ProviderId): ProviderInfo {
  const provider = PROVIDERS.find(p => p.id === id);
  if (!provider) {
    throw new Error(`Unknown provider: ${id}`);
  }
  return provider;
}

/** True when `model` is one Binary offers for `provider`. */
export function isModelOf(provider: ProviderId, model: string): boolean {
  return getProvider(provider).models.includes(model);
}
