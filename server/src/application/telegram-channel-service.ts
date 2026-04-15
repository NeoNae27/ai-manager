import { createHash, randomBytes } from 'node:crypto';

import type { ChannelSummary, ChannelUserSummary, PendingTelegramRegistration } from './channel-types.js';
import type { ChatApiService, RuntimeModelSummary } from './chat-api-service.js';
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
      message_thread_id?: number;
      chat?: {
        id: number;
        type?: 'private' | 'group' | 'supergroup' | 'channel';
      };
      from?: TelegramUserProfile;
    };
  }>;
  description?: string;
}

interface TelegramSendMessageResponse {
  ok: boolean;
  result?: {
    message_id: number;
  };
  description?: string;
}

interface TelegramChatActionResponse {
  ok: boolean;
  description?: string;
}

const TELEGRAM_API_BASE_URL = 'https://api.telegram.org';
const POLL_INTERVAL_MS = 2_500;
const SEND_TIMEOUT_MS = 15_000;
const TYPING_REFRESH_INTERVAL_MS = 4_000;

const formatTelegramDisplayName = (profile: TelegramUserProfile): string => {
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim();
  return fullName || profile.username || `Telegram user ${profile.id}`;
};

export class TelegramChannelService {
  readonly #store: SqliteChannelStore;
  readonly #chatApiService: ChatApiService;
  #pollTimer: NodeJS.Timeout | undefined;
  #updateOffset = 0;
  #activeToken: string | undefined;
  #pollInFlight = false;
  readonly #sessionStats = new Map<string, {
    startedAt: string;
    lastSeenAt: string;
    commandCount: number;
  }>();

  constructor(store: SqliteChannelStore, chatApiService: ChatApiService) {
    this.#store = store;
    this.#chatApiService = chatApiService;
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
      'Все получилось! Жду команд.\nДоступные команды: /status, /users, /info, /msg, /help',
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
      `Регистрация завершена. Ваша роль: ${role}. Жду команд.\nДоступные команды: /status, /users, /info, /msg, /help`,
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

    if (!message?.from || !message.chat?.id || !message.text?.trim()) {
      return;
    }

    const parsedCommand = this.#parseCommand(message.text);

    if (!parsedCommand) {
      await this.#handleDirectMessage(
        token,
        message.chat.id,
        message.chat.type,
        message.message_thread_id,
        message.from,
        message.text.trim(),
      );
      return;
    }

    if (parsedCommand.name !== '/start') {
      await this.#handleCommand(
        token,
        message.chat.id,
        message.chat.type,
        message.message_thread_id,
        message.from,
        parsedCommand.name,
        parsedCommand.args,
      );
      return;
    }

    const key = this.#generateRegistrationKey(message.from.id.toString());
    const pending = this.#store.saveTelegramStart({
      telegramUserId: message.from.id.toString(),
      displayName: formatTelegramDisplayName(message.from),
      key,
      ...(message.from.username ? { username: message.from.username } : {}),
    });

    await this.#sendRegistrationMessage(token, message.chat.id, message.message_thread_id, pending);
  }

  async #handleDirectMessage(
    token: string,
    chatId: number,
    chatType: 'private' | 'group' | 'supergroup' | 'channel' | undefined,
    messageThreadId: number | undefined,
    profile: TelegramUserProfile,
    text: string,
  ): Promise<void> {
    if (chatType !== 'private') {
      return;
    }

    const user = this.#store.getTelegramUserByTelegramUserId(profile.id.toString());

    if (!user) {
      await this.#sendMessage(
        token,
        chatId,
        'Вы еще не авторизованы. Отправьте /start и завершите привязку через CLI.',
        messageThreadId,
      );
      return;
    }

    await this.#handleModelRequest(
      token,
      chatId,
      messageThreadId,
      user,
      text,
      false,
    );
  }

  async #handleCommand(
    token: string,
    chatId: number,
    chatType: 'private' | 'group' | 'supergroup' | 'channel' | undefined,
    messageThreadId: number | undefined,
    profile: TelegramUserProfile,
    command: string,
    args: string,
  ): Promise<void> {
    if (command === '/help') {
      await this.#sendMessage(
        token,
        chatId,
        [
          'Доступные команды:',
          '/status - проверить состояние подключения канала',
          '/users - список авторизованных пользователей',
          '/info - общая информация о текущей модели и сессии',
          '/msg <текст> - отправить запрос модели в групповом чате',
          '/help - показать эту справку',
        ].join('\n'),
        messageThreadId,
      );
      return;
    }

    const user = this.#store.getTelegramUserByTelegramUserId(profile.id.toString());

    if (!user) {
      await this.#sendMessage(
        token,
        chatId,
        'Вы еще не авторизованы. Отправьте /start и завершите привязку через CLI.',
        messageThreadId,
      );
      return;
    }

    this.#touchSession(user.telegramUserId);

    switch (command) {
      case '/status':
        await this.#sendMessage(token, chatId, this.#renderStatusMessage(user), messageThreadId);
        return;
      case '/users':
        await this.#handleUsersCommand(token, chatId, messageThreadId, user);
        return;
      case '/info':
        await this.#handleInfoCommand(token, chatId, messageThreadId, user);
        return;
      case '/msg':
        await this.#handleGroupMessageCommand(
          token,
          chatId,
          chatType,
          messageThreadId,
          user,
          args,
        );
        return;
      default:
        await this.#sendMessage(
          token,
          chatId,
          'Неизвестная команда. Используйте /help для списка доступных команд.',
          messageThreadId,
        );
    }
  }

  async #handleUsersCommand(
    token: string,
    chatId: number,
    messageThreadId: number | undefined,
    requester: ChannelUserSummary,
  ): Promise<void> {
    if (requester.role === 'User') {
      await this.#sendMessage(
        token,
        chatId,
        'Команда /users доступна только для ролей Admin и Manager.',
        messageThreadId,
      );
      return;
    }

    const users = this.#store.listTelegramUsers();
    const lines = [
      `Авторизованные пользователи: ${users.length}`,
      ...users.map((user, index) => {
        const username = user.username ? ` (@${user.username})` : '';
        return `${index + 1}. ${user.displayName}${username} - ${user.role}`;
      }),
    ];

    await this.#sendMessage(token, chatId, lines.join('\n'), messageThreadId);
  }

  async #handleGroupMessageCommand(
    token: string,
    chatId: number,
    chatType: 'private' | 'group' | 'supergroup' | 'channel' | undefined,
    messageThreadId: number | undefined,
    requester: ChannelUserSummary,
    args: string,
  ): Promise<void> {
    if (chatType !== 'group' && chatType !== 'supergroup') {
      await this.#sendMessage(
        token,
        chatId,
        'Команда /msg нужна только в групповом чате.',
        messageThreadId,
      );
      return;
    }

    const prompt = args.trim();

    if (!prompt) {
      await this.#sendMessage(
        token,
        chatId,
        'Использование: /msg <сообщение для модели>',
        messageThreadId,
      );
      return;
    }

    await this.#handleModelRequest(
      token,
      chatId,
      messageThreadId,
      requester,
      prompt,
      true,
    );
  }

  async #handleModelRequest(
    token: string,
    chatId: number,
    messageThreadId: number | undefined,
    requester: ChannelUserSummary,
    prompt: string,
    includeRequesterFooter: boolean,
  ): Promise<void> {
    const stopTyping = this.#startTypingIndicator(token, chatId, messageThreadId);

    try {
      const result = await this.#chatApiService.sandboxChat({
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = this.#renderAssistantMessage(
        requester,
        result.message.content,
        result.usage?.totalTokens,
        includeRequesterFooter,
      );
      await this.#sendMessage(token, chatId, text, messageThreadId);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Не удалось получить ответ от модели.';
      await this.#sendMessage(
        token,
        chatId,
        `Ошибка запроса к модели: ${message}`,
        messageThreadId,
      );
    } finally {
      stopTyping();
    }
  }

  async #handleInfoCommand(
    token: string,
    chatId: number,
    messageThreadId: number | undefined,
    requester: ChannelUserSummary,
  ): Promise<void> {
    let modelSummary: RuntimeModelSummary | undefined;

    try {
      modelSummary = await this.#chatApiService.getRuntimeModelSummary();
    } catch {
      modelSummary = undefined;
    }

    const session = this.#touchSession(requester.telegramUserId);
    const contextWindow = modelSummary?.contextWindow ?? 0;
    const lines = [
      `Пользователь: ${requester.displayName}`,
      `Роль: ${requester.role}`,
      modelSummary
        ? `Модель: ${modelSummary.providerName} / ${modelSummary.modelLabel} (${modelSummary.modelId})`
        : 'Модель: недоступна',
      `Время сессии: ${this.#formatSessionDuration(session.startedAt)}`,
      `Контекст сессии: 0 / ${contextWindow > 0 ? contextWindow : 'n/a'}`,
      `Команд в сессии: ${session.commandCount}`,
    ];

    if (modelSummary) {
      lines.push(`Провайдер: ${modelSummary.providerId}`);
    }

    lines.push('Примечание: полноценный Telegram-чат еще не включен, поэтому контекст пока не расходуется.');

    await this.#sendMessage(token, chatId, lines.join('\n'), messageThreadId);
  }

  #renderStatusMessage(user: ChannelUserSummary): string {
    const channel = this.#store.getTelegramChannelSummary();
    const session = this.#touchSession(user.telegramUserId);

    return [
      `Канал: ${channel.label}`,
      `Статус: ${channel.status}`,
      `Авторизован как: ${user.displayName} (${user.role})`,
      `Сессия активна: ${this.#formatSessionDuration(session.startedAt)}`,
      channel.connectedAt ? `Подключено с: ${channel.connectedAt}` : 'Подключено с: n/a',
      channel.lastError ? `Последняя ошибка: ${channel.lastError}` : 'Ошибок подключения нет',
    ].join('\n');
  }

  #touchSession(telegramUserId: string): { startedAt: string; lastSeenAt: string; commandCount: number } {
    const timestamp = new Date().toISOString();
    const existing = this.#sessionStats.get(telegramUserId);

    if (!existing) {
      const created = {
        startedAt: timestamp,
        lastSeenAt: timestamp,
        commandCount: 1,
      };
      this.#sessionStats.set(telegramUserId, created);
      return created;
    }

    const updated = {
      ...existing,
      lastSeenAt: timestamp,
      commandCount: existing.commandCount + 1,
    };
    this.#sessionStats.set(telegramUserId, updated);
    return updated;
  }

  #formatSessionDuration(startedAt: string): string {
    const started = new Date(startedAt).getTime();
    const elapsedMs = Math.max(0, Date.now() - started);
    const minutes = Math.floor(elapsedMs / 60_000);
    const seconds = Math.floor((elapsedMs % 60_000) / 1000);

    if (minutes <= 0) {
      return `${seconds}s`;
    }

    return `${minutes}m ${seconds}s`;
  }

  async #sendRegistrationMessage(
    token: string,
    chatId: number,
    messageThreadId: number | undefined,
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

    await this.#sendMessage(token, chatId, lines.join('\n'), messageThreadId);
  }

  #parseCommand(rawText: string): { name: string; args: string } | undefined {
    const trimmed = rawText.trim();
    const [commandToken, ...rest] = trimmed.split(/\s+/);
    const normalizedCommand = commandToken?.toLowerCase();

    if (!normalizedCommand?.startsWith('/')) {
      return undefined;
    }

    const [commandName, botMention] = normalizedCommand.split('@', 2);

    if (!commandName) {
      return undefined;
    }

    if (!botMention) {
      return {
        name: commandName,
        args: rest.join(' ').trim(),
      };
    }

    const configuredUsername = this.#store.getTelegramBotConfig()?.username?.toLowerCase();

    if (!configuredUsername) {
      return {
        name: commandName,
        args: rest.join(' ').trim(),
      };
    }

    return botMention === configuredUsername
      ? {
          name: commandName,
          args: rest.join(' ').trim(),
        }
      : undefined;
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

  async #sendMessage(
    token: string,
    chatId: number,
    text: string,
    messageThreadId?: number,
  ): Promise<TelegramSendMessageResponse | undefined> {
    const payload = await this.#request<TelegramSendMessageResponse>(
      token,
      'sendMessage',
      {
        chat_id: chatId,
        text,
        ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
      },
    );

    if (!payload.ok) {
      throw new Error(payload.description || 'Failed to send Telegram message.');
    }

    return payload;
  }

  #startTypingIndicator(
    token: string,
    chatId: number,
    messageThreadId?: number,
  ): () => void {
    let stopped = false;

    const sendTyping = (): void => {
      if (stopped) {
        return;
      }

      void this.#sendTypingAction(token, chatId, messageThreadId).catch(() => {
        // Ignore chat action failures so they do not break the actual response.
      });
    };

    sendTyping();
    const timer = setInterval(sendTyping, TYPING_REFRESH_INTERVAL_MS);

    return (): void => {
      stopped = true;
      clearInterval(timer);
    };
  }

  async #sendTypingAction(
    token: string,
    chatId: number,
    messageThreadId?: number,
  ): Promise<void> {
    const payload = await this.#request<TelegramChatActionResponse>(
      token,
      'sendChatAction',
      {
        chat_id: chatId,
        action: 'typing',
        ...(messageThreadId !== undefined ? { message_thread_id: messageThreadId } : {}),
      },
    );

    if (!payload.ok) {
      throw new Error(payload.description || 'Failed to send Telegram typing action.');
    }
  }

  #renderAssistantMessage(
    requester: ChannelUserSummary,
    content: string | Array<{ type: string; text?: string }>,
    totalTokens?: number,
    includeRequesterFooter = true,
  ): string {
    const text =
      typeof content === 'string'
        ? content.trim()
        : content
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text' && typeof part.text === 'string')
            .map((part) => part.text.trim())
            .filter((part) => part.length > 0)
            .join('\n');

    const lines = [text.length > 0 ? text : '[empty response]'];

    if (includeRequesterFooter) {
      lines.push('', `Запросил: ${requester.displayName}`);
    }

    if (totalTokens !== undefined) {
      lines.push(`Токены: ${totalTokens}`);
    }

    return lines.join('\n');
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
