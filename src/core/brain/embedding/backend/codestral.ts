/**
 * Codestral Embedding Backend
 *
 * Implementation of the Embedder interface for Mistral's Codestral embedding services.
 * Supports the codestral-embed model with 3072 dimensions.
 *
 * @module embedding/backend/codestral
 */

import OpenAI from 'openai';
import { logger } from '../../../logger/index.js';
import {
	Embedder,
	EmbeddingConnectionError,
	EmbeddingRateLimitError,
	EmbeddingQuotaError,
	EmbeddingValidationError,
	EmbeddingError,
	EmbeddingDimensionError,
} from './types.js';
import {
	MODEL_DIMENSIONS,
	VALIDATION_LIMITS,
	ERROR_MESSAGES,
	LOG_PREFIXES,
	RETRY_CONFIG,
	HTTP_STATUS,
} from '../constants.js';

/**
 * Codestral-specific embedding configuration
 */
export interface CodestralEmbeddingConfig {
	type: 'codestral';
	/** API key for the Codestral provider */
	apiKey?: string;
	/** Model name to use for embeddings */
	model?: 'codestral-embed';
	/** Base URL for the Codestral API */
	baseUrl?: string;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Maximum number of retry attempts */
	maxRetries?: number;
	/** Custom dimensions for the model (default: 3072) */
	dimensions?: 3072;
}

/**
 * Codestral Embedder Implementation
 *
 * Provides embedding functionality using Mistral's Codestral embedding API.
 * Implements comprehensive error handling, retry logic, and batch processing.
 */
export class CodestralEmbedder implements Embedder {
	private openai: OpenAI;
	private readonly config: CodestralEmbeddingConfig;
	private readonly model: string;
	private readonly dimension: number;

	constructor(config: CodestralEmbeddingConfig) {
		this.config = config;
		this.model = config.model || 'codestral-embed';

		// Validate that API key is provided
		const apiKey = config.apiKey || process.env.MISTRAL_API_KEY || '';
		if (!apiKey || apiKey.trim() === '') {
			throw new EmbeddingError('Codestral API key is required', 'codestral');
		}

		// Initialize OpenAI client with proper handling of undefined values
		// Only pass defined values to avoid OpenAI SDK initialization issues
		const openaiConfig: {
			apiKey: string;
			baseURL?: string;
			timeout: number;
			maxRetries: number;
		} = {
			apiKey: apiKey,
			timeout: config.timeout || 30000, // Default to 30 seconds if not specified
			maxRetries: config.maxRetries || 3, // Default to 3 retries if not specified
		};

		// Set base URL - default to Mistral's API endpoint
		const baseUrl = config.baseUrl || 'https://api.mistral.ai/v1';
		if (baseUrl && baseUrl.trim() !== '') {
			openaiConfig.baseURL = baseUrl;
		}

		this.openai = new OpenAI(openaiConfig);

		// Set dimension to 3072 for codestral-embed
		this.dimension = config.dimensions || 3072;

		logger.debug(`${LOG_PREFIXES.OPENAI} Initialized Codestral embedder`, {
			model: this.model,
			dimension: this.dimension,
			baseUrl: baseUrl,
		});
	}

