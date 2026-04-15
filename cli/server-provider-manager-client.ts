import type {
  ProviderHealthCheckResult,
  ProviderModelListResult,
  ProviderSummary,
  RegisterProviderOptions,
} from '../ai-provider/src/domain/application-provider.js';
import type { FinishReason, TokenUsage } from '../ai-provider/src/domain/generation.js';
import type { Message } from '../ai-provider/src/domain/message.js';
import type { ProviderId } from '../ai-provider/src/domain/provider.js';
import type {
  ProviderDefinition,
  RegisteredProvider,
} from '../ai-provider/src/domain/provider-registration.js';
import type {
  ChannelSummary,
  ChannelUserRole,
  ChannelUserSummary,
  CompletedTelegramAuthorization,
  TelegramConnectResult,
} from '../server/src/application/channel-types.js';

interface ServerProviderManagerClientOptions {
  serverBaseUrl: string;
  apiPrefix: string;
}

interface ServerErrorPayload {
  error?: {
    code?: string;
    message?: string;
  };
}

interface ProviderDefinitionsResponse {
  providers: ProviderDefinition[];
}

interface ProviderListResponse {
  providers: ProviderSummary[];
}

interface ProviderResponse {
  provider: RegisteredProvider;
}

interface CurrentProviderResponse {
  provider: RegisteredProvider | null;
}

interface PingProviderResponse {
  result: ProviderHealthCheckResult;
}

interface ProviderModelsResponse {
  result: ProviderModelListResult;
}

interface HealthResponse {
  health: {
    status: 'ok';
    timestamp: string;
    database: {
      status: 'ok';
      path: string;
    };
  };
}

interface SandboxChatResponse {
  message: Message;
  model: {
    providerId: ProviderId;
    id: string;
    label: string;
  };
  finishReason: FinishReason;
  usage?: TokenUsage;
}

interface ChannelListResponse {
  channels: ChannelSummary[];
}

interface ChannelResponse {
  channel: ChannelSummary;
}

interface TelegramConnectResponse {
  result: TelegramConnectResult;
}

interface TelegramAuthorizationResponse {
  result: CompletedTelegramAuthorization;
}

interface ChannelUsersResponse {
  users: ChannelUserSummary[];
}

interface ChannelUserResponse {
  user: ChannelUserSummary;
}

const normalizePath = (path: string): string => (path.startsWith('/') ? path : `/${path}`);

const buildUrl = (baseUrl: string, path: string): string =>
  `${baseUrl.replace(/\/+$/, '')}${normalizePath(path)}`;

export interface ProviderManagerClientContract {
  checkServerAvailability(): Promise<void>;
  listSupportedProviders(): Promise<ProviderDefinition[]>;
  listProviders(): Promise<ProviderSummary[]>;
  getCurrentProvider(): Promise<RegisteredProvider | undefined>;
  saveProvider(
    providerId: ProviderId,
    options?: RegisterProviderOptions,
  ): Promise<RegisteredProvider>;
  pingProvider(
    providerId: ProviderId,
    options?: RegisterProviderOptions,
  ): Promise<ProviderHealthCheckResult>;
  getProviderModels(providerId: ProviderId): Promise<ProviderModelListResult>;
  setSelectedProvider(providerId: ProviderId): Promise<RegisteredProvider>;
  sandboxChat(request: {
    providerId?: ProviderId;
    modelId?: string;
    messages: Message[];
  }): Promise<SandboxChatResponse>;
  listChannels(): Promise<ChannelSummary[]>;
  getChannelStatus(channelType: 'telegram'): Promise<ChannelSummary>;
  connectTelegram(token: string): Promise<TelegramConnectResult>;
  completeTelegramAuth(
    telegramUserId: string,
    key: string,
  ): Promise<CompletedTelegramAuthorization>;
  addTelegramUser(
    telegramUserId: string,
    key: string,
    role: ChannelUserRole,
  ): Promise<CompletedTelegramAuthorization>;
  listTelegramUsers(): Promise<ChannelUserSummary[]>;
  updateTelegramUserRole(userId: string, role: ChannelUserRole): Promise<ChannelUserSummary>;
  removeTelegramUser(userId: string): Promise<ChannelUserSummary>;
  recheckTelegram(): Promise<ChannelSummary>;
  disconnectTelegram(): Promise<ChannelSummary>;
}

export class ServerProviderManagerClient implements ProviderManagerClientContract {
  readonly #serverBaseUrl: string;
  readonly #apiPrefix: string;

  constructor({ serverBaseUrl, apiPrefix }: ServerProviderManagerClientOptions) {
    this.#serverBaseUrl = serverBaseUrl;
    this.#apiPrefix = apiPrefix;
  }

  async checkServerAvailability(): Promise<void> {
    await this.#requestJson<HealthResponse>('GET', '/health', undefined, false);
  }

  async listSupportedProviders(): Promise<ProviderDefinition[]> {
    const response = await this.#requestJson<ProviderDefinitionsResponse>('GET', '/providers/definitions');
    return response.providers;
  }

  async listProviders(): Promise<ProviderSummary[]> {
    const response = await this.#requestJson<ProviderListResponse>('GET', '/providers');
    return response.providers;
  }

