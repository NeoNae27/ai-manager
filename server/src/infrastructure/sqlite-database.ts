import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

type SqliteConnection = InstanceType<typeof Database>;

const schema = `
  CREATE TABLE IF NOT EXISTS providers (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    auth_json TEXT NOT NULL,
    enabled INTEGER NOT NULL,
    timeout_ms INTEGER NOT NULL,
    default_model_id TEXT,
    metadata_json TEXT,
    connection_ok INTEGER NOT NULL,
    connection_checked_at TEXT NOT NULL,
    connection_latency_ms INTEGER NOT NULL,
    connection_message TEXT NOT NULL,
    connection_details_json TEXT,
    models_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS app_state (
    key TEXT PRIMARY KEY,
    value TEXT
  );

  CREATE TABLE IF NOT EXISTS channels (
    type TEXT PRIMARY KEY,
    status TEXT NOT NULL,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telegram_channel_config (
    channel_type TEXT PRIMARY KEY,
    bot_token TEXT,
    enabled INTEGER NOT NULL DEFAULT 0,
    connected_at TEXT,
    bot_id INTEGER,
    bot_username TEXT,
    bot_display_name TEXT,
    FOREIGN KEY(channel_type) REFERENCES channels(type)
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS telegram_identities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id TEXT NOT NULL UNIQUE,
    username TEXT,
    display_name TEXT NOT NULL,
    linked_user_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(linked_user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS telegram_registration_keys (
    telegram_identity_id INTEGER PRIMARY KEY,
    registration_key TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(telegram_identity_id) REFERENCES telegram_identities(id)
  );

  CREATE TABLE IF NOT EXISTS channel_memberships (
    channel_type TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    PRIMARY KEY(channel_type, user_id),
    FOREIGN KEY(channel_type) REFERENCES channels(type),
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`;

export class SqliteDatabase {
  readonly #connection: SqliteConnection;
  readonly #filePath: string;

  constructor(filePath: string) {
    mkdirSync(dirname(filePath), { recursive: true });

    this.#filePath = filePath;
    this.#connection = new Database(filePath);
    this.#connection.pragma('journal_mode = WAL');
  }

  get filePath(): string {
    return this.#filePath;
  }

  get connection(): SqliteConnection {
    return this.#connection;
  }

  initialize(): void {
    this.#connection.exec(schema);
  }

  ping(): void {
    this.#connection.prepare('SELECT 1').get();
  }

  close(): void {
    this.#connection.close();
  }
}
