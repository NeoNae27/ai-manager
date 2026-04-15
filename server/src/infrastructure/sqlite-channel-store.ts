import { randomUUID } from 'node:crypto';

import type {
  ChannelMembershipStatus,
  ChannelStatus,
  ChannelSummary,
  ChannelType,
  ChannelUserRole,
  ChannelUserSummary,
  PendingTelegramRegistration,
} from '../application/channel-types.js';
import { SqliteDatabase } from './sqlite-database.js';

interface ChannelRow {
  type: string;
  status: string;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface TelegramConfigRow {
  channel_type: string;
  bot_token: string | null;
  enabled: number;
  connected_at: string | null;
  bot_id: number | null;
  bot_username: string | null;
  bot_display_name: string | null;
}

interface TelegramIdentityRow {
  id: number;
  telegram_user_id: string;
  username: string | null;
  display_name: string;
  linked_user_id: string | null;
  created_at: string;
  updated_at: string;
}

interface RegistrationKeyRow {
  telegram_identity_id: number;
  registration_key: string;
  active: number;
  created_at: string;
  updated_at: string;
}

interface ChannelUserRow {
  user_id: string;
  role: string;
  status: string;
  created_at: string;
  telegram_user_id: string;
  username: string | null;
  display_name: string;
}

interface TelegramBotConfig {
  token: string;
  enabled: boolean;
  connectedAt?: string;
  botId?: number;
  username?: string;
  displayName?: string;
}

const TELEGRAM_CHANNEL: ChannelType = 'telegram';
const CHANNEL_LABEL = 'Telegram';

const now = (): string => new Date().toISOString();

const mapChannelSummary = (
  channel: ChannelRow | undefined,
  config: TelegramConfigRow | undefined,
): ChannelSummary => {
  const status = (channel?.status ?? 'disconnected') as ChannelStatus;

  return {
    type: TELEGRAM_CHANNEL,
    label: CHANNEL_LABEL,
    status,
    connected: status === 'connected',
    configured: Boolean(config?.bot_token),
    ...(channel?.last_error ? { lastError: channel.last_error } : {}),
    ...(config?.connected_at ? { connectedAt: config.connected_at } : {}),
  };
};

const mapUserSummary = (row: ChannelUserRow): ChannelUserSummary => ({
  userId: row.user_id,
  telegramUserId: row.telegram_user_id,
  displayName: row.display_name,
  ...(row.username ? { username: row.username } : {}),
  role: row.role as ChannelUserRole,
  status: row.status as ChannelMembershipStatus,
  createdAt: row.created_at,
});

export class SqliteChannelStore {
  readonly #database: SqliteDatabase;

  constructor(database: SqliteDatabase) {
    this.#database = database;
  }

  ensureTelegramChannel(): void {
    const timestamp = now();
    this.#database.connection
      .prepare(
        `
          INSERT INTO channels (type, status, last_error, created_at, updated_at)
          VALUES (@type, @status, NULL, @created_at, @updated_at)
          ON CONFLICT(type) DO NOTHING
        `,
      )
      .run({
        type: TELEGRAM_CHANNEL,
        status: 'disconnected',
        created_at: timestamp,
        updated_at: timestamp,
      });

    this.#database.connection
      .prepare(
        `
          INSERT INTO telegram_channel_config (
            channel_type,
            bot_token,
            enabled,
            connected_at,
            bot_id,
            bot_username,
            bot_display_name
          )
          VALUES (@channel_type, NULL, 0, NULL, NULL, NULL, NULL)
          ON CONFLICT(channel_type) DO NOTHING
        `,
      )
      .run({
        channel_type: TELEGRAM_CHANNEL,
      });
  }

  getTelegramChannelSummary(): ChannelSummary {
    this.ensureTelegramChannel();

    const channel = this.#database.connection
      .prepare('SELECT * FROM channels WHERE type = ?')
      .get(TELEGRAM_CHANNEL);
    const config = this.#database.connection
      .prepare('SELECT * FROM telegram_channel_config WHERE channel_type = ?')
      .get(TELEGRAM_CHANNEL);

    return mapChannelSummary(channel as ChannelRow | undefined, config as TelegramConfigRow | undefined);
  }

  listChannels(): ChannelSummary[] {
    return [this.getTelegramChannelSummary()];
  }

