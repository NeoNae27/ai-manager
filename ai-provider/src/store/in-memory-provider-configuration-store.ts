import type { ProviderConfigurationStore } from '../contracts/provider-management.js';
import type { RegisteredProvider } from '../domain/provider-registration.js';
import type { ProviderId } from '../domain/provider.js';

export class InMemoryProviderConfigurationStore implements ProviderConfigurationStore {
  readonly #providers = new Map<ProviderId, RegisteredProvider>();
  #selectedProviderId: ProviderId | undefined;

  async list(): Promise<RegisteredProvider[]> {
    return [...this.#providers.values()];
  }

  async get(providerId: ProviderId): Promise<RegisteredProvider | undefined> {
    return this.#providers.get(providerId);
  }

  async save(provider: RegisteredProvider): Promise<void> {
    this.#providers.set(provider.config.id, provider);
  }

  async delete(providerId: ProviderId): Promise<void> {
    this.#providers.delete(providerId);

    if (this.#selectedProviderId === providerId) {
      this.#selectedProviderId = undefined;
    }
  }

  async getSelectedProviderId(): Promise<ProviderId | undefined> {
    return this.#selectedProviderId;
  }

  async setSelectedProviderId(providerId: ProviderId): Promise<void> {
    this.#selectedProviderId = providerId;
  }
}