	async embed(text: string): Promise<number[]> {
		logger.silly(`${LOG_PREFIXES.OPENAI} Embedding single text with Codestral`, {
			textLength: text.length,
			model: this.model,
		});

		// Validate input
		this.validateInput(text);

		const startTime = Date.now();

		try {
			const params: { model: string; input: string; dimensions?: number } = {
				model: this.model,
				input: text,
			};
			if (this.config.dimensions !== undefined) {
				params.dimensions = this.config.dimensions;
			}
			const response = await this.createEmbeddingWithRetry(params);
			if (
				!response.data ||
				!Array.isArray(response.data) ||
				!response.data[0] ||
				!response.data[0].embedding
			) {
				throw new EmbeddingError('Codestral API did not return a valid embedding', 'codestral');
			}
			const embedding = response.data[0].embedding;
			this.validateEmbeddingDimension(embedding);
			return embedding;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			logger.error(`${LOG_PREFIXES.OPENAI} Failed to create Codestral embedding`, {
				error: error instanceof Error ? error.message : String(error),
				model: this.model,
				processingTime,
				textLength: text.length,
			});

			throw this.handleApiError(error);
		}
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		logger.debug(`${LOG_PREFIXES.BATCH} Embedding batch of texts with Codestral`, {
			count: texts.length,
			model: this.model,
		});

		// Validate batch input
		this.validateBatchInput(texts);

		const startTime = Date.now();

		try {
			const batchParams: { model: string; input: string[]; dimensions?: number } = {
				model: this.model,
				input: texts,
			};
			if (this.config.dimensions !== undefined) {
				batchParams.dimensions = this.config.dimensions;
			}
			const response = await this.createEmbeddingWithRetry(batchParams);
			const embeddings = response.data.map(item => item.embedding);
			embeddings.forEach(this.validateEmbeddingDimension.bind(this));
			return embeddings;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			logger.error(`${LOG_PREFIXES.BATCH} Failed to create batch Codestral embeddings`, {
				error: error instanceof Error ? error.message : String(error),
				model: this.model,
				processingTime,
				count: texts.length,
			});

			throw this.handleApiError(error);
		}
	}

	getDimension(): number {
		return this.dimension;
	}

	getConfig(): CodestralEmbeddingConfig {
		return { ...this.config };
	}

	async isHealthy(): Promise<boolean> {
		try {
			logger.silly(`${LOG_PREFIXES.HEALTH} Checking Codestral embedder health`);

			// Try a simple embedding request with minimal text
			await this.embed('test');

			logger.debug(`${LOG_PREFIXES.HEALTH} Codestral embedder is healthy`);
			return true;
		} catch (error) {
			logger.warn(`${LOG_PREFIXES.HEALTH} Codestral embedder health check failed`, {
				error: error instanceof Error ? error.message : String(error),
			});
			return false;
		}
	}

	async disconnect(): Promise<void> {
		logger.debug(`${LOG_PREFIXES.OPENAI} Disconnecting Codestral embedder`);
		// OpenAI client doesn't require explicit cleanup
		// This is here for interface compliance and future extensibility
	}

	/**
	 * Create embedding with retry logic
	 */
	private async createEmbeddingWithRetry(params: {
		model: string;
		input: string | string[];
		dimensions?: number;
	}): Promise<OpenAI.Embeddings.CreateEmbeddingResponse> {
		let lastError: Error | undefined;
		let delay: number = RETRY_CONFIG.INITIAL_DELAY;

		for (let attempt = 0; attempt <= this.config.maxRetries!; attempt++) {
			try {
				if (attempt > 0) {
					logger.debug(`${LOG_PREFIXES.OPENAI} Retrying Codestral embedding request`, {
						attempt,
						delay,
						maxRetries: this.config.maxRetries,
					});

					// Wait before retry
					await new Promise(resolve => setTimeout(resolve, delay));

					// Calculate next delay with exponential backoff and jitter
					delay = Math.min(delay * RETRY_CONFIG.BACKOFF_MULTIPLIER, RETRY_CONFIG.MAX_DELAY);

					// Add jitter to avoid thundering herd
					const jitter = delay * RETRY_CONFIG.JITTER_FACTOR * Math.random();
					delay = Math.floor(delay + jitter);
				}

				const response = await this.openai.embeddings.create(params);

				if (attempt > 0) {
					logger.info(`${LOG_PREFIXES.OPENAI} Codestral embedding request succeeded after retry`, {
						attempt,
						model: params.model,
					});
				}

				return response;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				// Check if we should retry based on error type
				if (!this.shouldRetry(error, attempt)) {
					break;
				}

				logger.warn(`${LOG_PREFIXES.OPENAI} Codestral embedding request failed, will retry`, {
					attempt: attempt + 1,
					maxRetries: this.config.maxRetries,
					error: lastError.message,
					nextDelay: delay,
				});
			}
		}

		// All retries exhausted
		throw lastError || new EmbeddingError('Unknown error during Codestral embedding request', 'codestral');
	}

