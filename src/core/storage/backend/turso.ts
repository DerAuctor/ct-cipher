/**
 * Turso Backend Implementation
 *
 * Provides persistent storage using Turso (SQLite-compatible) database with @libsql/client.
 * Implements the DatabaseBackend interface with remote SQLite storage.
 *
 * @module storage/backend/turso
 */

import { createClient, Client } from '@libsql/client';
import type { DatabaseBackend } from './database-backend.js';
import type { TursoBackendConfig } from '../config.js';
import { StorageError, StorageConnectionError } from './types.js';
import { BACKEND_TYPES, ERROR_MESSAGES } from '../constants.js';
import { Logger, createLogger } from '../../logger/index.js';

/**
 * Turso Database Backend
 *
 * Provides persistent storage using Turso database.
 * Supports key-value operations and list operations for collections.
 *
 * Features:
 * - Remote SQLite-compatible storage via Turso
 * - Authentication via JWT tokens
 * - Automatic connection management
 * - JSON serialization for complex objects
 * - Efficient list operations
 *
 * @example
 * ```typescript
 * const turso = new TursoBackend({
 *   type: 'turso',
 *   url: 'libsql://my-db.turso.io',
 *   authToken: 'your-jwt-token'
 * });
 *
 * await turso.connect();
 * await turso.set('user:123', { name: 'John', email: 'john@example.com' });
 * ```
 */
export class TursoBackend implements DatabaseBackend {
	private readonly logger: Logger;
	private connected = false;
	private client: Client | undefined;

	constructor(private config: TursoBackendConfig) {
		this.logger = createLogger({ level: process.env.LOG_LEVEL || 'info' });

		this.logger.debug('Turso backend initialized', {
			url: config.url,
			hasAuthToken: !!config.authToken,
			hasSyncUrl: !!config.syncUrl,
		});
	}

