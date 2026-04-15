import type { ProviderKind, ProviderId } from '../domain/provider.js';
import type { ModelConfig } from '../domain/model.js';
import type { GenerationRequest, GenerationResult, StreamEvent } from './generation.js';

export interface AIProvider {
  getId(): ProviderId;
  getKind(): ProviderKind;
  listModels(): Promise<ModelConfig[]>;
  supports(modelId: string): Promise<boolean>;
  generate(request: GenerationRequest): Promise<GenerationResult>;
  stream?(request: GenerationRequest): AsyncIterable<StreamEvent>;
}