	/**
	 * Determine if an error is retryable
	 */
	private shouldRetry(error: unknown, attempt: number): boolean {
		if (attempt >= this.config.maxRetries!) {
			return false;
		}

		// Handle OpenAI API errors
		if (error && typeof error === 'object' && 'status' in error) {
			const status = (error as any).status;

			// Retry on server errors and rate limits
			return [
				HTTP_STATUS.TOO_MANY_REQUESTS,
				HTTP_STATUS.INTERNAL_SERVER_ERROR,
				HTTP_STATUS.SERVICE_UNAVAILABLE,
			].includes(status);
		}

		// Retry on network errors
		if (error instanceof Error) {
			const message = error.message.toLowerCase();
			return (
				message.includes('network') ||
				message.includes('timeout') ||
				message.includes('connection') ||
				message.includes('econnreset') ||
				message.includes('enotfound')
			);
		}

		return false;
	}

	/**
	 * Handle and categorize API errors
	 */
	private handleApiError(error: unknown): EmbeddingError {
		if (error && typeof error === 'object' && 'status' in error) {
			const apiError = error as any;
			const status = apiError.status;
			const message = apiError.message || String(error);

			switch (status) {
				case HTTP_STATUS.UNAUTHORIZED:
					return new EmbeddingConnectionError(
						ERROR_MESSAGES.INVALID_API_KEY('Codestral'),
						'codestral',
						apiError
					);

				case HTTP_STATUS.TOO_MANY_REQUESTS: {
					const retryAfter = apiError.headers?.['retry-after'];
					return new EmbeddingRateLimitError(
						ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
						retryAfter ? parseInt(retryAfter, 10) : undefined,
						'codestral',
						apiError
					);
				}

				case HTTP_STATUS.FORBIDDEN:
					return new EmbeddingQuotaError(ERROR_MESSAGES.QUOTA_EXCEEDED, 'codestral', apiError);

				case HTTP_STATUS.BAD_REQUEST:
					return new EmbeddingValidationError(message, 'codestral', apiError);

				default:
					return new EmbeddingConnectionError(
						ERROR_MESSAGES.CONNECTION_FAILED('Codestral'),
						'codestral',
						apiError
					);
			}
		}

		// Handle network and other errors
		if (error instanceof Error) {
			return new EmbeddingConnectionError(error.message, 'codestral', error);
		}

		return new EmbeddingError(String(error), 'codestral');
	}

	/**
	 * Validate single text input
	 */
	private validateInput(text: string): void {
		if (!text || text.length < VALIDATION_LIMITS.MIN_TEXT_LENGTH) {
			throw new EmbeddingValidationError(ERROR_MESSAGES.EMPTY_TEXT, 'codestral');
		}

		if (text.length > VALIDATION_LIMITS.MAX_TEXT_LENGTH) {
			throw new EmbeddingValidationError(
				ERROR_MESSAGES.TEXT_TOO_LONG(text.length, VALIDATION_LIMITS.MAX_TEXT_LENGTH),
				'codestral'
			);
		}
	}

	/**
	 * Validate batch input
	 */
	private validateBatchInput(texts: string[]): void {
		if (!Array.isArray(texts) || texts.length === 0) {
			throw new EmbeddingValidationError('Batch input must be a non-empty array', 'codestral');
		}

		if (texts.length > VALIDATION_LIMITS.MAX_BATCH_SIZE) {
			throw new EmbeddingValidationError(
				ERROR_MESSAGES.BATCH_TOO_LARGE(texts.length, VALIDATION_LIMITS.MAX_BATCH_SIZE),
				'codestral'
			);
		}

		// Validate each text in the batch
		texts.forEach((text, index) => {
			try {
				this.validateInput(text);
			} catch (error) {
				if (error instanceof EmbeddingValidationError) {
					throw new EmbeddingValidationError(
						`Batch item ${index}: ${error.message}`,
						'codestral',
						error
					);
				}
				throw error;
			}
		});
	}

	/**
	 * Validate embedding dimension
	 */
	private validateEmbeddingDimension(embedding: number[]): void {
		if (embedding.length !== this.dimension) {
			throw new EmbeddingDimensionError(
				ERROR_MESSAGES.DIMENSION_MISMATCH(this.dimension, embedding.length),
				this.dimension,
				embedding.length,
				'codestral'
			);
		}
	}
}