  async getCurrentProvider(): Promise<RegisteredProvider | undefined> {
    const response = await this.#requestJson<CurrentProviderResponse>('GET', '/providers/current');
    return response.provider ?? undefined;
  }

  async saveProvider(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): Promise<RegisteredProvider> {
    const response = await this.#requestJson<ProviderResponse>('POST', '/providers', {
      providerId,
      ...options,
    });

    return response.provider;
  }

  async pingProvider(
    providerId: ProviderId,
    options: RegisterProviderOptions = {},
  ): Promise<ProviderHealthCheckResult> {
    const response = await this.#requestJson<PingProviderResponse>(
      'POST',
      `/providers/${encodeURIComponent(providerId)}/ping`,
      options,
    );

    return response.result;
  }

  async getProviderModels(providerId: ProviderId): Promise<ProviderModelListResult> {
    const response = await this.#requestJson<ProviderModelsResponse>(
      'GET',
      `/providers/${encodeURIComponent(providerId)}/models`,
    );

    return response.result;
  }

  async setSelectedProvider(providerId: ProviderId): Promise<RegisteredProvider> {
    const response = await this.#requestJson<ProviderResponse>(
      'POST',
      `/providers/${encodeURIComponent(providerId)}/select`,
    );

    return response.provider;
  }

  async sandboxChat(request: {
    providerId?: ProviderId;
    modelId?: string;
    messages: Message[];
  }): Promise<SandboxChatResponse> {
    return this.#requestJson<SandboxChatResponse>('POST', '/chat/sandbox', request);
  }

  async listChannels(): Promise<ChannelSummary[]> {
    const response = await this.#requestJson<ChannelListResponse>('GET', '/channels');
    return response.channels;
  }

  async getChannelStatus(channelType: 'telegram'): Promise<ChannelSummary> {
    const response = await this.#requestJson<ChannelResponse>(
      'GET',
      `/channels/${encodeURIComponent(channelType)}/status`,
    );
    return response.channel;
  }

  async connectTelegram(token: string): Promise<TelegramConnectResult> {
    const response = await this.#requestJson<TelegramConnectResponse>(
      'POST',
      '/channels/telegram/connect',
      { token },
    );
    return response.result;
  }

  async completeTelegramAuth(
    telegramUserId: string,
    key: string,
  ): Promise<CompletedTelegramAuthorization> {
    const response = await this.#requestJson<TelegramAuthorizationResponse>(
      'POST',
      '/channels/telegram/complete-auth',
      { telegramUserId, key },
    );
    return response.result;
  }

  async addTelegramUser(
    telegramUserId: string,
    key: string,
    role: ChannelUserRole,
  ): Promise<CompletedTelegramAuthorization> {
    const response = await this.#requestJson<TelegramAuthorizationResponse>(
      'POST',
      '/channels/telegram/add-user',
      { telegramUserId, key, role },
    );
    return response.result;
  }

  async listTelegramUsers(): Promise<ChannelUserSummary[]> {
    const response = await this.#requestJson<ChannelUsersResponse>('GET', '/channels/telegram/users');
    return response.users;
  }

  async updateTelegramUserRole(
    userId: string,
    role: ChannelUserRole,
  ): Promise<ChannelUserSummary> {
    const response = await this.#requestJson<ChannelUserResponse>(
      'POST',
      `/channels/telegram/users/${encodeURIComponent(userId)}/role`,
      { role },
    );
    return response.user;
  }

  async removeTelegramUser(userId: string): Promise<ChannelUserSummary> {
    const response = await this.#requestJson<ChannelUserResponse>(
      'DELETE',
      `/channels/telegram/users/${encodeURIComponent(userId)}`,
    );
    return response.user;
  }

  async recheckTelegram(): Promise<ChannelSummary> {
    const response = await this.#requestJson<ChannelResponse>('POST', '/channels/telegram/recheck');
    return response.channel;
  }

  async disconnectTelegram(): Promise<ChannelSummary> {
    const response = await this.#requestJson<ChannelResponse>('POST', '/channels/telegram/disconnect');
    return response.channel;
  }

  async #requestJson<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown,
    useApiPrefix = true,
  ): Promise<T> {
    let response: Response;

    try {
      response = await fetch(
        buildUrl(this.#serverBaseUrl, `${useApiPrefix ? this.#apiPrefix : ''}${path}`),
        {
          method,
          headers: {
            Accept: 'application/json',
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        },
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown network error while calling the server.';
      throw new Error(
        `Could not connect to the server at ${this.#serverBaseUrl}. Start it with "npm run server" and try again. Details: ${message}`,
      );
    }

    if (!response.ok) {
      throw await this.#toError(response);
    }

    return (await response.json()) as T;
  }

  async #toError(response: Response): Promise<Error> {
    try {
      const payload = (await response.json()) as ServerErrorPayload;
      const message = payload.error?.message;

      if (message) {
        return new Error(message);
      }
    } catch {
      // Ignore malformed error bodies and fall back to a generic message.
    }

    if (response.status === 404) {
      return new Error('CLI could not reach the requested server endpoint.');
    }

    return new Error(`Server request failed with HTTP ${response.status} ${response.statusText}.`);
  }
}
