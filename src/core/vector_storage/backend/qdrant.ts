/**
 * Qdrant Vector Store Backend
 *
 * Implementation of the VectorStore interface for Qdrant vector database.
 * Qdrant is a high-performance vector similarity search engine.
 *
 * Features:
 * - High-performance similarity search
 * - Rich filtering capabilities
 * - Persistent storage with optional on-disk vectors
 * - REST and gRPC API support
 *
 * @module vector_storage/backend/qdrant
 */

const { QdrantClient } = await import('@qdrant/js-client-rest');
import type { VectorStore } from './vector-store.js';
import type { SearchFilters, VectorStoreResult, QdrantBackendConfig } from './types.js';
import { VectorStoreError, VectorStoreConnectionError, VectorDimensionError } from './types.js';
import { Logger, createLogger } from '../../logger/index.js';
import { LOG_PREFIXES, DEFAULTS, ERROR_MESSAGES } from '../constants.js';

/**
 * Qdrant filter structure
 */
interface QdrantFilter {
	must?: QdrantCondition[];
	must_not?: QdrantCondition[];
	should?: QdrantCondition[];
}

/**
 * Qdrant condition for filtering
 */
interface QdrantCondition {
	key: string;
	match?: { value: any };
	range?: { gte?: number; gt?: number; lte?: number; lt?: number };
}

/**
 * QdrantBackend Class
 *
 * Implements the VectorStore interface for Qdrant vector database.
 *
 * @example
 * ```typescript
 * const qdrant = new QdrantBackend({
 *   type: 'qdrant',
 *   host: 'localhost',
 *   port: 6333,
 *   collectionName: 'documents',
 *   dimension: 1536
 * });
 *
 * await qdrant.connect();
 * await qdrant.insert([vector], ['doc1'], [{ title: 'Document' }]);
 * const results = await qdrant.search(queryVector, 10);
 * ```
 */
export class QdrantBackend implements VectorStore {
	private client: QdrantClient;
	private readonly config: QdrantBackendConfig;
	private readonly collectionName: string;
	private readonly dimension: number;
	private readonly logger: Logger;
	private connected = false;

	constructor(config: QdrantBackendConfig) {
	this.config = config;
	this.collectionName = config.collectionName;
	this.dimension = config.dimension;
	this.logger = createLogger({
		level: process.env.LOG_LEVEL || 'info',
	});

	// Initialize client
	if (config.url) {
		// Use URL if provided
		const clientParams: any = {
			url: config.url,
			checkCompatibility: false,
		};
		if (config.apiKey) {
			clientParams.apiKey = config.apiKey;
		}
		this.client = new QdrantClient(clientParams);
	} else {
		// Use host/port
		const params: any = {
			host: config.host || 'localhost',
			port: config.port || DEFAULTS.QDRANT_PORT,
			checkCompatibility: false,
		};

		if (config.apiKey) {
			params.apiKey = config.apiKey;
		}

		this.client = new QdrantClient(params);
	}

	this.logger.debug(`${LOG_PREFIXES.QDRANT} Initialized`, {
		collection: this.collectionName,
		dimension: this.dimension,
		host: config.host || config.url || 'local',
	});
}

	/**
	 * Convert search filters to Qdrant filter format
	 */
	private createFilter(filters?: SearchFilters): QdrantFilter | undefined {
		if (!filters) return undefined;

		const conditions: QdrantCondition[] = [];

		for (const [key, value] of Object.entries(filters)) {
			if (value === null || value === undefined) continue;

			// Handle range queries
			if (
				typeof value === 'object' &&
				!Array.isArray(value) &&
				('gte' in value || 'gt' in value || 'lte' in value || 'lt' in value)
			) {
				conditions.push({
					key,
					range: value as any,
				});
			}
			// Handle array filters (any/all)
			else if (
				typeof value === 'object' &&
				!Array.isArray(value) &&
				('any' in value || 'all' in value)
			) {
				// Qdrant doesn't have direct any/all support in the same way
				// For 'any', we can use multiple should conditions
				// For 'all', we would need multiple must conditions
				// For now, we'll simplify to match any value
				if ('any' in value && Array.isArray(value.any)) {
					for (const item of value.any) {
						conditions.push({
							key,
							match: { value: item },
						});
					}
				}
			}
			// Handle exact matches
			else {
				conditions.push({
					key,
					match: { value },
				});
			}
		}

		return conditions.length ? { must: conditions } : undefined;
	}

