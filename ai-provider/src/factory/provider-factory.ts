import type { AIProvider } from '../contracts/provider.js';
import type { ProviderFactory } from '../contracts/registry.js';
import type { ModelConfig } from '../domain/model.js';
import type { ProviderConfig } from '../domain/provider.js';
import { LMStudioProvider } from '../providers/lmstudio/provider.js';
import type { LMStudioProviderConfig, LMStudioTransport } from '../providers/lmstudio/types.js';
import { OllamaProvider } from '../providers/ollama/provider.js';
import type { OllamaProviderConfig, OllamaTransport } from '../providers/ollama/types.js';

interface ProviderFactoryDependencies {
  ollama?: {
    models: ModelConfig[];
    transport: OllamaTransport;
  };
  lmstudio?: {
    models: ModelConfig[];
    transport: LMStudioTransport;
  };
}

export class DefaultProviderFactory implements ProviderFactory {
  readonly #dependencies: ProviderFactoryDependencies;

  constructor(dependencies: ProviderFactoryDependencies) {
    this.#dependencies = dependencies;
  }

  create(config: ProviderConfig): AIProvider {
    switch (config.id) {
      case 'ollama': {
        const dependency = this.#dependencies.ollama;

        if (!dependency) {
          throw new Error('Ollama dependencies are not configured.');
        }

        return new OllamaProvider(
          config as OllamaProviderConfig,
          dependency.models as never,
          dependency.transport,
        );
      }
      case 'lmstudio': {
        const dependency = this.#dependencies.lmstudio;

        if (!dependency) {
          throw new Error('LM Studio dependencies are not configured.');
        }

        return new LMStudioProvider(
          config as LMStudioProviderConfig,
          dependency.models as never,
          dependency.transport,
        );
      }
      default:
        throw new Error(`Unsupported provider "${config.id}".`);
    }
  }
}
