import type { AIProvider } from '../../contracts/provider.js';
import type { GenerationRequest, GenerationResult } from '../../contracts/generation.js';
import type { ProviderKind } from '../../domain/provider.js';
import type { ModelConfig } from '../../domain/model.js';
import type { LMStudioModelConfig, LMStudioProviderConfig, LMStudioTransport } from './types.js';
import { mapFromLMStudioResponse, mapToLMStudioRequest } from './mapper.js';

export class LMStudioProvider implements AIProvider {
  readonly #config: LMStudioProviderConfig;
  readonly #models: LMStudioModelConfig[];
  readonly #transport: LMStudioTransport;

  constructor(
    config: LMStudioProviderConfig,
    models: LMStudioModelConfig[],
    transport: LMStudioTransport,
  ) {
    this.#config = config;
    this.#models = models;
    this.#transport = transport;
  }

  getId(): 'lmstudio' {
    return this.#config.id;
  }

  getKind(): ProviderKind {
    return this.#config.kind;
  }

  async listModels(): Promise<ModelConfig[]> {
    return this.#models;
  }

  async supports(modelId: string): Promise<boolean> {
    return this.#models.some((model) => model.id === modelId);
  }

  async generate(request: GenerationRequest): Promise<GenerationResult> {
    if (request.model.providerId !== this.#config.id) {
      throw new Error(`Model "${request.model.id}" does not belong to provider "${this.#config.id}".`);
    }

    const response = await this.#transport.generate(mapToLMStudioRequest(request));
    return mapFromLMStudioResponse(request, response);
  }
}
