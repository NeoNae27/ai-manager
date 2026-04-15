import type { AIProvider } from '../../contracts/provider.js';
import type { GenerationRequest, GenerationResult } from '../../contracts/generation.js';
import type { ProviderKind } from '../../domain/provider.js';
import type { ModelConfig } from '../../domain/model.js';
import type { OllamaModelConfig, OllamaProviderConfig, OllamaTransport } from './types.js';
import { mapFromOllamaResponse, mapToOllamaRequest } from './mapper.js';

export class OllamaProvider implements AIProvider {
  readonly #config: OllamaProviderConfig;
  readonly #models: OllamaModelConfig[];
  readonly #transport: OllamaTransport;

  constructor(config: OllamaProviderConfig, models: OllamaModelConfig[], transport: OllamaTransport) {
    this.#config = config;
    this.#models = models;
    this.#transport = transport;
  }

  getId(): 'ollama' {
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

    const response = await this.#transport.generate(
      mapToOllamaRequest(request, this.#config.keepAlive),
    );

    return mapFromOllamaResponse(request, response);
  }
}
