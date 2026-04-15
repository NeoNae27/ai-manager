import type { ProviderConfigurationStore, ProviderRegistrationServiceContract } from '../contracts/provider-management.js';
import type { ModelConfig } from '../domain/model.js';
import type {
  ProviderConnectionStatus,
  ProviderDefinition,
  ProviderRegistrationInput,
  RegisteredProvider,
} from '../domain/provider-registration.js';
import type { ProviderAuthConfig, ProviderConfig, ProviderId, ProviderKind } from '../domain/provider.js';
import { checkLMStudioConnection, listLMStudioModels } from '../providers/lmstudio/discovery.js';
import { checkOllamaConnection, listOllamaModels } from '../providers/ollama/discovery.js';

// Connection Timeout
const DEFAULT_TIMEOUT_MS = 10_000;

// Providers Config SQL Store
interface ProviderManagementDependencies {
  store: ProviderConfigurationStore;
  now?: () => string;
}

// Provider Connection Check
interface ProviderConnectionProbe {
  checkConnection(input: ProviderRegistrationInput): Promise<ProviderConnectionStatus>;
  listModels(input: ProviderRegistrationInput): Promise<ModelConfig[]>;
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.trim().replace(/\/+$/, '');

// Supported AI Providers (Ollama, LM Studio)
const providerDefinitions = [
  {
    id: 'ollama',
    name: 'Ollama',
    kind: 'local',
    description: 'Local provider with native Ollama endpoints.',
    defaultBaseUrl: 'http://127.0.0.1:11434',
    auth: {
      type: 'none',
    },
  },
  {
    id: 'lmstudio',
    name: 'LM Studio',
    kind: 'local',
    description: 'Local OpenAI-compatible provider via LM Studio.',
    defaultBaseUrl: 'http://127.0.0.1:1234/v1',
    auth: {
      type: 'none',
    },
  },
] as const satisfies readonly ProviderDefinition[];

const providerDiscoveryMap: Record<string, ProviderConnectionProbe> = {
  ollama: {
    checkConnection: checkOllamaConnection,
    listModels: listOllamaModels,
  },
  lmstudio: {
    checkConnection: checkLMStudioConnection,
    listModels: listLMStudioModels,
  },
};

const getProviderDefinition = (providerId: ProviderId): ProviderDefinition => {
  const definition = providerDefinitions.find((item) => item.id === providerId);

  if (!definition) {
    throw new Error(`Provider "${providerId}" is not supported.`);
  }

  return definition;
};

const toProviderConfig = (
  definition: ProviderDefinition,
  input: ProviderRegistrationInput,
  defaultAuth: ProviderAuthConfig,
): ProviderConfig => ({
  id: definition.id,
  kind: definition.kind as ProviderKind,
  name: definition.name,
  baseUrl: normalizeBaseUrl(input.baseUrl || definition.defaultBaseUrl),
  auth: defaultAuth,
  enabled: input.enabled ?? true,
  timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  ...(input.defaultModelId ? { defaultModelId: input.defaultModelId } : {}),
  ...(input.metadata ? { metadata: input.metadata } : {}),
});

export class ProviderRegistrationService implements ProviderRegistrationServiceContract {
  readonly #store: ProviderConfigurationStore;
  readonly #now: () => string;

  constructor({ store, now }: ProviderManagementDependencies) {
    this.#store = store;
    this.#now = now ?? (() => new Date().toISOString());
  }

  listSupportedProviders(): ProviderDefinition[] {
    return [...providerDefinitions];
  }

  async listRegisteredProviders(): Promise<RegisteredProvider[]> {
    return this.#store.list();
  }

  async getRegisteredProvider(providerId: ProviderId): Promise<RegisteredProvider | undefined> {
    return this.#store.get(providerId);
  }

  async getSelectedProvider(): Promise<RegisteredProvider | undefined> {
    const selectedProviderId = await this.#store.getSelectedProviderId();

    return selectedProviderId ? this.#store.get(selectedProviderId) : undefined;
  }

  async selectProvider(providerId: ProviderId): Promise<RegisteredProvider> {
    const registeredProvider = await this.#store.get(providerId);

    if (!registeredProvider) {
      throw new Error(`Provider "${providerId}" is not registered.`);
    }

    await this.#store.setSelectedProviderId(providerId);
    return registeredProvider;
  }

  async checkConnection(input: ProviderRegistrationInput): Promise<ProviderConnectionStatus> {
    const normalizedInput = this.#normalizeInput(input);
    return this.#getProbe(normalizedInput.providerId).checkConnection(normalizedInput);
  }

  async listAvailableModels(input: ProviderRegistrationInput): Promise<ModelConfig[]> {
    const normalizedInput = this.#normalizeInput(input);
    return this.#getProbe(normalizedInput.providerId).listModels(normalizedInput);
  }

  async saveConfiguration(input: ProviderRegistrationInput): Promise<RegisteredProvider> {
    const normalizedInput = this.#normalizeInput(input);
    const definition = getProviderDefinition(normalizedInput.providerId);
    const now = this.#now();
    const existing = await this.#store.get(normalizedInput.providerId);
    const connection = await this.checkConnection(normalizedInput);
    const models = connection.ok ? await this.listAvailableModels(normalizedInput) : [];

    const provider = {
      config: toProviderConfig(definition, normalizedInput, definition.auth),
      models,
      connection,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    } satisfies RegisteredProvider;

    await this.#store.save(provider);

    if (!(await this.#store.getSelectedProviderId())) {
      await this.#store.setSelectedProviderId(provider.config.id);
    }

    return provider;
  }

  async registerProvider(input: ProviderRegistrationInput): Promise<RegisteredProvider> {
    return this.saveConfiguration(input);
  }

  #normalizeInput(input: ProviderRegistrationInput): ProviderRegistrationInput {
    const definition = getProviderDefinition(input.providerId);

    return {
      ...input,
      baseUrl: normalizeBaseUrl(input.baseUrl || definition.defaultBaseUrl),
      timeoutMs: input.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  #getProbe(providerId: ProviderId): ProviderConnectionProbe {
    const probe = providerDiscoveryMap[providerId];

    if (!probe) {
      throw new Error(`Provider "${providerId}" does not have a discovery probe.`);
    }

    return probe;
  }
}