	/**
	 * Validate vector dimension
	 */
	private validateDimension(vector: number[], _operation: any): void {
		if (vector.length !== this.dimension) {
			throw new VectorDimensionError(
				`${ERROR_MESSAGES.INVALID_DIMENSION}: expected ${this.dimension}, got ${vector.length}`,
				this.dimension,
				vector.length
			);
		}
	}

	// Qdrant only supports integer IDs for points in this deployment
	private validateId(id: number): void {
		if (!Number.isInteger(id) || isNaN(id)) {
			throw new VectorStoreError('Qdrant point IDs must be valid integers', 'id');
		}
	}

	/**
	 * Determines if an error is retryable based on error type and characteristics
	 */
	private isRetryableError(error: any): boolean {
		// Handle TypeError: fetch failed (common undici network error)
		if (error instanceof TypeError && error.message.includes('fetch failed')) {
			return true;
		}

		// Handle network-related errors
		if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
			return true;
		}

		// Handle HTTP status codes if available
		const status = error.status || error.response?.status;
		if (status) {
			// Non-retryable client errors
			if (status === 400 || status === 401 || status === 403 || status === 404) {
				return false;
			}
			// Retryable server errors and rate limits
			if (status >= 429 || status >= 500) {
				return true;
			}
		}

		// Handle VectorStoreConnectionError types
		if (error.message && typeof error.message === 'string') {
			if (error.message.includes('authentication') || error.message.includes('unauthorized')) {
				return false;
			}
			if (error.message.includes('timeout') || error.message.includes('connection')) {
				return true;
			}
		}