	async connect(): Promise<void> {
		if (this.connected) {
			return;
		}

		try {
			this.logger.debug('Connecting to Turso database', { url: this.config.url });

			// Create Turso client
			const clientConfig: any = {
				url: this.config.url,
			};

			if (this.config.authToken) {
				clientConfig.authToken = this.config.authToken;
			}

			if (this.config.syncUrl) {
				clientConfig.syncUrl = this.config.syncUrl;
			}

			this.client = createClient(clientConfig);

			if (!this.client) {
				throw new Error('Failed to create Turso client - client instance is null');
			}

			// Test basic database functionality
			this.logger.debug('Testing Turso connection');
			await this.client.execute('SELECT 1 as test');

			// Create tables
			this.logger.debug('Creating database tables');
			await this.createTables();

			this.connected = true;
			this.logger.info('Turso backend connected successfully', {
				url: this.config.url,
			});
		} catch (error) {
			const errorDetails = {
				url: this.config.url,
				hasAuthToken: !!this.config.authToken,
				hasSyncUrl: !!this.config.syncUrl,
				error: error instanceof Error ? error.message : String(error),
				stack: error instanceof Error ? error.stack : undefined,
			};
			console.log('Failed to connect to Turso database', errorDetails);

			throw new StorageConnectionError(
				`Failed to connect to Turso database: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async disconnect(): Promise<void> {
		if (!this.connected || !this.client) {
			return;
		}

		try {
			// Turso client doesn't have explicit disconnect method
			// Connection will be closed when client is garbage collected
			this.client = undefined;
			this.connected = false;
			this.logger.info('Turso backend disconnected');
		} catch (error) {
			this.logger.warn('Error disconnecting from Turso', { error });
		}
	}

	isConnected(): boolean {
		return this.connected && !!this.client;
	}

	getBackendType(): string {
		return BACKEND_TYPES.TURSO;
	}

	async get<T>(key: string): Promise<T | undefined> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			const result = await this.client.execute({
				sql: 'SELECT value FROM cipher_store WHERE key = ?',
				args: [key],
			});

			if (result.rows.length === 0) {
				return undefined;
			}

			const value = result.rows[0].value as string;
			return JSON.parse(value);
		} catch (error) {
			this.logger.error('Error getting value from Turso', { key, error });
			throw new StorageError(
				`Failed to get value: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async set<T>(key: string, value: T): Promise<void> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			const serializedValue = JSON.stringify(value);
			await this.client.execute({
				sql: `INSERT INTO cipher_store (key, value, created_at, updated_at)
				      VALUES (?, ?, ?, ?)
				      ON CONFLICT (key) DO UPDATE SET
				        value = EXCLUDED.value,
				        updated_at = EXCLUDED.updated_at`,
				args: [key, serializedValue, new Date().toISOString(), new Date().toISOString()],
			});
		} catch (error) {
			this.logger.error('Error setting value in Turso', { key, error });
			throw new StorageError(
				`Failed to set value: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async delete(key: string): Promise<void> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			await this.client.execute({
				sql: 'DELETE FROM cipher_store WHERE key = ?',
				args: [key],
			});
		} catch (error) {
			this.logger.error('Error deleting value from Turso', { key, error });
			throw new StorageError(
				`Failed to delete value: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async list(prefix: string): Promise<string[]> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			const result = await this.client.execute({
				sql: 'SELECT key FROM cipher_store WHERE key LIKE ? ORDER BY key',
				args: [`${prefix}%`],
			});

			return result.rows.map(row => row.key as string);
		} catch (error) {
			this.logger.error('Error listing keys from Turso', { prefix, error });
			throw new StorageError(
				`Failed to list keys: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async append<T>(key: string, item: T): Promise<void> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			const serializedItem = JSON.stringify(item);
			await this.client.execute({
				sql: `INSERT INTO cipher_list_items (list_key, item_value, created_at)
				      VALUES (?, ?, ?)`,
				args: [key, serializedItem, new Date().toISOString()],
			});
		} catch (error) {
			this.logger.error('Error appending item to Turso list', { key, error });
			throw new StorageError(
				`Failed to append item: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	async getRange<T>(key: string, start: number, count: number): Promise<T[]> {
		if (!this.isConnected() || !this.client) {
			throw new StorageConnectionError('Turso backend is not connected', BACKEND_TYPES.TURSO);
		}

		try {
			const result = await this.client.execute({
				sql: `SELECT item_value FROM cipher_list_items
				      WHERE list_key = ?
				      ORDER BY created_at ASC
				      LIMIT ? OFFSET ?`,
				args: [key, count, start],
			});

			return result.rows.map(row => JSON.parse(row.item_value as string));
		} catch (error) {
			this.logger.error('Error getting range from Turso list', { key, start, count, error });
			throw new StorageError(
				`Failed to get range: ${error instanceof Error ? error.message : String(error)}`,
				BACKEND_TYPES.TURSO,
				error as Error
			);
		}
	}

	private async createTables(): Promise<void> {
		if (!this.client) {
			throw new Error('Turso client not initialized');
		}

		// Create main key-value store table
		await this.client.execute(`
			CREATE TABLE IF NOT EXISTS cipher_store (
				key TEXT PRIMARY KEY,
				value TEXT NOT NULL,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)
		`);

		// Create list items table
		await this.client.execute(`
			CREATE TABLE IF NOT EXISTS cipher_list_items (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				list_key TEXT NOT NULL,
				item_value TEXT NOT NULL,
				created_at TEXT NOT NULL
			)
		`);

		// Create indexes for better performance
		await this.client.execute(`
			CREATE INDEX IF NOT EXISTS idx_cipher_store_updated_at
			ON cipher_store (updated_at)
		`);

		await this.client.execute(`
			CREATE INDEX IF NOT EXISTS idx_cipher_list_items_key_created
			ON cipher_list_items (list_key, created_at)
		`);
	}
}
