import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { ProviderConfigurationStore } from '../contracts/provider-management.js';
import type { RegisteredProvider } from '../domain/provider-registration.js';
import type { ProviderId } from '../domain/provider.js';

interface ProviderConfigurationState {
  providers: RegisteredProvider[];
  selectedProviderId?: ProviderId;
}

const emptyState = (): ProviderConfigurationState => ({
  providers: [],
});

export class JsonFileProviderConfigurationStore implements ProviderConfigurationStore {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async list(): Promise<RegisteredProvider[]> {
    const state = await this.#readState();
    return state.providers;
  }

  async get(providerId: ProviderId): Promise<RegisteredProvider | undefined> {
    const state = await this.#readState();
    return state.providers.find((provider) => provider.config.id === providerId);
  }

  async save(provider: RegisteredProvider): Promise<void> {
    const state = await this.#readState();
    const nextProviders = state.providers.filter((item) => item.config.id !== provider.config.id);
    nextProviders.push(provider);

    await this.#writeState({
      ...state,
      providers: nextProviders,
    });
  }

  async delete(providerId: ProviderId): Promise<void> {
    const state = await this.#readState();

    await this.#writeState({
      providers: state.providers.filter((provider) => provider.config.id !== providerId),
      ...(state.selectedProviderId && state.selectedProviderId !== providerId
        ? { selectedProviderId: state.selectedProviderId }
        : {}),
    });
  }

  async getSelectedProviderId(): Promise<ProviderId | undefined> {
    const state = await this.#readState();
    return state.selectedProviderId;
  }

  async setSelectedProviderId(providerId: ProviderId): Promise<void> {
    const state = await this.#readState();
    await this.#writeState({
      ...state,
      selectedProviderId: providerId,
    });
  }

  async #readState(): Promise<ProviderConfigurationState> {
    try {
      const content = await readFile(this.#filePath, 'utf8');
      const parsed = JSON.parse(content) as ProviderConfigurationState;

      return {
        providers: parsed.providers ?? [],
        ...(parsed.selectedProviderId ? { selectedProviderId: parsed.selectedProviderId } : {}),
      };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return emptyState();
      }

      return emptyState();
    }
  }

  async #writeState(state: ProviderConfigurationState): Promise<void> {
    await mkdir(dirname(this.#filePath), { recursive: true });
    await writeFile(this.#filePath, JSON.stringify(state, null, 2), 'utf8');
  }
}
