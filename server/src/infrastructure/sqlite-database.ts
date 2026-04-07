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
