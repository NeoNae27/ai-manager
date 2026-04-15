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
import type { Logger } from '../logging/logger.js';

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
  readonly #logger: Logger;

  constructor(providerManager: ApplicationProviderManagerContract, logger: Logger) {
    this.#providerManager = providerManager;
    this.#logger = logger;
  }

  listDefinitions(): ProviderDefinition[] {
    try {
      this.#logger.info('Listing supported providers.');
      return this.#providerManager.listSupportedProviders();
    } catch (error) {
      this.#logger.error('Failed to list supported providers.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async listProviders(): Promise<ProviderSummary[]> {
    try {
      this.#logger.info('Listing registered providers.');
      return await this.#providerManager.listProviders();
    } catch (error) {
      this.#logger.error('Failed to list registered providers.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async getCurrentProvider(): Promise<RegisteredProvider | undefined> {
    try {
      this.#logger.info('Loading current provider.');
      return await this.#providerManager.getCurrentProvider();
    } catch (error) {
      this.#logger.error('Failed to load current provider.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async createProvider(request: CreateProviderRequest): Promise<RegisteredProvider> {
    try {
      this.#logger.info('Registering provider.', {
        providerId: request.providerId,
        hasBaseUrl: Boolean(request.baseUrl),
        timeoutMs: request.timeoutMs,
        defaultModelId: request.defaultModelId,
      });

      const provider = await this.#providerManager.saveProvider(
        request.providerId,
        toRegisterProviderOptions(request),
      );

      this.#logger.info('Provider registered successfully.', {
        providerId: provider.config.id,
        providerName: provider.config.name,
      });
      return provider;
    } catch (error) {
      this.#logger.error('Failed to register provider.', {
        providerId: request.providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async pingProvider(
    providerId: ProviderId,
    request: ProviderOperationOptionsRequest = {},
  ): Promise<ProviderHealthCheckResult> {
    try {
      this.#logger.info('Checking provider health.', {
        providerId,
      });

      const result = await this.#providerManager.pingProvider(
        providerId,
        toRegisterProviderOptions(request),
      );

      this.#logger.info('Provider health check completed.', {
        providerId,
        ok: result.status.ok,
      });
      return result;
    } catch (error) {
      this.#logger.error('Provider health check failed.', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async getProviderModels(providerId: ProviderId): Promise<ProviderModelListResult> {
    try {
      this.#logger.info('Loading provider models.', {
        providerId,
      });

      const result = await this.#providerManager.getProviderModels(providerId);
      this.#logger.info('Provider models loaded.', {
        providerId,
        modelCount: result.models.length,
      });
      return result;
    } catch (error) {
      this.#logger.error('Failed to load provider models.', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }

  async selectProvider(providerId: ProviderId): Promise<RegisteredProvider> {
    try {
      this.#logger.info('Selecting active provider.', {
        providerId,
      });

      const provider = await this.#providerManager.setSelectedProvider(providerId);
      this.#logger.info('Active provider selected.', {
        providerId: provider.config.id,
        providerName: provider.config.name,
      });
      return provider;
    } catch (error) {
      this.#logger.error('Failed to select active provider.', {
        providerId,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapProviderError(error);
    }
  }
}