  getTelegramBotConfig(): TelegramBotConfig | undefined {
    this.ensureTelegramChannel();

    const row = this.#database.connection
      .prepare('SELECT * FROM telegram_channel_config WHERE channel_type = ?')
      .get(TELEGRAM_CHANNEL);

    const typedRow = row as TelegramConfigRow | undefined;

    if (!typedRow?.bot_token) {
      return undefined;
    }

    return {
      token: typedRow.bot_token,
      enabled: Boolean(typedRow.enabled),
      ...(typedRow.connected_at ? { connectedAt: typedRow.connected_at } : {}),
      ...(typedRow.bot_id !== null ? { botId: typedRow.bot_id } : {}),
      ...(typedRow.bot_username ? { username: typedRow.bot_username } : {}),
      ...(typedRow.bot_display_name ? { displayName: typedRow.bot_display_name } : {}),
    };
  }

  saveTelegramBotConfig(input: {
    token: string;
    botId: number;
    username?: string;
    displayName: string;
  }): ChannelSummary {
    this.ensureTelegramChannel();
    const timestamp = now();
    const transaction = this.#database.connection.transaction(() => {
      this.#database.connection
        .prepare(
          `
            UPDATE telegram_channel_config
            SET
              bot_token = @bot_token,
              enabled = 1,
              connected_at = NULL,
              bot_id = @bot_id,
              bot_username = @bot_username,
              bot_display_name = @bot_display_name
            WHERE channel_type = @channel_type
          `,
        )
        .run({
          channel_type: TELEGRAM_CHANNEL,
          bot_token: input.token,
          bot_id: input.botId,
          bot_username: input.username ?? null,
          bot_display_name: input.displayName,
        });

      this.#database.connection
        .prepare(
          `
            UPDATE channels
            SET status = 'disconnected', last_error = NULL, updated_at = @updated_at
            WHERE type = @type
          `,
        )
        .run({
          type: TELEGRAM_CHANNEL,
          updated_at: timestamp,
        });
    });

