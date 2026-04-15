import { createHash, randomBytes } from 'node:crypto';

import type { ChannelSummary, PendingTelegramRegistration } from './channel-types.js';
import { SqliteChannelStore } from '../infrastructure/sqlite-channel-store.js';
import { HttpError } from '../http/errors/http-error.js';

interface TelegramUserProfile {
  id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface TelegramMeResponse {
  ok: boolean;
  result?: {
    id: number;
    is_bot: boolean;
    first_name: string;
    username?: string;
  };
  description?: string;
}

interface TelegramGetUpdatesResponse {
  ok: boolean;
  result?: Array<{
    update_id: number;
    message?: {
      text?: string;
      chat?: {
        id: number;
      };
      from?: TelegramUserProfile;
    };
  }>;
  description?: string;
}

interface TelegramSendMessageResponse {
  ok: boolean;
  description?: string;
}

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const POLL_INTERVAL_MS = 2_500;
const SEND_TIMEOUT_MS = 15_000;

const formatTelegramDisplayName = (profile: TelegramUserProfile): string => {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return fullName || profile.username || `Telegram user ${profile.id}`;
};

export class TelegramChannelService {
  readonly #store: SqliteChannelStore;
  #pollTimer: NodeJS.Timeout | undefined;
  #updateOffset = 0;
  #activeToken: string | undefined;
  #pollInFlight = false;

  constructor(store: SqliteChannelStore) {
    this.#store = store;
  }

  async initialize(): Promise<void> {
    this.#store.ensureTelegramChannel();
    const config = this.#store.getTelegramBotConfig();

    if (!config?.token || !config.enabled) {
      return;
    }

    this.#activeToken = config.token;
    this.#startPolling(config.token);
  }

  dispose(): void {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
      this.#pollTimer = undefined;
    }
  }

