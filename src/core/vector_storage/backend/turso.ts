/**
 * Turso Backend
 *
 * Implementation of the VectorStore interface for Turso, a distributed SQLite database
 * with vector extensions for similarity search.
 *
 * Features:
 * - Stores vectors in Turso (libSQL) database
 * - Utilizes vector extensions for similarity search
 * - Supports filtering and persistent storage
 * - Distributed and edge-compatible
 *
 * @module vector_storage/backend/turso
 */

import { createClient } from '@libsql/client';
import type { Client } from '@libsql/client';
import type { VectorStore } from './vector-store.js';
import type {
	SearchFilters,
	VectorStoreResult,
	TursoBackendConfig,
} from './types.js';
import { VectorStoreError, VectorStoreConnectionError, VectorDimensionError } from './types.js';
import { Logger, createLogger } from '../../logger/index.js';
import { LOG_PREFIXES, DEFAULTS, ERROR_MESSAGES } from '../constants.js';

/**
 * TursoBackend Class
 *
 * Implements the VectorStore interface for Turso distributed database.
 *
 * @example
 * ```typescript
 * const store = new TursoBackend({
 *   type: 'turso',
 *   url: 'libsql://my-db.turso.io',
 *   authToken: 'token',
 *   collectionName: 'vectors',
 *   dimension: 1536
 * });
 *
 * await store.connect();
 * await store.insert([vector], ['doc1'], [{ title: 'Document' }]);
 * const results = await store.search(queryVector, 5);
 * ```
 */
export class TursoBackend implements VectorStore {
	private readonly config: TursoBackendConfig;
	private readonly collectionName: string;
	private readonly dimension: number;
	private readonly logger: Logger;
	private client?: Client;
	private connected = false;

	constructor(config: TursoBackendConfig) {
		this.config = config;
		this.collectionName = config.collectionName;
		this.dimension = config.dimension;
		this.logger = createLogger({
			level: process.env.LOG_LEVEL || 'info',
		});

		this.logger.debug(`${LOG_PREFIXES.TURSO} Initialized`, {
			collection: this.collectionName,
			dimension: this.dimension,
			url: this.config.url,
		});
	}

	/**
	 * Calculate cosine similarity between two vectors using SQL
	 */
	private async calculateSimilarity(queryVector: number[], storedVector: number[]): Promise<number> {
		// For now, implement in JavaScript. In production, this should use SQL vector functions
		// when Turso supports vector extensions
		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		const minLength = Math.min(queryVector.length, storedVector.length);
		for (let i = 0; i < minLength; i++) {
			const aVal = queryVector[i]!;
			const bVal = storedVector[i]!;
			dotProduct += aVal * bVal;
			normA += aVal * aVal;
			normB += bVal * bVal;
		}

		normA = Math.sqrt(normA);
		normB = Math.sqrt(normB);

		if (normA === 0 || normB === 0) {
			return 0;
		}

		return dotProduct / (normA * normB);
	}

	/**
	 * Serialize vector to string for storage
	 */
	private serializeVector(vector: number[]): string {
		return JSON.stringify(vector);
	}

	/**
	 * Deserialize vector from string
	 */
	private deserializeVector(vectorStr: string): number[] {
		return JSON.parse(vectorStr);
	}

	/**
	 * Serialize payload to string for storage
	 */
	private serializePayload(payload: Record<string, any>): string {
		return JSON.stringify(payload);
	}

	/**
	 * Deserialize payload from string
	 */
	private deserializePayload(payloadStr: string): Record<string, any> {
		return JSON.parse(payloadStr);
	}

	/**
	 * Check if a stored entry matches the given filters
	 */
	private matchesFilters(payload: Record<string, any>, filters?: SearchFilters): boolean {
		if (!filters) return true;

		for (const [key, value] of Object.entries(filters)) {
			const payloadValue = payload[key];

			// Handle null/undefined
			if (value === null || value === undefined) continue;

			// Handle range queries
			if (
				typeof value === 'object' &&
				!Array.isArray(value) &&
				('gte' in value || 'gt' in value || 'lte' in value || 'lt' in value)
			) {
				if (typeof payloadValue !== 'number') return false;

				if ('gte' in value && payloadValue < value.gte!) return false;
				if ('gt' in value && payloadValue <= value.gt!) return false;
				if ('lte' in value && payloadValue > value.lte!) return false;
				if ('lt' in value && payloadValue >= value.lt!) return false;
			}
			// Handle array filters
			else if (
				typeof value === 'object' &&
				!Array.isArray(value) &&
				('any' in value || 'all' in value)
			) {
				if ('any' in value && Array.isArray(value.any)) {
					if (!value.any.includes(payloadValue)) return false;
				}
			}
			// Handle exact match
			else {
				if (payloadValue !== value) return false;
			}
		}

		return true;
	}

