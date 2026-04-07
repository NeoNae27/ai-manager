import { randomUUID } from 'node:crypto';

import type { ProviderRegistrationServiceContract } from '../../../ai-provider/src/contracts/provider-management.js';
import type { GenerationRequest, GenerationResult } from '../../../ai-provider/src/contracts/generation.js';
import type { TokenUsage, FinishReason } from '../../../ai-provider/src/domain/generation.js';
import type { Message } from '../../../ai-provider/src/domain/message.js';
import type { ModelConfig } from '../../../ai-provider/src/domain/model.js';
import type { ProviderId } from '../../../ai-provider/src/domain/provider.js';
import type {
  ProviderRegistrationInput,
  RegisteredProvider,
} from '../../../ai-provider/src/domain/provider-registration.js';
import { LMStudioProvider } from '../../../ai-provider/src/providers/lmstudio/provider.js';
import { createLMStudioTransport } from '../../../ai-provider/src/providers/lmstudio/transport.js';
import type {
  LMStudioModelConfig,
  LMStudioProviderConfig,
} from '../../../ai-provider/src/providers/lmstudio/types.js';
import { OllamaProvider } from '../../../ai-provider/src/providers/ollama/provider.js';
import { createOllamaTransport } from '../../../ai-provider/src/providers/ollama/transport.js';
import type {
  OllamaModelConfig,
  OllamaProviderConfig,
} from '../../../ai-provider/src/providers/ollama/types.js';
import { HttpError } from '../http/errors/http-error.js';

export interface SandboxChatRequest {
  providerId?: ProviderId;
  modelId?: string;
  messages: Message[];
}

export interface SandboxChatResponse {
  message: Message;
  model: {
    providerId: ProviderId;
    id: string;
    label: string;
  };
  finishReason: FinishReason;
  usage?: TokenUsage;
}

const SANDBOX_GENERATION_TIMEOUT_MS = 120_000;

export class ChatApiService {
  readonly #providerRegistrationService: ProviderRegistrationServiceContract;

  constructor(providerRegistrationService: ProviderRegistrationServiceContract) {
    this.#providerRegistrationService = providerRegistrationService;
  }

  async sandboxChat(request: SandboxChatRequest): Promise<SandboxChatResponse> {
    try {
      const provider = await this.#resolveProvider(request.providerId);
      const registrationInput = this.#toRegistrationInput(provider);

      if (!provider.config.enabled) {
        throw new HttpError(
          409,
          'provider_disabled',
          `Provider "${provider.config.name}" is disabled.`,
        );
      }

      const connection = await this.#providerRegistrationService.checkConnection(registrationInput);

      if (!connection.ok) {
        throw new HttpError(
          409,
          'provider_unavailable',
          `Provider "${provider.config.name}" is not available: ${connection.message}`,
        );
      }

      const models = await this.#providerRegistrationService.listAvailableModels(registrationInput);

      if (models.length === 0) {
        throw new HttpError(
          404,
          'models_not_found',
          `Provider "${provider.config.name}" does not have any available models.`,
        );
      }

      const model = this.#resolveModel(provider, models, request.modelId);
      const generationRequest: GenerationRequest = {
        model,
        messages: request.messages,
        generation: {
          stream: false,
        },
        context: {
          requestId: randomUUID(),
          sessionId: randomUUID(),
          scenario: 'chat',
        },
      };

      const result = await this.#createProvider(provider, models).generate(generationRequest);
      return this.#toSandboxResponse(result);
    } catch (error) {
      return this.#mapChatError(error);
    }
  }

  async #resolveProvider(providerId?: ProviderId): Promise<RegisteredProvider> {
    if (providerId) {
      const provider = await this.#providerRegistrationService.getRegisteredProvider(providerId);

      if (!provider) {
        throw new HttpError(
          404,
          'provider_not_found',
          `Provider "${providerId}" is not registered.`,
        );
      }

      return provider;
    }

    const selectedProvider = await this.#providerRegistrationService.getSelectedProvider();

    if (!selectedProvider) {
      throw new HttpError(
        409,
        'provider_not_selected',
        'No active provider selected. Register and select a provider first.',
      );
    }

    return selectedProvider;
  }

  #resolveModel(
    provider: RegisteredProvider,
    models: ModelConfig[],
    requestedModelId?: string,
  ): ModelConfig {
    const selectedModel =
      (requestedModelId ? models.find((model) => model.id === requestedModelId) : undefined) ??
      (provider.config.defaultModelId
        ? models.find((model) => model.id === provider.config.defaultModelId)
        : undefined) ??
      models[0];

    if (!selectedModel) {
      throw new HttpError(
        404,
        'model_not_found',
        `Could not resolve a model for provider "${provider.config.name}".`,
      );
    }

    if (requestedModelId && selectedModel.id !== requestedModelId) {
      throw new HttpError(
        404,
        'model_not_found',
        `Model "${requestedModelId}" is not available for provider "${provider.config.name}".`,
        {
          availableModelIds: models.map((model) => model.id),
        },
      );
    }

    return selectedModel;
  }

  #toRegistrationInput(provider: RegisteredProvider): ProviderRegistrationInput {
    return {
      providerId: provider.config.id,
      baseUrl: provider.config.baseUrl,
      timeoutMs: provider.config.timeoutMs,
      enabled: provider.config.enabled,
      ...(provider.config.defaultModelId
        ? { defaultModelId: provider.config.defaultModelId }
        : {}),
      ...(provider.config.metadata ? { metadata: provider.config.metadata } : {}),
    };
  }

  #createProvider(provider: RegisteredProvider, models: ModelConfig[]) {
    const generationTimeoutMs = Math.max(provider.config.timeoutMs, SANDBOX_GENERATION_TIMEOUT_MS);

    switch (provider.config.id) {
      case 'ollama': {
        return new OllamaProvider(
          provider.config as OllamaProviderConfig,
          models as OllamaModelConfig[],
          createOllamaTransport(provider.config.baseUrl, generationTimeoutMs),
        );
      }
      case 'lmstudio': {
        return new LMStudioProvider(
          provider.config as LMStudioProviderConfig,
          models as LMStudioModelConfig[],
          createLMStudioTransport(provider.config.baseUrl, generationTimeoutMs),
        );
      }
      default:
        throw new HttpError(
          400,
          'provider_not_supported',
          `Provider "${provider.config.id}" does not support sandbox chat.`,
        );
    }
  }

  #toSandboxResponse(result: GenerationResult): SandboxChatResponse {
    return {
      message: result.message,
      model: {
        providerId: result.model.providerId,
        id: result.model.id,
        label: result.model.label,
      },
      finishReason: result.finishReason,
      ...(result.usage ? { usage: result.usage } : {}),
    };
  }

  #mapChatError(error: unknown): never {
    if (error instanceof HttpError) {
      throw error;
    }

    if (error instanceof Error) {
      throw new HttpError(502, 'provider_request_failed', error.message);
    }

    throw new HttpError(500, 'internal_error', 'Unexpected server error.');
  }
}
