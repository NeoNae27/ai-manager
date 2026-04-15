import type { ModelCapabilities, ModelConfig } from '../../domain/model.js';
import type { ProviderConnectionStatus, ProviderRegistrationInput } from '../../domain/provider-registration.js';
import { getJson } from '../shared/http.js';

interface LMStudioModelsResponse {
  data?: Array<{
    id: string;
    object?: string;
    owned_by?: string;
  }>;
}

const defaultCapabilities: ModelCapabilities = {
  supportsTools: false,
  supportsStreaming: true,
  supportsJsonMode: true,
  supportsVision: false,
  supportsSystemPrompt: true,
};

const getLMStudioModelsPath = (baseUrl: string): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');
  return normalizedBaseUrl.endsWith('/v1') ? '/models' : '/v1/models';
};

export const checkLMStudioConnection = async (
  input: ProviderRegistrationInput,
): Promise<ProviderConnectionStatus> => {
  const startedAt = Date.now();

  try {
    const response = await getJson<LMStudioModelsResponse>(
      input.baseUrl,
      getLMStudioModelsPath(input.baseUrl),
      input.timeoutMs ?? 10_000,
    );

    return {
      providerId: input.providerId,
      baseUrl: input.baseUrl,
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      message: 'Connection to LM Studio is available.',
      details: {
        modelCount: response.data?.length ?? 0,
      },
    };
  } catch (error) {
    return {
      providerId: input.providerId,
      baseUrl: input.baseUrl,
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Failed to connect to LM Studio.',
    };
  }
};

export const listLMStudioModels = async (input: ProviderRegistrationInput): Promise<ModelConfig[]> => {
  const response = await getJson<LMStudioModelsResponse>(
    input.baseUrl,
    getLMStudioModelsPath(input.baseUrl),
    input.timeoutMs ?? 10_000,
  );

  return (response.data ?? []).map((model) => ({
    id: model.id,
    providerId: 'lmstudio',
    name: model.id,
    label: model.id,
    contextWindow: 0,
    capabilities: defaultCapabilities,
    supportedUseCases: ['chat', 'summary', 'document_generation', 'reasoning'],
    metadata: {
      object: model.object,
      ownedBy: model.owned_by,
    },
  }));
};
