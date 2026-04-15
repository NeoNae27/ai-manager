import type {
  ChannelSummary,
  ChannelUserRole,
  ChannelUserSummary,
  CompletedTelegramAuthorization,
} from './channel-types.js';
import { HttpError } from '../http/errors/http-error.js';
import { SqliteChannelStore } from '../infrastructure/sqlite-channel-store.js';
import { TelegramChannelService } from './telegram-channel-service.js';

const mapChannelError = (error: unknown): never => {
  if (error instanceof HttpError) {
    throw error;
  }

  if (error instanceof Error) {
    if (error.message.includes('invalid')) {
      throw new HttpError(400, 'validation_error', error.message);
    }

    if (error.message.includes('not started registration')) {
      throw new HttpError(409, 'telegram_registration_missing', error.message);
    }

    if (error.message.includes('last Admin')) {
      throw new HttpError(409, 'last_admin_required', error.message);
    }

    throw new HttpError(500, 'internal_error', error.message);
  }

  throw new HttpError(500, 'internal_error', 'Unexpected channel error.');
};

export class ChannelApiService {
  readonly #store: SqliteChannelStore;
  readonly #telegramChannelService: TelegramChannelService;

  constructor(store: SqliteChannelStore, telegramChannelService: TelegramChannelService) {
    this.#store = store;
    this.#telegramChannelService = telegramChannelService;
  }

  listChannels(): ChannelSummary[] {
    return this.#store.listChannels();
  }

  getChannelStatus(channelType: 'telegram'): ChannelSummary {
    if (channelType !== 'telegram') {
      throw new HttpError(404, 'channel_not_found', `Channel "${channelType}" is not supported.`);
    }

    return this.#store.getTelegramChannelSummary();
  }

  async connectTelegram(token: string) {
    try {
      return await this.#telegramChannelService.connect(token);
    } catch (error) {
      return mapChannelError(error);
    }
  }

  async recheckTelegram(): Promise<ChannelSummary> {
    try {
      return await this.#telegramChannelService.recheck();
    } catch (error) {
      return mapChannelError(error);
    }
  }

  disconnectTelegram(): ChannelSummary {
    try {
      return this.#telegramChannelService.disconnect();
    } catch (error) {
      return mapChannelError(error);
    }
  }

  completeTelegramAuth(telegramUserId: string, key: string): CompletedTelegramAuthorization {
    try {
      const result = this.#store.completeTelegramRegistration(telegramUserId, key);
      void this.#telegramChannelService.sendAuthorizationSuccess(telegramUserId);
      return result;
    } catch (error) {
      return mapChannelError(error);
    }
  }

  addTelegramUser(
    telegramUserId: string,
    key: string,
    role: ChannelUserRole,
  ): CompletedTelegramAuthorization {
    try {
      const result = this.#store.completeTelegramRegistration(telegramUserId, key, role);
      void this.#telegramChannelService.sendUserAddedSuccess(telegramUserId, result.user.role);
      return result;
    } catch (error) {
      return mapChannelError(error);
    }
  }

  listTelegramUsers(): ChannelUserSummary[] {
    return this.#store.listTelegramUsers();
  }

  updateTelegramUserRole(userId: string, role: ChannelUserRole): ChannelUserSummary {
    const existing = this.#store.getTelegramUser(userId);

    if (!existing) {
      throw new HttpError(404, 'user_not_found', `Channel user "${userId}" was not found.`);
    }

    if (existing.role === 'Admin' && role !== 'Admin' && this.#store.countActiveAdmins() <= 1) {
      throw new HttpError(
        409,
        'last_admin_required',
        'Cannot change the role of the last Admin user.',
      );
    }

    const updated = this.#store.updateTelegramUserRole(userId, role);

    if (!updated) {
      throw new HttpError(404, 'user_not_found', `Channel user "${userId}" was not found.`);
    }

    return updated;
  }

  removeTelegramUser(userId: string): ChannelUserSummary {
    const existing = this.#store.getTelegramUser(userId);

    if (!existing) {
      throw new HttpError(404, 'user_not_found', `Channel user "${userId}" was not found.`);
    }

    if (existing.role === 'Admin' && this.#store.countActiveAdmins() <= 1) {
      throw new HttpError(409, 'last_admin_required', 'Cannot remove the last Admin user.');
    }

    const removed = this.#store.revokeTelegramUser(userId);

    if (!removed) {
      throw new HttpError(404, 'user_not_found', `Channel user "${userId}" was not found.`);
    }

    return removed;
  }
}
