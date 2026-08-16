import {
  openDatabaseAsync,
  type SQLiteBindParams,
  type SQLiteDatabase,
  type SQLiteRunResult,
  type SQLiteVariadicBindParams,
} from 'expo-sqlite';

/**
 * Storage boundary for the patient vault.
 *
 * The MVP uses standard SQLite. A future SQLCipherVaultDatabase can implement
 * the same contract without leaking database-specific setup into the vault.
 */
export interface VaultDatabase {
  open(): Promise<void>;
  close(): Promise<void>;
  execute(source: string): Promise<void>;
  runAsync(source: string, params: SQLiteBindParams): Promise<SQLiteRunResult>;
  runAsync(source: string, ...params: SQLiteVariadicBindParams): Promise<SQLiteRunResult>;
  getFirstAsync<T>(source: string, params: SQLiteBindParams): Promise<T | null>;
  getFirstAsync<T>(source: string, ...params: SQLiteVariadicBindParams): Promise<T | null>;
  getAllAsync<T>(source: string, params: SQLiteBindParams): Promise<T[]>;
  getAllAsync<T>(source: string, ...params: SQLiteVariadicBindParams): Promise<T[]>;
  transaction(task: () => Promise<void>): Promise<void>;
}

export class SQLiteVaultDatabase implements VaultDatabase {
  private connection: SQLiteDatabase | null = null;

  constructor(private readonly databaseName: string) {}

  async open(): Promise<void> {
    if (this.connection) return;
    const connection = await openDatabaseAsync(this.databaseName);
    try {
      await connection.execAsync('PRAGMA foreign_keys = ON;');
      this.connection = connection;
    } catch (error) {
      await connection.closeAsync().catch(() => undefined);
      throw error;
    }
  }

  async close(): Promise<void> {
    const connection = this.connection;
    this.connection = null;
    if (connection) await connection.closeAsync();
  }

  async execute(source: string): Promise<void> {
    await this.requireConnection().execAsync(source);
  }

  runAsync(source: string, ...params: any[]): Promise<SQLiteRunResult> {
    return this.requireConnection().runAsync(source, ...params);
  }

  getFirstAsync<T>(source: string, ...params: any[]): Promise<T | null> {
    return this.requireConnection().getFirstAsync<T>(source, ...params);
  }

  getAllAsync<T>(source: string, ...params: any[]): Promise<T[]> {
    return this.requireConnection().getAllAsync<T>(source, ...params);
  }

  async transaction(task: () => Promise<void>): Promise<void> {
    await this.requireConnection().withTransactionAsync(task);
  }

  private requireConnection(): SQLiteDatabase {
    if (!this.connection) throw new Error('Vault database is not open.');
    return this.connection;
  }
}
