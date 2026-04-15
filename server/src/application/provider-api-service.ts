import type {
  ApplicationProviderManagerContract,
  RegisterProviderOptions,
  ProviderHealthCheckResult,
  ProviderSummary,
  ProviderModelListResult,
} from '../../../ai-provider/src/domain/application-provider.js';
import type { ProviderId } from '../../../ai-provider/src/domain/provider.js';
import type {
  ProviderDefinition,
  RegisteredProvider,
} from '../../../ai-provider/src/domain/provider-registration.js';
import type {
  CreateProviderRequest,
  ProviderOperationOptionsRequest,
} from '../http/dto/providers.js';
import { HttpError } from '../http/errors/http-error.js';

const toRegisterProviderOptions = (
  request: ProviderOperationOptionsRequest,
): RegisterProviderOptions => ({
  ...(request.baseUrl ? { baseUrl: request.baseUrl } : {}),
  ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
  ...(request.enabled !== undefined ? { enabled: request.enabled } : {}),
  ...(request.defaultModelId ? { defaultModelId: request.defaultModelId } : {}),
  ...(request.metadata ? { metadata: request.metadata } : {}),
});

const mapProviderError = (error: unknown): never => {
  if (error instanceof HttpError) {
    throw error;
  }

  if (error instanceof Error) {
    if (error.message.includes('is not supported')) {
      throw new HttpError(404, 'provider_not_supported', error.message);
    }

    if (error.message.includes('is not registered')) {
      throw new HttpError(404, 'provider_not_found', error.message);
    }

    if (error.message.includes('Timeout')) {
      throw new HttpError(400, 'validation_error', error.message);
    }

    throw new HttpError(500, 'internal_error', error.message);
  }

  throw new HttpError(500, 'internal_error', 'Unexpected server error.');
};

export class ProviderApiService {
  readonly #providerManager: ApplicationProviderManagerContract;

  constructor(providerManager: ApplicationProviderManagerContract) {
    this.#providerManager = providerManager;
  }

  listDefinitions(): ProviderDefinition[] {
    try {
      return this.#providerManager.listSupportedProviders();
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async listProviders(): Promise<ProviderSummary[]> {
    try {
      return await this.#providerManager.listProviders();
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async getCurrentProvider(): Promise<RegisteredProvider | undefined> {
    try {
      return await this.#providerManager.getCurrentProvider();
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async createProvider(request: CreateProviderRequest): Promise<RegisteredProvider> {
    try {
      return await this.#providerManager.saveProvider(
        request.providerId,
        toRegisterProviderOptions(request),
      );
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async pingProvider(
    providerId: ProviderId,
    request: ProviderOperationOptionsRequest = {},
  ): Promise<ProviderHealthCheckResult> {
    try {
      return await this.#providerManager.pingProvider(
        providerId,
        toRegisterProviderOptions(request),
      );
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async getProviderModels(providerId: ProviderId): Promise<ProviderModelListResult> {
    try {
      return await this.#providerManager.getProviderModels(providerId);
    } catch (error) {
      return mapProviderError(error);
    }
  }

  async selectProvider(providerId: ProviderId): Promise<RegisteredProvider> {
    try {
      return await this.#providerManager.setSelectedProvider(providerId);
    } catch (error) {
      return mapProviderError(error);
    }
  }
}