  async connect(token: string): Promise<{
    channel: ChannelSummary;
    bot: {
      id: number;
      username?: string;
      displayName: string;
    };
  }> {
    const me = await this.#getMe(token);
    const channel = this.#store.saveTelegramBotConfig({
      token,
      botId: me.id,
      displayName: me.first_name,
      ...(me.username ? { username: me.username } : {}),
    });

    this.#activeToken = token;
    this.#startPolling(token);

    return {
      channel,
      bot: {
        id: me.id,
        ...(me.username ? { username: me.username } : {}),
        displayName: me.first_name,
      },
    };
  }

  getStatus(): ChannelSummary {
    return this.#store.getTelegramChannelSummary();
  }

  disconnect(): ChannelSummary {
    this.dispose();
    this.#activeToken = undefined;
    this.#updateOffset = 0;
    return this.#store.disconnectTelegramChannel();
  }

  async recheck(): Promise<ChannelSummary> {
    const config = this.#store.getTelegramBotConfig();

    if (!config?.token) {
      return this.#store.setTelegramChannelStatus('disconnected');
    }

    try {
      await this.#getMe(config.token);
      this.#activeToken = config.token;
      this.#startPolling(config.token);

      const hasUsers = this.#store.listTelegramUsers().length > 0;
      return this.#store.setTelegramChannelStatus(hasUsers ? 'connected' : 'disconnected');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to check Telegram bot.';
      return this.#store.setTelegramChannelStatus('error', message);
    }
  }

  async sendAuthorizationSuccess(telegramUserId: string): Promise<void> {
    const config = this.#store.getTelegramBotConfig();

    if (!config?.token) {
      return;
    }

    await this.#sendMessage(
      config.token,
      Number.parseInt(telegramUserId, 10),
      'Все получилось! Жду команд',
    );
  }

  async sendUserAddedSuccess(telegramUserId: string, role: string): Promise<void> {
    const config = this.#store.getTelegramBotConfig();

    if (!config?.token) {
      return;
    }

    await this.#sendMessage(
      config.token,
      Number.parseInt(telegramUserId, 10),
      `Регистрация завершена. Ваша роль: ${role}. Жду команд.`,
    );
  }

  #startPolling(token: string): void {
    if (this.#pollTimer) {
      clearInterval(this.#pollTimer);
    }

    this.#pollTimer = setInterval(() => {
      void this.#poll(token);
    }, POLL_INTERVAL_MS);

    void this.#poll(token);
  }

  async #poll(token: string): Promise<void> {
    if (this.#pollInFlight || this.#activeToken !== token) {
      return;
    }

    this.#pollInFlight = true;

    try {
      const payload = await this.#request<TelegramGetUpdatesResponse>(
        token,
        'getUpdates',
        {
          offset: this.#updateOffset,
          timeout: 0,
          allowed_updates: ['message'],
        },
      );

      if (!payload.ok) {
        throw new Error(payload.description || 'Telegram update polling failed.');
      }

      const updates = payload.result ?? [];

      for (const update of updates) {
        this.#updateOffset = Math.max(this.#updateOffset, update.update_id + 1);
        await this.#handleUpdate(token, update);
      }

      const hasUsers = this.#store.listTelegramUsers().length > 0;
      this.#store.setTelegramChannelStatus(hasUsers ? 'connected' : 'disconnected');
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Telegram polling failed unexpectedly.';
      this.#store.setTelegramChannelStatus('error', message);
    } finally {
      this.#pollInFlight = false;
    }
  }

  async #handleUpdate(
    token: string,
    update: NonNullable<TelegramGetUpdatesResponse['result']>[number],
  ): Promise<void> {
    const message = update.message;

    if (!message?.from || !message.chat?.id || message.text?.trim() !== '/start') {
      return;
    }

    const key = this.#generateRegistrationKey(message.from.id.toString());
    const pending = this.#store.saveTelegramStart({
      telegramUserId: message.from.id.toString(),
      displayName: formatTelegramDisplayName(message.from),
      key,
      ...(message.from.username ? { username: message.from.username } : {}),
    });

    await this.#sendRegistrationMessage(token, message.chat.id, pending);
  }

  async #sendRegistrationMessage(
    token: string,
    chatId: number,
    pending: PendingTelegramRegistration,
  ): Promise<void> {
    const lines = [
      'Для завершения авторизации в CLI используйте следующие данные:',
      `Ваш id: ${pending.telegramUserId}`,
      `Ваш ключ: ${pending.key}`,
      'Введите их в разделе Channels, чтобы авторизоваться.',
    ];

    if (pending.linked) {
      lines.unshift('Ваш аккаунт уже привязан. Ниже актуальные данные для повторной проверки.');
    }

    await this.#sendMessage(token, chatId, lines.join('\n'));
  }

  #generateRegistrationKey(seed: string): string {
    const entropy = randomBytes(8).toString('hex');
    return createHash('sha256')
      .update(`${seed}:${entropy}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
  }

  async #getMe(token: string): Promise<NonNullable<TelegramMeResponse['result']>> {
    const payload = await this.#request<TelegramMeResponse>(token, 'getMe');

    if (!payload.ok || !payload.result) {
      throw new HttpError(
        400,
        'telegram_connect_failed',
        payload.description || 'Telegram bot token is invalid or unavailable.',
      );
    }

    return payload.result;
  }

  async #sendMessage(token: string, chatId: number, text: string): Promise<void> {
    const payload = await this.#request<TelegramSendMessageResponse>(
      token,
      'sendMessage',
      {
        chat_id: chatId,
        text,
      },
    );

    if (!payload.ok) {
      throw new Error(payload.description || 'Failed to send Telegram message.');
    }
  }

  async #request<TResponse>(
    token: string,
    method: string,
    body?: Record<string, unknown>,
  ): Promise<TResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, SEND_TIMEOUT_MS);

    try {
      const init: RequestInit = {
        method: body ? 'POST' : 'GET',
        signal: controller.signal,
        ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
      };
      const response = await fetch(`${TELEGRAM_API_BASE_URL}/bot${token}/${method}`, init);

      return (await response.json()) as TResponse;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Telegram request timed out.');
      }

      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
