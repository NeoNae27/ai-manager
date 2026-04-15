import type { AIProvider } from '../contracts/provider.js';
import type { ProviderRegistry } from '../contracts/registry.js';
import type { ProviderId } from '../domain/provider.js';

export class InMemoryProviderRegistry implements ProviderRegistry {
  readonly #providers = new Map<ProviderId, AIProvider>();
  readonly #defaultProviderId: ProviderId | undefined;

  constructor(defaultProviderId?: ProviderId) {
    this.#defaultProviderId = defaultProviderId;
  }

  register(provider: AIProvider): void {
    this.#providers.set(provider.getId(), provider);
  }

  registerMany(providers: AIProvider[]): void {
    for (const provider of providers) {
      this.register(provider);
    }
  }

  get(providerId: ProviderId): AIProvider {
    const provider = this.#providers.get(providerId);

    if (!provider) {
      throw new Error(`Provider "${providerId}" is not registered.`);
    }

    return provider;
  }

  has(providerId: ProviderId): boolean {
    return this.#providers.has(providerId);
  }

  list(): AIProvider[] {
    return [...this.#providers.values()];
  }

  getDefault(): AIProvider | undefined {
    if (this.#defaultProviderId) {
      return this.#providers.get(this.#defaultProviderId);
    }

    return this.#providers.values().next().value;
  }
}
