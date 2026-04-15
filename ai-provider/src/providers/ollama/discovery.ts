import type { ModelCapabilities, ModelConfig } from '../../domain/model.js';
import type { ProviderConnectionStatus, ProviderRegistrationInput } from '../../domain/provider-registration.js';
import { getJson } from '../shared/http.js';

interface OllamaTagListResponse {
  models?: Array<{
    name: string;
    model?: string;
    size?: number;
    details?: {
      family?: string;
      parameter_size?: string;
      quantization_level?: string;
    };
  }>;
}

interface OllamaVersionResponse {
  version?: string;
}

const defaultCapabilities: ModelCapabilities = {
  supportsTools: false,
  supportsStreaming: true,
  supportsJsonMode: true,
  supportsVision: false,
  supportsSystemPrompt: true,
};

const getOllamaPath = (baseUrl: string, resource: 'tags' | 'version'): string => {
  const normalizedBaseUrl = baseUrl.replace(/\/+$/, '');

  if (normalizedBaseUrl.endsWith('/api')) {
    return resource === 'tags' ? '/tags' : '/version';
  }

  return resource === 'tags' ? '/api/tags' : '/api/version';
};

export const checkOllamaConnection = async (
  input: ProviderRegistrationInput,
): Promise<ProviderConnectionStatus> => {
  const startedAt = Date.now();

  try {
    const response = await getJson<OllamaVersionResponse>(
      input.baseUrl,
      getOllamaPath(input.baseUrl, 'version'),
      input.timeoutMs ?? 10_000,
    );

    return {
      providerId: input.providerId,
      baseUrl: input.baseUrl,
      ok: true,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      message: 'Connection to Ollama is available.',
      details: {
        version: response.version,
      },
    };
  } catch (error) {
    return {
      providerId: input.providerId,
      baseUrl: input.baseUrl,
      ok: false,
      checkedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      message: error instanceof Error ? error.message : 'Failed to connect to Ollama.',
    };
  }
};

export const listOllamaModels = async (input: ProviderRegistrationInput): Promise<ModelConfig[]> => {
  const response = await getJson<OllamaTagListResponse>(
    input.baseUrl,
    getOllamaPath(input.baseUrl, 'tags'),
    input.timeoutMs ?? 10_000,
  );

  return (response.models ?? []).map((model) => ({
    id: model.model ?? model.name,
    providerId: 'ollama',
    name: model.name,
    label: model.name,
    contextWindow: 0,
    capabilities: defaultCapabilities,
    supportedUseCases: ['chat', 'summary', 'document_generation', 'reasoning'],
    metadata: {
      family: model.details?.family,
      parameterSize: model.details?.parameter_size,
      quantizationLevel: model.details?.quantization_level,
      size: model.size,
    },
  }));
};