	/**
	 * Validate vector dimension
	 */
	private validateDimension(vector: number[]): void {
		if (vector.length !== this.dimension) {
			throw new VectorDimensionError(
				`${ERROR_MESSAGES.INVALID_DIMENSION}: expected ${this.dimension}, got ${vector.length}`,
				this.dimension,
				vector.length
			);
		}
	}

	/**
	 * Ensure the vectors table exists
	 */
	private async ensureTable(): Promise<void> {
		if (!this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'ensureTable');
		}

		const createTableSQL = `
			CREATE TABLE IF NOT EXISTS ${this.collectionName} (
				id INTEGER PRIMARY KEY,
				vector TEXT NOT NULL,
				payload TEXT NOT NULL,
				created_at DATETIME DEFAULT CURRENT_TIMESTAMP
			)
		`;

		try {
			await this.client.execute(createTableSQL);
			this.logger.debug(`${LOG_PREFIXES.TURSO} Ensured table exists`, {
				table: this.collectionName,
			});
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Failed to create table`, { error });
			throw new VectorStoreError('Failed to create vectors table', 'ensureTable', error as Error);
		}
	}

	// VectorStore implementation

	async insert(vectors: number[][], ids: number[], payloads: Record<string, any>[]): Promise<void> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'insert');
		}

		// Validate inputs
		if (vectors.length !== ids.length || vectors.length !== payloads.length) {
			throw new VectorStoreError('Vectors, IDs, and payloads must have the same length', 'insert');
		}

		// Validate dimensions
		for (const vector of vectors) {
			this.validateDimension(vector);
		}

		await this.ensureTable();

		// Insert vectors
		const insertSQL = `
			INSERT OR REPLACE INTO ${this.collectionName} (id, vector, payload)
			VALUES (?, ?, ?)
		`;

		try {
			for (let i = 0; i < vectors.length; i++) {
				const vectorStr = this.serializeVector(vectors[i]!);
				const payloadStr = this.serializePayload(payloads[i]!);

				await this.client.execute({
					sql: insertSQL,
					args: [ids[i], vectorStr, payloadStr],
				});
			}

			this.logger.debug(`${LOG_PREFIXES.TURSO} Inserted ${vectors.length} vectors`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Insert failed`, { error });
			throw new VectorStoreError('Failed to insert vectors', 'insert', error as Error);
		}
	}

	async search(
		query: number[],
		limit: number = DEFAULTS.SEARCH_LIMIT,
		filters?: SearchFilters
	): Promise<VectorStoreResult[]> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'search');
		}

		this.validateDimension(query);

		await this.ensureTable();

		try {
			// Get all vectors (in production, this should be optimized with vector indexing)
			const selectSQL = `SELECT id, vector, payload FROM ${this.collectionName}`;
			const result = await this.client.execute(selectSQL);

			const similarities: Array<{ id: number; score: number; vector: number[]; payload: Record<string, any> }> = [];

			for (const row of result.rows) {
				const id = Number(row.id);
				const vector = this.deserializeVector(String(row.vector));
				const payload = this.deserializePayload(String(row.payload));

				// Apply filters
				if (!this.matchesFilters(payload, filters)) {
					continue;
				}

				// Calculate similarity
				const score = await this.calculateSimilarity(query, vector);
				similarities.push({ id, score, vector, payload });
			}

			// Sort by score (descending) and limit
			similarities.sort((a, b) => b.score - a.score);
			const topResults = similarities.slice(0, limit);

			// Format results
			const formattedResults = topResults.map(({ id, score, vector, payload }) => ({
				id,
				vector,
				payload,
				score,
			}));

			this.logger.debug(`${LOG_PREFIXES.TURSO} Found ${formattedResults.length} results`);

			return formattedResults;
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Search failed`, { error });
			throw new VectorStoreError('Failed to search vectors', 'search', error as Error);
		}
	}

	async get(vectorId: number): Promise<VectorStoreResult | null> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'get');
		}

		await this.ensureTable();

		try {
			const selectSQL = `SELECT id, vector, payload FROM ${this.collectionName} WHERE id = ?`;
			const result = await this.client.execute({
				sql: selectSQL,
				args: [vectorId],
			});

			if (result.rows.length === 0) {
				return null;
			}

			const row = result.rows[0]!;
			const vector = this.deserializeVector(String(row.vector));
			const payload = this.deserializePayload(String(row.payload));

			return {
				id: Number(row.id),
				vector,
				payload,
				score: 1.0, // Perfect match for direct retrieval
			};
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Get failed`, { error });
			throw new VectorStoreError('Failed to get vector', 'get', error as Error);
		}
	}

	async update(vectorId: number, vector: number[], payload: Record<string, any>): Promise<void> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'update');
		}

		this.validateDimension(vector);
		await this.ensureTable();

		try {
			const vectorStr = this.serializeVector(vector);
			const payloadStr = this.serializePayload(payload);

			const updateSQL = `
				UPDATE ${this.collectionName}
				SET vector = ?, payload = ?
				WHERE id = ?
			`;

			await this.client.execute({
				sql: updateSQL,
				args: [vectorStr, payloadStr, vectorId],
			});

			this.logger.debug(`${LOG_PREFIXES.TURSO} Updated vector ${vectorId}`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Update failed`, { error });
			throw new VectorStoreError('Failed to update vector', 'update', error as Error);
		}
	}

	async delete(vectorId: number): Promise<void> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'delete');
		}

		await this.ensureTable();

		try {
			const deleteSQL = `DELETE FROM ${this.collectionName} WHERE id = ?`;
			await this.client.execute({
				sql: deleteSQL,
				args: [vectorId],
			});

			this.logger.debug(`${LOG_PREFIXES.TURSO} Deleted vector ${vectorId}`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Delete failed`, { error });
			throw new VectorStoreError('Failed to delete vector', 'delete', error as Error);
		}
	}

	async deleteCollection(): Promise<void> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'deleteCollection');
		}

		try {
			const countResult = await this.client.execute(`SELECT COUNT(*) as count FROM ${this.collectionName}`);
			const count = Number(countResult.rows[0]?.count || 0);

			const dropSQL = `DROP TABLE IF EXISTS ${this.collectionName}`;
			await this.client.execute(dropSQL);

			this.logger.info(`${LOG_PREFIXES.TURSO} Deleted collection ${this.collectionName} with ${count} vectors`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Delete collection failed`, { error });
			throw new VectorStoreError('Failed to delete collection', 'deleteCollection', error as Error);
		}
	}

	async list(filters?: SearchFilters, limit: number = 100): Promise<[VectorStoreResult[], number]> {
		if (!this.connected || !this.client) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'list');
		}

		await this.ensureTable();

		try {
			const selectSQL = `SELECT id, vector, payload FROM ${this.collectionName}`;
			const result = await this.client.execute(selectSQL);

			const results: VectorStoreResult[] = [];
			let count = 0;

			for (const row of result.rows) {
				const payload = this.deserializePayload(String(row.payload));

				if (this.matchesFilters(payload, filters)) {
					count++;
					if (results.length < limit) {
						const vector = this.deserializeVector(String(row.vector));
						results.push({
							id: Number(row.id),
							vector,
							payload,
							score: 1.0, // Default score for list operations
						});
					}
				}
			}

			this.logger.info(`${LOG_PREFIXES.TURSO} Listed ${results.length} of ${count} vectors`);

			return [results, count];
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} List failed`, { error });
			throw new VectorStoreError('Failed to list vectors', 'list', error as Error);
		}
	}

	async connect(): Promise<void> {
		if (this.connected) {
			this.logger.debug(`${LOG_PREFIXES.TURSO} Already connected`);
			return;
		}

		try {
			this.client = createClient({
				url: this.config.url,
				authToken: this.config.authToken,
				syncUrl: this.config.syncUrl,
			});

			// Test connection
			await this.client.execute('SELECT 1');

			this.connected = true;
			this.logger.debug(`${LOG_PREFIXES.TURSO} Connected to Turso database`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Connection failed`, { error });
			throw new VectorStoreConnectionError(
				'Failed to connect to Turso database',
				'turso',
				error as Error
			);
		}
	}

	async disconnect(): Promise<void> {
		if (!this.connected) {
			this.logger.debug(`${LOG_PREFIXES.TURSO} Already disconnected`);
			return;
		}

		try {
			// libSQL client doesn't have a disconnect method, just set to undefined
			this.client = undefined;
			this.connected = false;
			this.logger.info(`${LOG_PREFIXES.TURSO} Disconnected from Turso database`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.TURSO} Disconnect error`, { error });
			throw error;
		}
	}

	isConnected(): boolean {
		return this.connected;
	}

	getBackendType(): string {
		return 'turso';
	}

	getDimension(): number {
		return this.dimension;
	}

	getCollectionName(): string {
		return this.collectionName;
	}
}