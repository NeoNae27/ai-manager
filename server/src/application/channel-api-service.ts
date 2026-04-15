import type {
  ChannelSummary,
  ChannelUserRole,
  ChannelUserSummary,
  CompletedTelegramAuthorization,
} from './channel-types.js';
import { HttpError } from '../http/errors/http-error.js';
import { SqliteChannelStore } from '../infrastructure/sqlite-channel-store.js';
import { TelegramChannelService } from './telegram-channel-service.js';
import type { Logger } from '../logging/logger.js';

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
  readonly #logger: Logger;

  constructor(store: SqliteChannelStore, telegramChannelService: TelegramChannelService, logger: Logger) {
    this.#store = store;
    this.#telegramChannelService = telegramChannelService;
    this.#logger = logger;
  }

  listChannels(): ChannelSummary[] {
    this.#logger.info('Listing channels.');
    return this.#store.listChannels();
  }

  getChannelStatus(channelType: 'telegram'): ChannelSummary {
    if (channelType !== 'telegram') {
      throw new HttpError(404, 'channel_not_found', `Channel "${channelType}" is not supported.`);
    }

    this.#logger.info('Loading channel status.', {
      channelType,
    });
    return this.#store.getTelegramChannelSummary();
  }

  async connectTelegram(token: string) {
    try {
      this.#logger.info('Connecting Telegram channel.');
      const result = await this.#telegramChannelService.connect(token);
      this.#logger.info('Telegram channel connected.', {
        status: result.channel.status,
        botId: result.bot.id,
        botUsername: result.bot.username,
      });
      return result;
    } catch (error) {
      this.#logger.error('Failed to connect Telegram channel.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapChannelError(error);
    }
  }

  async recheckTelegram(): Promise<ChannelSummary> {
    try {
      this.#logger.info('Rechecking Telegram channel.');
      const channel = await this.#telegramChannelService.recheck();
      this.#logger.info('Telegram channel recheck completed.', {
        status: channel.status,
      });
      return channel;
    } catch (error) {
      this.#logger.error('Telegram channel recheck failed.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapChannelError(error);
    }
  }

  disconnectTelegram(): ChannelSummary {
    try {
      this.#logger.info('Disconnecting Telegram channel.');
      const channel = this.#telegramChannelService.disconnect();
      this.#logger.info('Telegram channel disconnected.', {
        status: channel.status,
      });
      return channel;
    } catch (error) {
      this.#logger.error('Failed to disconnect Telegram channel.', {
        error: error instanceof Error ? error.message : String(error),
      });
      return mapChannelError(error);
    }
  }

  completeTelegramAuth(telegramUserId: string, key: string): CompletedTelegramAuthorization {
    try {
      this.#logger.info('Completing Telegram authorization.', {
        telegramUserId,
      });
      const result = this.#store.completeTelegramRegistration(telegramUserId, key);
      void this.#telegramChannelService.sendAuthorizationSuccess(telegramUserId);
      this.#logger.info('Telegram authorization completed.', {
        telegramUserId,
        role: result.user.role,
      });
      return result;
    } catch (error) {
      this.#logger.error('Failed to complete Telegram authorization.', {
        telegramUserId,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapChannelError(error);
    }
  }

  addTelegramUser(
    telegramUserId: string,
    key: string,
    role: ChannelUserRole,
  ): CompletedTelegramAuthorization {
    try {
      this.#logger.info('Adding Telegram user.', {
        telegramUserId,
        role,
      });
      const result = this.#store.completeTelegramRegistration(telegramUserId, key, role);
      void this.#telegramChannelService.sendUserAddedSuccess(telegramUserId, result.user.role);
      this.#logger.info('Telegram user added.', {
        telegramUserId,
        role: result.user.role,
      });
      return result;
    } catch (error) {
      this.#logger.error('Failed to add Telegram user.', {
        telegramUserId,
        role,
        error: error instanceof Error ? error.message : String(error),
      });
      return mapChannelError(error);
    }
  }

  listTelegramUsers(): ChannelUserSummary[] {
    this.#logger.info('Listing Telegram users.');
    return this.#store.listTelegramUsers();
  }

  getTelegramAuthorizedUserByTelegramId(telegramUserId: string): ChannelUserSummary | undefined {
    return this.#store.getTelegramUserByTelegramUserId(telegramUserId);
  }

  updateTelegramUserRole(userId: string, role: ChannelUserRole): ChannelUserSummary {
    this.#logger.info('Updating Telegram user role.', {
      userId,
      role,
    });
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

    this.#logger.info('Telegram user role updated.', {
      userId,
      role: updated.role,
    });

    return updated;
  }

  removeTelegramUser(userId: string): ChannelUserSummary {
    this.#logger.info('Removing Telegram user.', {
      userId,
    });
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

    this.#logger.info('Telegram user removed.', {
      userId,
      telegramUserId: removed.telegramUserId,
    });

    return removed;
  }
}
