import { SqliteDatabase } from '../infrastructure/sqlite-database.js';

export interface HealthStatus {
  status: 'ok';
  timestamp: string;
  database: {
    status: 'ok';
    path: string;
  };
}

export class HealthService {
  readonly #database: SqliteDatabase;
  readonly #now: () => string;

  constructor(database: SqliteDatabase, now: () => string = () => new Date().toISOString()) {
    this.#database = database;
    this.#now = now;
  }

  async getStatus(): Promise<HealthStatus> {
    this.#database.ping();

    return {
      status: 'ok',
      timestamp: this.#now(),
      database: {
        status: 'ok',
        path: this.#database.filePath,
      },
    };
  }
}
