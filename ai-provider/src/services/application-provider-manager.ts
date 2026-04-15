import type { ProviderRegistrationServiceContract } from '../contracts/provider-management.js';
import type {
  ApplicationProviderManagerContract,
  ProviderHealthCheckResult,
  ProviderModelListResult,
  ProviderSummary,
  RegisterProviderOptions,
} from '../domain/application-provider.js';
import type { ProviderId } from '../domain/provider.js';
import type { ProviderDefinition } from '../domain/provider-registration.js';
import type { ProviderRegistrationInput, RegisteredProvider } from '../domain/provider-registration.js';

const buildSummary = (
  provider: RegisteredProvider,
  selectedProviderId?: ProviderId,
): ProviderSummary => ({
  providerId: provider.config.id,
  name: provider.config.name,
  baseUrl: provider.config.baseUrl,
  enabled: provider.config.enabled,
  selected: provider.config.id === selectedProviderId,
  modelCount: provider.models.length,
  healthy: provider.connection.ok,
  lastCheckedAt: provider.connection.checkedAt,
});

export class ApplicationProviderManager implements ApplicationProviderManagerContract {
  readonly #registrationService: ProviderRegistrationServiceContract;

  constructor(registrationService: ProviderRegistrationServiceContract) {
    this.#registrationService = registrationService;
  }

  listSupportedProviders(): ProviderDefinition[] {
    return this.#registrationService.listSupportedProviders();
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const [providers, selectedProvider] = await Promise.all([
      this.#registrationService.listRegisteredProviders(),
      this.#registrationService.getSelectedProvider(),
    ]);

    return providers.map((provider) => buildSummary(provider, selectedProvider?.config.id));
  }

  async getCurrentProvider(): Promise<RegisteredProvider | undefined> {
    return this.#registrationService.getSelectedProvider();
  }

  async setSelectedProvider(providerId: ProviderId): Promise<RegisteredProvider> {
    return this.#registrationService.selectProvider(providerId);
  }

  async registerOllamaProvider(options: RegisterProviderOptions = {}): Promise<RegisteredProvider> {
    return this.saveProvider('ollama', options);
  }

  async registerLMStudioProvider(options: RegisterProviderOptions = {}): Promise<RegisteredProvider> {
    return this.saveProvider('lmstudio', options);
  }

  async saveProvider(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): Promise<RegisteredProvider> {
    return this.#registrationService.saveConfiguration(
      this.buildRegistrationInput(providerId, options),
    );
  }

  async pingProvider(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): Promise<ProviderHealthCheckResult> {
    const status = await this.#registrationService.checkConnection(
      this.buildRegistrationInput(providerId, options),
    );

    return {
      providerId,
      status,
    };
  }

  async getProviderModels(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): Promise<ProviderModelListResult> {
    const input = this.buildRegistrationInput(providerId, options);
    const status = await this.#registrationService.checkConnection(input);

    const models = status.ok
      ? await this.#registrationService.listAvailableModels(input)
      : (await this.#registrationService.getRegisteredProvider(providerId))?.models ?? [];

    return {
      providerId,
      models,
    };
  }

  buildRegistrationInput(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): ProviderRegistrationInput {
    const definition = this.#registrationService
      .listSupportedProviders()
      .find((provider) => provider.id === providerId);

    if (!definition) {
      throw new Error(`Provider "${providerId}" is not supported.`);
    }

    return {
      providerId,
      baseUrl: options.baseUrl ?? definition.defaultBaseUrl,
      ...(options.timeoutMs !== undefined ? { timeoutMs: options.timeoutMs } : {}),
      ...(options.enabled !== undefined ? { enabled: options.enabled } : {}),
      ...(options.defaultModelId ? { defaultModelId: options.defaultModelId } : {}),
      ...(options.metadata ? { metadata: options.metadata } : {}),
    };
  }
}