		// Default to retryable for unknown network errors
		return !status || status >= 500;
	}

	/**
	 * Calculates retry delay with exponential backoff and jitter
	 */
	private calculateRetryDelay(attempt: number): number {
		const baseDelay = 1000; // Base delay of 1 second

		// Exponential backoff: 2^attempt * baseDelay
		const exponentialDelay = Math.pow(2, attempt - 1) * baseDelay;

		// Add jitter (random factor between 0.5 and 1.5)
		const jitter = 0.5 + Math.random();
		const finalDelay = Math.min(exponentialDelay * jitter, 30000); // Cap at 30 seconds

		return Math.round(finalDelay);
	}

	// VectorStore implementation

	async insert(vectors: number[][], ids: number[], payloads: Record<string, any>[]): Promise<void> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'insert');
		}

		// Validate inputs
		if (vectors.length !== ids.length || vectors.length !== payloads.length) {
			throw new VectorStoreError('Vectors, IDs, and payloads must have the same length', 'insert');
		}

		// Validate dimensions and IDs
		for (let i = 0; i < vectors.length; i++) {
			const vector = vectors[i];
			const id = ids[i];

			if (!vector) {
				throw new VectorStoreError(`Vector missing at index ${i}`, 'insert');
			}
			if (id === undefined || id === null) {
				throw new VectorStoreError(`ID missing at index ${i}`, 'insert');
			}

			this.validateDimension(vector, 'insert');
			this.validateId(id);
		}

		this.logger.debug(`${LOG_PREFIXES.INDEX} Inserting ${vectors.length} vectors`);

		try {
			const points = vectors.map((vector, idx) => {
				const payload = payloads[idx];
				const id = ids[idx];

				if (!payload) throw new VectorStoreError(`Payload missing at index ${idx}`, 'insert');
				if (!vector) throw new VectorStoreError(`Vector missing at index ${idx}`, 'insert');
				if (id === undefined || id === null)
					throw new VectorStoreError(`ID missing at index ${idx}`, 'insert');

				return {
					id: id, // Always use integer IDs
					vector,
					payload,
				};
			});

			await this.client.upsert(this.collectionName, { points });

			this.logger.debug(`${LOG_PREFIXES.INDEX} Successfully inserted ${vectors.length} vectors`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.INDEX} Insert failed`, { error });
			throw new VectorStoreError('Failed to insert vectors', 'insert', error as Error);
		}
	}

	async search(
		query: number[],
		limit: number = DEFAULTS.SEARCH_LIMIT,
		filters?: SearchFilters
	): Promise<VectorStoreResult[]> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'search');
		}

		this.validateDimension(query, 'search');

		this.logger.debug(`${LOG_PREFIXES.SEARCH} Searching with limit ${limit}`, {
			hasFilters: !!filters,
		});

		try {
			const queryFilter = this.createFilter(filters);

			const searchParams: any = {
				vector: query,
				limit,
				with_vector: true,
				with_payload: true,
			};

			if (queryFilter) {
				searchParams.filter = queryFilter;
			}

			const searchResponse = await this.client.search(this.collectionName, searchParams);
			const results = (searchResponse as any).result || searchResponse;

			const formattedResults = results.map((hit: any) => ({
				id: hit.id,
				score: hit.score,
				payload: hit.payload,
			}));

			this.logger.debug(`${LOG_PREFIXES.SEARCH} Found ${formattedResults.length} results`);

			return formattedResults;
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.SEARCH} Search failed`, { error });
			throw new VectorStoreError(ERROR_MESSAGES.SEARCH_FAILED, 'search', error as Error);
		}
	}

	async get(vectorId: number): Promise<VectorStoreResult | null> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'get');
		}

		this.validateId(vectorId);
		this.logger.debug(`${LOG_PREFIXES.BACKEND} Getting vector ${vectorId}`);

		try {
			const response = await this.client.retrieve(this.collectionName, {
				ids: [vectorId],
				with_vector: true,
				with_payload: true,
			});

			const results = (response as any).result || response;

			if (!results.length) {
				return null;
			}

			const firstResult = results[0];
			if (!firstResult) {
				return null;
			}

			return {
				id: vectorId, // Qdrant uses integer IDs
				vector: (firstResult.vector as number[]) || [],
				payload: firstResult.payload || {},
				score: 1.0,
			};
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.BACKEND} Get failed`, { error });
			throw new VectorStoreError('Failed to retrieve vector', 'get', error as Error);
		}
	}

	async update(vectorId: number, vector: number[], payload: Record<string, any>): Promise<void> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'update');
		}

		this.validateDimension(vector, 'update');
		this.validateId(vectorId);
		this.logger.debug(`${LOG_PREFIXES.BACKEND} Updating vector ${vectorId}`);

		try {
			const point = {
				id: vectorId,
				vector: vector,
				payload,
			};

			await this.client.upsert(this.collectionName, {
				points: [point],
			});

			this.logger.debug(`${LOG_PREFIXES.BACKEND} Successfully updated vector ${vectorId}`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.BACKEND} Update failed`, { error });
			throw new VectorStoreError('Failed to update vector', 'update', error as Error);
		}
	}

	async delete(vectorId: number): Promise<void> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'delete');
		}

		this.validateId(vectorId);
		this.logger.debug(`${LOG_PREFIXES.BACKEND} Deleting vector ${vectorId}`);

		try {
			await this.client.delete(this.collectionName, {
				points: [vectorId],
			});

			this.logger.debug(`${LOG_PREFIXES.BACKEND} Successfully deleted vector ${vectorId}`);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.BACKEND} Delete failed`, { error });
			throw new VectorStoreError('Failed to delete vector', 'delete', error as Error);
		}
	}

	async deleteCollection(): Promise<void> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'deleteCollection');
		}

		this.logger.warn(`${LOG_PREFIXES.BACKEND} Deleting collection ${this.collectionName}`);

		try {
			await this.client.deleteCollection(this.collectionName);
			this.logger.info(
				`${LOG_PREFIXES.BACKEND} Successfully deleted collection ${this.collectionName}`
			);
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.BACKEND} Delete collection failed`, { error });
			throw new VectorStoreError('Failed to delete collection', 'deleteCollection', error as Error);
		}
	}

	async list(
		filters?: SearchFilters,
		limit: number = 10000
	): Promise<[VectorStoreResult[], number]> {
		if (!this.connected) {
			throw new VectorStoreError(ERROR_MESSAGES.NOT_CONNECTED, 'list');
		}

		this.logger.debug(`${LOG_PREFIXES.BACKEND} Listing vectors`, {
			hasFilters: !!filters,
			limit,
		});

		try {
			const queryFilter = this.createFilter(filters);

			const scrollRequest: any = {
				limit,
				with_payload: true,
				with_vector: true,
			};

			if (queryFilter) {
				scrollRequest.filter = queryFilter;
			}

			const response = await this.client.scroll(this.collectionName, scrollRequest);

			const results = ((response as any).result?.points || response.points || []).map(
				(point: any) => ({
					id: point.id,
					score: 1.0, // Default score for exact match
					payload: point.payload,
				})
			);

			// Get total count
			const countRequest: any = {};
			if (queryFilter) {
				countRequest.filter = queryFilter;
			}

			const countResponse = await this.client.count(this.collectionName, countRequest);

			this.logger.info(`${LOG_PREFIXES.BACKEND} Listed ${results.length} vectors`);

			return [results, countResponse.count];
		} catch (error) {
			this.logger.error(`${LOG_PREFIXES.BACKEND} List failed`, { error });
			throw new VectorStoreError('Failed to list vectors', 'list', error as Error);
		}
	}

	async connect(): Promise<void> {
		if (this.connected) {
			this.logger.debug(`${LOG_PREFIXES.QDRANT} Already connected`);
			return;
		}

		let attempts = 0;
		const MAX_ATTEMPTS = 3;
		let lastError: any;

		while (attempts < MAX_ATTEMPTS) {
			attempts++;
			try {
				this.logger.info(`${LOG_PREFIXES.QDRANT} Connecting to Qdrant (attempt ${attempts}/${MAX_ATTEMPTS})`);

				// Check if collection exists
				const collections = await this.client.getCollections();
				const exists = collections.collections.some(c => c.name === this.collectionName);

				if (!exists) {
					// Create collection
					this.logger.info(`${LOG_PREFIXES.QDRANT} Creating collection ${this.collectionName}`);

					const distanceMap = {
						Cosine: 'Cosine',
						Euclidean: 'Euclid',
						Dot: 'Dot',
						Manhattan: 'Manhattan',
					} as const;

					const distance = this.config.distance || DEFAULTS.QDRANT_DISTANCE;
					const qdrantDistance = distanceMap[distance as keyof typeof distanceMap] || 'Cosine';

					await this.client.createCollection(this.collectionName, {
						vectors: {
							size: this.dimension,
							distance: qdrantDistance,
						},
					});
				} else {
					// Verify dimension matches
					const collectionInfo = await this.client.getCollection(this.collectionName);
					const vectorConfig = collectionInfo?.config?.params?.vectors;

					if (vectorConfig && 'size' in vectorConfig && vectorConfig.size !== this.dimension) {
						throw new VectorStoreConnectionError(
							`Collection ${this.collectionName} exists with different dimension. ` +
								`Expected: ${this.dimension}, got: ${vectorConfig.size}`,
							'qdrant'
						);
					}
				}

				this.connected = true;
				this.logger.info(`${LOG_PREFIXES.QDRANT} Successfully connected`);
				return;

			} catch (error) {
				lastError = error;
				this.logger.error(`${LOG_PREFIXES.QDRANT} Connection attempt ${attempts} failed`, error);

				// If it's a VectorStoreConnectionError (like dimension mismatch), don't retry
				if (error instanceof VectorStoreConnectionError) {
					throw error;
				}

				// Check if we should retry this error
				if (attempts >= MAX_ATTEMPTS || !this.isRetryableError(error)) {
					if (!this.isRetryableError(error)) {
						this.logger.error(`${LOG_PREFIXES.QDRANT} Non-retryable error encountered`);
					} else {
						this.logger.error(`${LOG_PREFIXES.QDRANT} Failed to connect after ${MAX_ATTEMPTS} attempts`);
					}
					break;
				}

				// Calculate delay and retry
				const delay = this.calculateRetryDelay(attempts);
				this.logger.info(`${LOG_PREFIXES.QDRANT} Retrying in ${delay}ms...`);
				await new Promise(resolve => setTimeout(resolve, delay));
			}
		}

		// All retry attempts failed
		throw new VectorStoreConnectionError(
			ERROR_MESSAGES.CONNECTION_FAILED,
			'qdrant',
			lastError as Error
		);
	}

	async disconnect(): Promise<void> {
		if (!this.connected) {
			this.logger.debug(`${LOG_PREFIXES.QDRANT} Already disconnected`);
			return;
		}

		this.logger.info(`${LOG_PREFIXES.QDRANT} Disconnecting from Qdrant`);

		// Qdrant client doesn't have explicit disconnect
		// Just mark as disconnected
		this.connected = false;

		this.logger.info(`${LOG_PREFIXES.QDRANT} Successfully disconnected`);
	}

	isConnected(): boolean {
		return this.connected;
	}

	getBackendType(): string {
		return 'qdrant';
	}

	getDimension(): number {
		return this.dimension;
	}

	getCollectionName(): string {
		return this.collectionName;
	}
}