    transaction();
    return this.getTelegramChannelSummary();
  }

  setTelegramChannelStatus(status: ChannelStatus, lastError?: string): ChannelSummary {
    this.ensureTelegramChannel();
    const timestamp = now();
    const transaction = this.#database.connection.transaction(() => {
      this.#database.connection
        .prepare(
          `
            UPDATE channels
            SET status = @status, last_error = @last_error, updated_at = @updated_at
            WHERE type = @type
          `,
        )
        .run({
          type: TELEGRAM_CHANNEL,
          status,
          last_error: lastError ?? null,
          updated_at: timestamp,
        });

      if (status === 'connected') {
        this.#database.connection
          .prepare(
            `
              UPDATE telegram_channel_config
              SET connected_at = @connected_at, enabled = 1
              WHERE channel_type = @channel_type
            `,
          )
          .run({
            channel_type: TELEGRAM_CHANNEL,
            connected_at: timestamp,
          });
      }
    });

    transaction();
    return this.getTelegramChannelSummary();
  }

  disconnectTelegramChannel(): ChannelSummary {
    this.ensureTelegramChannel();
    const timestamp = now();
    const transaction = this.#database.connection.transaction(() => {
      this.#database.connection
        .prepare(
          `
            UPDATE telegram_channel_config
            SET
              bot_token = NULL,
              enabled = 0,
              connected_at = NULL,
              bot_id = NULL,
              bot_username = NULL,
              bot_display_name = NULL
            WHERE channel_type = @channel_type
          `,
        )
        .run({
          channel_type: TELEGRAM_CHANNEL,
        });

      this.#database.connection
        .prepare(
          `
            UPDATE channels
            SET status = 'disconnected', last_error = NULL, updated_at = @updated_at
            WHERE type = @type
          `,
        )
        .run({
          type: TELEGRAM_CHANNEL,
          updated_at: timestamp,
        });
    });

    transaction();
    return this.getTelegramChannelSummary();
  }

  saveTelegramStart(input: {
    telegramUserId: string;
    username?: string;
    displayName: string;
    key: string;
  }): PendingTelegramRegistration {
    this.ensureTelegramChannel();
    const timestamp = now();
    const transaction = this.#database.connection.transaction(() => {
      this.#database.connection
        .prepare(
          `
            INSERT INTO telegram_identities (
              telegram_user_id,
              username,
              display_name,
              linked_user_id,
              created_at,
              updated_at
            )
            VALUES (@telegram_user_id, @username, @display_name, NULL, @created_at, @updated_at)
            ON CONFLICT(telegram_user_id) DO UPDATE SET
              username = excluded.username,
              display_name = excluded.display_name,
              updated_at = excluded.updated_at
          `,
        )
        .run({
          telegram_user_id: input.telegramUserId,
          username: input.username ?? null,
          display_name: input.displayName,
          created_at: timestamp,
          updated_at: timestamp,
        });

      const identity = this.#database.connection
        .prepare('SELECT * FROM telegram_identities WHERE telegram_user_id = ?')
        .get(input.telegramUserId) as TelegramIdentityRow | undefined;

      if (!identity) {
        throw new Error('Failed to create Telegram identity.');
      }

      this.#database.connection
        .prepare(
          `
            INSERT INTO telegram_registration_keys (
              telegram_identity_id,
              registration_key,
              active,
              created_at,
              updated_at
            )
            VALUES (@telegram_identity_id, @registration_key, 1, @created_at, @updated_at)
            ON CONFLICT(telegram_identity_id) DO UPDATE SET
              registration_key = excluded.registration_key,
              active = 1,
              updated_at = excluded.updated_at
          `,
        )
        .run({
          telegram_identity_id: identity.id,
          registration_key: input.key,
          created_at: timestamp,
          updated_at: timestamp,
        });
      return identity;
    });

    const identity = transaction();
    return {
      telegramUserId: identity.telegram_user_id,
      displayName: identity.display_name,
      ...(identity.username ? { username: identity.username } : {}),
      key: input.key,
      linked: Boolean(identity.linked_user_id),
    };
  }

  getPendingRegistration(telegramUserId: string): PendingTelegramRegistration | undefined {
    this.ensureTelegramChannel();
    const row = this.#database.connection
      .prepare(
        `
          SELECT i.*, k.registration_key, k.active, k.created_at AS key_created_at, k.updated_at AS key_updated_at
          FROM telegram_identities i
          INNER JOIN telegram_registration_keys k ON k.telegram_identity_id = i.id
          WHERE i.telegram_user_id = ? AND k.active = 1
        `,
      )
      .get(telegramUserId) as (TelegramIdentityRow & RegistrationKeyRow & {
        key_created_at?: string;
        key_updated_at?: string;
      }) | undefined;

    if (!row) {
      return undefined;
    }

    return {
      telegramUserId: row.telegram_user_id,
      displayName: row.display_name,
      ...(row.username ? { username: row.username } : {}),
      key: row.registration_key,
      linked: Boolean(row.linked_user_id),
    };
  }

  completeTelegramRegistration(
    telegramUserId: string,
    registrationKey: string,
    role?: ChannelUserRole,
  ): { user: ChannelUserSummary; autoAssignedAdmin: boolean } {
    this.ensureTelegramChannel();
    const timestamp = now();

    const transaction = this.#database.connection.transaction(() => {
      const row = this.#database.connection
        .prepare(
          `
            SELECT i.*, k.registration_key, k.active, k.created_at, k.updated_at
            FROM telegram_identities i
            INNER JOIN telegram_registration_keys k ON k.telegram_identity_id = i.id
            WHERE i.telegram_user_id = ? AND k.active = 1
          `,
        )
        .get(telegramUserId) as (TelegramIdentityRow & RegistrationKeyRow) | undefined;

      if (!row) {
        throw new Error('Telegram user has not started registration yet.');
      }

      if (row.registration_key !== registrationKey) {
        throw new Error('The provided Telegram registration key is invalid.');
      }

      const activeAdminCount = this.#database.connection
        .prepare(
          `
            SELECT COUNT(*) AS total
            FROM channel_memberships
            WHERE channel_type = ? AND role = 'Admin' AND status = 'active'
          `,
        )
        .get(TELEGRAM_CHANNEL) as { total: number } | undefined;

      const assignedRole: ChannelUserRole =
        (activeAdminCount?.total ?? 0) === 0 ? 'Admin' : (role ?? 'User');
      const autoAssignedAdmin = (activeAdminCount?.total ?? 0) === 0;
      const linkedUserId = row.linked_user_id ?? randomUUID();

      if (!row.linked_user_id) {
        this.#database.connection
          .prepare(
            `
              INSERT INTO users (id, created_at, updated_at)
              VALUES (@id, @created_at, @updated_at)
            `,
          )
          .run({
            id: linkedUserId,
            created_at: timestamp,
            updated_at: timestamp,
          });
      } else {
        this.#database.connection
          .prepare('UPDATE users SET updated_at = @updated_at WHERE id = @id')
          .run({
            id: linkedUserId,
            updated_at: timestamp,
          });
      }

      this.#database.connection
        .prepare(
          `
            UPDATE telegram_identities
            SET linked_user_id = @linked_user_id, updated_at = @updated_at
            WHERE id = @id
          `,
        )
        .run({
          id: row.id,
          linked_user_id: linkedUserId,
          updated_at: timestamp,
        });

      this.#database.connection
        .prepare(
          `
            INSERT INTO channel_memberships (
              channel_type,
              user_id,
              role,
              status,
              created_at,
              updated_at
            )
            VALUES (@channel_type, @user_id, @role, 'active', @created_at, @updated_at)
            ON CONFLICT(channel_type, user_id) DO UPDATE SET
              role = excluded.role,
              status = 'active',
              updated_at = excluded.updated_at
          `,
        )
        .run({
          channel_type: TELEGRAM_CHANNEL,
          user_id: linkedUserId,
          role: assignedRole,
          created_at: timestamp,
          updated_at: timestamp,
        });

      if (autoAssignedAdmin) {
        this.#database.connection
          .prepare(
            `
              UPDATE channels
              SET status = 'connected', last_error = NULL, updated_at = @updated_at
              WHERE type = @type
            `,
          )
          .run({
            type: TELEGRAM_CHANNEL,
            updated_at: timestamp,
          });

        this.#database.connection
          .prepare(
            `
              UPDATE telegram_channel_config
              SET connected_at = @connected_at, enabled = 1
              WHERE channel_type = @channel_type
            `,
          )
          .run({
            channel_type: TELEGRAM_CHANNEL,
            connected_at: timestamp,
          });
      }

      const user = this.#database.connection
        .prepare(
          `
            SELECT
              m.user_id,
              m.role,
              m.status,
              m.created_at,
              i.telegram_user_id,
              i.username,
              i.display_name
            FROM channel_memberships m
            INNER JOIN telegram_identities i ON i.linked_user_id = m.user_id
            WHERE m.channel_type = ? AND m.user_id = ?
          `,
        )
        .get(TELEGRAM_CHANNEL, linkedUserId) as ChannelUserRow | undefined;

      if (!user) {
        throw new Error('Failed to complete Telegram registration.');
      }

      return {
        user: mapUserSummary(user),
        autoAssignedAdmin,
      };
    });

    return transaction();
  }

  listTelegramUsers(): ChannelUserSummary[] {
    this.ensureTelegramChannel();

    const rows = this.#database.connection
      .prepare(
        `
          SELECT
            m.user_id,
            m.role,
            m.status,
            m.created_at,
            i.telegram_user_id,
            i.username,
            i.display_name
          FROM channel_memberships m
          INNER JOIN telegram_identities i ON i.linked_user_id = m.user_id
          WHERE m.channel_type = ? AND m.status = 'active'
          ORDER BY
            CASE m.role
              WHEN 'Admin' THEN 0
              WHEN 'Manager' THEN 1
              ELSE 2
            END,
            i.display_name ASC
        `,
      )
      .all(TELEGRAM_CHANNEL) as ChannelUserRow[];

    return rows.map((row) => mapUserSummary(row));
  }

  getTelegramUser(userId: string): ChannelUserSummary | undefined {
    const row = this.#database.connection
      .prepare(
        `
          SELECT
            m.user_id,
            m.role,
            m.status,
            m.created_at,
            i.telegram_user_id,
            i.username,
            i.display_name
          FROM channel_memberships m
            INNER JOIN telegram_identities i ON i.linked_user_id = m.user_id
            WHERE m.channel_type = ? AND m.user_id = ? AND m.status = 'active'
        `,
      )
      .get(TELEGRAM_CHANNEL, userId) as ChannelUserRow | undefined;

    return row ? mapUserSummary(row) : undefined;
  }

  countActiveAdmins(): number {
    const row = this.#database.connection
      .prepare(
        `
          SELECT COUNT(*) AS total
          FROM channel_memberships
          WHERE channel_type = ? AND role = 'Admin' AND status = 'active'
        `,
      )
      .get(TELEGRAM_CHANNEL) as { total: number } | undefined;

    return row?.total ?? 0;
  }

  updateTelegramUserRole(userId: string, role: ChannelUserRole): ChannelUserSummary | undefined {
    const timestamp = now();
    this.#database.connection
      .prepare(
        `
          UPDATE channel_memberships
          SET role = @role, updated_at = @updated_at
          WHERE channel_type = @channel_type AND user_id = @user_id AND status = 'active'
        `,
      )
      .run({
        channel_type: TELEGRAM_CHANNEL,
        user_id: userId,
        role,
        updated_at: timestamp,
      });

    return this.getTelegramUser(userId);
  }

  revokeTelegramUser(userId: string): ChannelUserSummary | undefined {
    const existing = this.getTelegramUser(userId);

    if (!existing) {
      return undefined;
    }

    const timestamp = now();
    this.#database.connection
      .prepare(
        `
          UPDATE channel_memberships
          SET status = 'revoked', updated_at = @updated_at
          WHERE channel_type = @channel_type AND user_id = @user_id AND status = 'active'
        `,
      )
      .run({
        channel_type: TELEGRAM_CHANNEL,
        user_id: userId,
        updated_at: timestamp,
      });

    return existing;
  }
}
