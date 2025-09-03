/**
 * Codestral Embedding Backend
 *
 * Implementation of the Embedder interface for Mistral's Codestral embedding services.
 * Supports the codestral-embed model with 3072 dimensions.
 *
 * @module embedding/backend/codestral
 */

import { Mistral } from '@mistralai/mistralai';
import { logger } from '../../../logger/index.js';
import {
	Embedder,
	EmbeddingConnectionError,
	EmbeddingRateLimitError,
	EmbeddingQuotaError,
	EmbeddingValidationError,
	EmbeddingError,
	EmbeddingDimensionError,
	ClassifiedEmbeddingError,
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
	private mistral: Mistral;
	private readonly config: CodestralEmbeddingConfig;
	private readonly model: string;
	private readonly dimension: number;

	constructor(config: CodestralEmbeddingConfig) {
		this.config = config;
		this.model = config.model || 'codestral-embed';

		// Validate that API key is provided
		const apiKey = config.apiKey || process.env.MISTRAL_API_KEY || '';
		
		// API Key Configuration Debug Logging
		logger.debug(`${LOG_PREFIXES.CODESTRAL} API Key Configuration`, {
			hasApiKey: !!apiKey,
			apiKeySource: config.apiKey ? 'config' : (process.env.MISTRAL_API_KEY ? 'env' : 'none'),
			apiKeyLength: apiKey ? apiKey.length : 0,
			model: this.model
		});
		
		if (!apiKey || apiKey.trim() === '') {
			throw new EmbeddingError('Codestral API key is required', 'codestral');
		}

		// Initialize Mistral client with official SDK (2025)
		const mistralConfig: {
			apiKey: string;
			baseURL?: string;
			timeout?: number;
			maxRetries?: number;
		} = {
			apiKey: apiKey,
			timeout: config.timeout || 30000, // Default to 30 seconds
			maxRetries: config.maxRetries || 3, // Default to 3 retries
		};

		// Set base URL - default to Mistral's official API endpoint
		const baseUrl = config.baseUrl || 'https://api.mistral.ai';
		if (baseUrl && baseUrl.trim() !== '') {
			mistralConfig.baseURL = baseUrl;
		}

		this.mistral = new Mistral(mistralConfig);

				// Set dimension to 3072 for codestral-embed as required
		this.dimension = config.dimensions || 3072;

		logger.debug(`${LOG_PREFIXES.CODESTRAL} Initialized Codestral embedder`, {
			model: this.model,
			dimension: this.dimension,
			baseUrl: baseUrl,
			timeout: mistralConfig.timeout,
			maxRetries: mistralConfig.maxRetries,
			clientInitialized: !!this.mistral
		});
	}

	async embed(text: string): Promise<number[]> {
		logger.silly(`${LOG_PREFIXES.CODESTRAL} Embedding single text with Codestral`, {
			textLength: text.length,
			model: this.model,
		});

		// Validate input
		this.validateInput(text);

		const startTime = Date.now();

		try {
			// Direct API Call to Mistral (bypassing SDK bug)
			const payload = {
				model: this.model,
				input: text, // API expects 'input' for single text
				output_dimension: this.dimension
			};
			
			// Enhanced Debug Logging for Direct API Request
			logger.debug(`${LOG_PREFIXES.CODESTRAL} Direct API Request Parameters`, {
				model: payload.model,
				textLength: text.length,
				outputDimension: payload.output_dimension,
				requestType: 'single_embedding_direct_api',
				note: 'Using direct API call to bypass SDK output_dimension bug'
			});
			
			const response = await fetch(`${this.config.baseUrl || 'https://api.mistral.ai'}/v1/embeddings`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.config.apiKey || process.env.MISTRAL_API_KEY}`
				},
				body: JSON.stringify(payload)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			const data = await response.json();
			
			// Direct API Response Validation and Debug Logging
			logger.debug(`${LOG_PREFIXES.CODESTRAL} Direct API Response Analysis`, {
				hasData: !!data.data,
				dataLength: data.data ? data.data.length : 0,
				firstEmbedding: data.data && data.data[0] ? {
					hasEmbedding: !!data.data[0].embedding,
					embeddingDimensions: data.data[0].embedding ? data.data[0].embedding.length : 0
				} : null,
				model: data.model || 'unknown',
				usage: data.usage || null
			});
			
			if (
				!data.data ||
				!Array.isArray(data.data) ||
				!data.data[0] ||
				!data.data[0].embedding
			) {
				throw new EmbeddingError('Direct API did not return a valid embedding', 'codestral');
			}
			
			const embedding = data.data[0].embedding;
			this.validateEmbeddingDimension(embedding);
			return embedding;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			logger.error(`${LOG_PREFIXES.CODESTRAL} Failed to create Codestral embedding via direct API`, {
				error: error instanceof Error ? error.message : String(error),
				model: this.model,
				processingTime,
				textLength: text.length,
			});

			throw this.handleApiError(error);
		}
	}

	/**
	 * Enhanced embed method with comprehensive runtime parameter logging
	 * Wrapper for detailed debugging of API calls and responses
	 */
	async embedWithDebugLogging(text: string): Promise<number[]> {
		const isDebugEnabled = process.env.DEBUG_EMBEDDING_PARAMS === 'true';
		const startTime = Date.now();
		
		if (isDebugEnabled) {
			logger.debug(`${LOG_PREFIXES.CODESTRAL} === EMBED DEBUG SESSION START ===`, {
				timestamp: new Date().toISOString(),
				textLength: text.length,
				textPreview: text.substring(0, 200) + (text.length > 200 ? '...' : ''),
				model: this.model,
				configDimensions: this.config.dimensions
			});
		}

		try {
			const result = await this.embed(text);
			
			if (isDebugEnabled) {
				const processingTime = Date.now() - startTime;
				logger.debug(`${LOG_PREFIXES.CODESTRAL} === EMBED DEBUG SESSION SUCCESS ===`, {
					timestamp: new Date().toISOString(),
					processingTime,
					resultDimensions: result.length,
					firstFewValues: result.slice(0, 5),
					lastFewValues: result.slice(-5),
					success: true
				});
			}
			
			return result;
		} catch (error) {
			if (isDebugEnabled) {
				const processingTime = Date.now() - startTime;
				logger.debug(`${LOG_PREFIXES.CODESTRAL} === EMBED DEBUG SESSION FAILURE ===`, {
					timestamp: new Date().toISOString(),
					processingTime,
					error: error instanceof Error ? error.message : String(error),
					errorType: error?.constructor?.name || 'Unknown',
					success: false
				});
			}
			throw error;
		}
	}

	async embedBatch(texts: string[]): Promise<number[][]> {
		logger.debug(`${LOG_PREFIXES.BATCH} Direct API Batch Embedding Request`, {
			count: texts.length,
			model: this.model,
			batchType: 'direct_api_batch',
			totalTextLength: texts.reduce((sum, text) => sum + text.length, 0)
		});

		// Validate batch input
		this.validateBatchInput(texts);

		const startTime = Date.now();

		try {
			// Direct API Call to Mistral (bypassing SDK bug)
			const batchPayload = {
				model: this.model,
				input: texts, // API expects 'input' array for batch
				output_dimension: this.dimension
			};
			
			// Pre-API-Call Batch Parameter Analysis for Debug Verification
			const isDebugEnabled = process.env.DEBUG_EMBEDDING_PARAMS === 'true';
			if (isDebugEnabled) {
				logger.debug(`${LOG_PREFIXES.BATCH} Pre-API-Call Direct Batch Parameter Analysis`, {
					originalBatchPayload: batchPayload,
					requestBody: JSON.stringify(batchPayload, null, 2),
					timestamp: new Date().toISOString(),
					apiEndpoint: 'embeddings',
					method: 'POST',
					inputTexts: texts.map((text, index) => ({
						index,
						length: text.length,
						preview: text.substring(0, 50) + (text.length > 50 ? '...' : '')
					})),
					totalInputCount: texts.length,
					batchSize: texts.length
				});
			}
			
			// Enhanced Debug Logging
			logger.debug(`${LOG_PREFIXES.BATCH} Direct API Batch Parameters`, {
				model: batchPayload.model,
				inputCount: batchPayload.input.length,
				outputDimension: batchPayload.output_dimension,
				avgTextLength: Math.round(texts.reduce((sum, text) => sum + text.length, 0) / texts.length),
				requestType: 'batch_embedding_direct_api',
				note: 'Using direct API call to bypass SDK output_dimension bug'
			});
			
			const response = await fetch(`${this.config.baseUrl || 'https://api.mistral.ai'}/v1/embeddings`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${this.config.apiKey || process.env.MISTRAL_API_KEY}`
				},
				body: JSON.stringify(batchPayload)
			});

			if (!response.ok) {
				const errorText = await response.text();
				throw new Error(`HTTP ${response.status}: ${errorText}`);
			}

			const data = await response.json();
			
			// Post-API-Call Response Analysis
			if (isDebugEnabled) {
				logger.debug(`${LOG_PREFIXES.BATCH} Post-API-Call Direct Response Analysis`, {
					timestamp: new Date().toISOString(),
					hasResponse: !!data,
					responseKeys: data ? Object.keys(data) : [],
					dataPresent: !!data?.data,
					dataType: data?.data ? typeof data.data : 'undefined',
					dataIsArray: Array.isArray(data?.data),
					processingTimeMs: Date.now() - startTime
				});
			}
			
			// Direct API Batch Response Processing
			logger.debug(`${LOG_PREFIXES.BATCH} Direct API Batch Response Analysis`, {
				responseDataLength: data.data ? data.data.length : 0,
				expectedCount: texts.length,
				model: data.model || 'unknown',
				usage: data.usage || null
			});
			
			const embeddings = data.data.map((item: any) => item.embedding);
			embeddings.forEach(this.validateEmbeddingDimension.bind(this));
			return embeddings;
		} catch (error) {
			const processingTime = Date.now() - startTime;
			logger.error(`${LOG_PREFIXES.BATCH} Failed to create batch Codestral embeddings via direct API`, {
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
		logger.debug(`${LOG_PREFIXES.CODESTRAL} Disconnecting Codestral embedder`);
		// MistralAI client doesn't require explicit cleanup
		// This is here for interface compliance and future extensibility
	}

	/**
	 * Enhanced embedBatch method with comprehensive runtime parameter logging
	 * Wrapper for detailed debugging of batch API calls and responses
	 */
	async embedBatchWithDebugLogging(texts: string[]): Promise<number[][]> {
		const isDebugEnabled = process.env.DEBUG_EMBEDDING_PARAMS === 'true';
		const startTime = Date.now();
		
		if (isDebugEnabled) {
			logger.debug(`${LOG_PREFIXES.BATCH} === BATCH EMBED DEBUG SESSION START ===`, {
				timestamp: new Date().toISOString(),
				batchSize: texts.length,
				totalTextLength: texts.reduce((sum, text) => sum + text.length, 0),
				avgTextLength: Math.round(texts.reduce((sum, text) => sum + text.length, 0) / texts.length),
				textPreviews: texts.slice(0, 3).map((text, index) => ({
					index,
					length: text.length,
					preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
				})),
				model: this.model,
				configDimensions: this.config.dimensions
			});
		}

		try {
			const results = await this.embedBatch(texts);
			
			if (isDebugEnabled) {
				const processingTime = Date.now() - startTime;
				logger.debug(`${LOG_PREFIXES.BATCH} === BATCH EMBED DEBUG SESSION SUCCESS ===`, {
					timestamp: new Date().toISOString(),
					processingTime,
					resultCount: results.length,
					resultDimensions: results.length > 0 ? results[0].length : 0,
					firstResultPreview: results.length > 0 ? {
						dimensions: results[0].length,
						firstFewValues: results[0].slice(0, 5),
						lastFewValues: results[0].slice(-5)
					} : null,
					success: true
				});
			}
			
			return results;
		} catch (error) {
			if (isDebugEnabled) {
				const processingTime = Date.now() - startTime;
				logger.debug(`${LOG_PREFIXES.BATCH} === BATCH EMBED DEBUG SESSION FAILURE ===`, {
					timestamp: new Date().toISOString(),
					processingTime,
					error: error instanceof Error ? error.message : String(error),
					errorType: error?.constructor?.name || 'Unknown',
					batchSize: texts.length,
					success: false
				});
			}
			throw error;
		}
	}


	/**
	 * Determine if an error is retryable
	 */
	private shouldRetry(error: unknown, attempt: number): boolean {
		if (attempt >= this.config.maxRetries!) {
			return false;
		}

		// Handle MistralAI API errors
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
	/**
	 * Classify an error as permanent or transient based on error characteristics
	 * @param error - The error to classify
	 * @returns 'permanent' for auth/config errors, 'transient' for parameter/network errors
	 */
	private classifyError(error: any): 'permanent' | 'transient' {
		// Extract status code and message
		const status = error?.status;
		const message = error?.message || String(error);

		// Authentication and authorization errors are permanent
		if (status === HTTP_STATUS.UNAUTHORIZED || status === HTTP_STATUS.FORBIDDEN) {
			return 'permanent';
		}

		// API key or access errors are permanent
		if (message?.includes('API key') || message?.includes('authentication') || message?.includes('authorization') || message?.includes('Unauthorized')) {
			return 'permanent';
		}

		// Parameter validation errors are transient (can be fixed with code changes)
		if (status === HTTP_STATUS.BAD_REQUEST) {
			if (message?.includes('Extra inputs are not permitted') || 
				message?.includes('Field required') ||
				message?.includes('input') ||
				message?.includes('inputs')) {
				return 'transient';
			}
		}

		// Rate limiting is transient
		if (status === HTTP_STATUS.TOO_MANY_REQUESTS) {
			return 'transient';
		}

		// Server errors (5xx) are typically transient
		if (status >= 500) {
			return 'transient';
		}

		// Network errors without status code are typically transient
		if (!status && (error instanceof Error)) {
			return 'transient';
		}

		// Default to permanent for unknown errors to be conservative
		return 'permanent';
	}

	private handleApiError(error: unknown): ClassifiedEmbeddingError {
		if (error && typeof error === 'object' && 'status' in error) {
			const apiError = error as any;
			const status = apiError.status;
			const message = apiError.message || String(error);

			// Enhanced logging for validation errors with detailed parameter information
			if (status === HTTP_STATUS.BAD_REQUEST) {
				logger.error(`${LOG_PREFIXES.CODESTRAL} API Validation Error - Detailed Analysis`, {
					status: status,
					message: message,
					errorType: 'validation_error',
					apiErrorDetails: {
						body: apiError.body,
						headers: apiError.headers,
						response: apiError.response
					},
					isParameterError: message && (
						message.includes('Extra inputs are not permitted') ||
						message.includes('Field required') ||
						message.includes('input') ||
						message.includes('inputs')
					),
					likelyParameterMismatch: message && message.includes('Extra inputs are not permitted')
				});

				if (message && message.includes('Extra inputs are not permitted')) {
					const enhancedMessage = `${message} - Check API parameter format: use "input" not "inputs"`;
					const failureType = this.classifyError(apiError);
					return new ClassifiedEmbeddingError(enhancedMessage, failureType, 'codestral', apiError);
				}
				
				if (message && (message.includes('Field required') || message.includes('input'))) {
					const enhancedMessage = `${message} - Verify required API parameters are present`;
					const failureType = this.classifyError(apiError);
					return new ClassifiedEmbeddingError(enhancedMessage, failureType, 'codestral', apiError);
				}

				const failureType = this.classifyError(apiError);
				return new ClassifiedEmbeddingError(message, failureType, 'codestral', apiError);
			}

			if (status === HTTP_STATUS.UNAUTHORIZED || status === HTTP_STATUS.FORBIDDEN) {
				const failureType = this.classifyError(apiError);
				return new ClassifiedEmbeddingError(
					ERROR_MESSAGES.INVALID_API_KEY('Codestral'),
					failureType,
					'codestral',
					apiError
				);
			}

			if (status === HTTP_STATUS.TOO_MANY_REQUESTS) {
				const failureType = this.classifyError(apiError);
				return new ClassifiedEmbeddingError(
					ERROR_MESSAGES.RATE_LIMIT_EXCEEDED,
					failureType,
						'codestral',
						apiError
					);
				}

			if (status === HTTP_STATUS.PAYMENT_REQUIRED) {
				const failureType = this.classifyError(apiError);
				return new ClassifiedEmbeddingError(ERROR_MESSAGES.QUOTA_EXCEEDED, failureType, 'codestral', apiError);
			}

			if (status >= 500) {
				const failureType = this.classifyError(apiError);
				return new ClassifiedEmbeddingError(
					ERROR_MESSAGES.CONNECTION_FAILED('Codestral'),
					failureType,
					'codestral',
					apiError
				);
			}

			const failureType = this.classifyError(apiError);
			return new ClassifiedEmbeddingError(message, failureType, 'codestral', apiError);
		}

		if (error instanceof Error) {
			const failureType = this.classifyError(error);
			return new ClassifiedEmbeddingError(error.message, failureType, 'codestral', error);
		}

		const failureType = this.classifyError(error);
		return new ClassifiedEmbeddingError(String(error), failureType, 'codestral');
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