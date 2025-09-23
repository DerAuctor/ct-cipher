/**
 * Retry utilities for MCP operations.
 * Provides exponential backoff retry mechanism for failed operations.
 */

import { logger } from '../logger/index.js';
import {
	DEFAULT_RETRY_ATTEMPTS,
	BASE_RETRY_DELAY_MS,
	MAX_RETRY_DELAY_MS
} from './constants.js';

/**
 * Configuration for retry operations.
 */
export interface RetryConfig {
	/** Maximum number of retry attempts */
	maxAttempts?: number;
	/** Base delay for exponential backoff in milliseconds */
	baseDelayMs?: number;
	/** Maximum delay between attempts in milliseconds */
	maxDelayMs?: number;
	/** Function to determine if an error should trigger a retry */
	shouldRetry?: (error: Error, attempt: number) => boolean;
}

/**
 * Default retry configuration.
 */
const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
	maxAttempts: DEFAULT_RETRY_ATTEMPTS,
	baseDelayMs: BASE_RETRY_DELAY_MS,
	maxDelayMs: MAX_RETRY_DELAY_MS,
	shouldRetry: (error: Error) => {
		// Retry on connection, timeout, and network errors
		const retryableErrors = [
			'timeout',
			'connection',
			'network',
			'ECONNRESET',
			'ECONNREFUSED',
			'ETIMEDOUT',
		];

		return retryableErrors.some(errorType =>
			error.message.toLowerCase().includes(errorType.toLowerCase()) ||
			error.name.toLowerCase().includes(errorType.toLowerCase())
		);
	},
};

/**
 * Sleep utility function.
 */
function sleep(ms: number): Promise<void> {
	return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay.
 */
function calculateDelay(attempt: number, baseDelayMs: number, maxDelayMs: number): number {
	const exponentialDelay = baseDelayMs * Math.pow(2, attempt - 1);
	const jitter = Math.random() * 0.1 * exponentialDelay; // Add 10% jitter
	return Math.min(exponentialDelay + jitter, maxDelayMs);
}

/**
 * Retry a function with exponential backoff.
 */
export async function withRetry<T>(
	operation: () => Promise<T>,
	config: RetryConfig = {}
): Promise<T> {
	const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
	let lastError: Error | undefined;

	for (let attempt = 1; attempt <= finalConfig.maxAttempts; attempt++) {
		try {
			return await operation();
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error));

			// Check if we should retry this error
			if (!finalConfig.shouldRetry(lastError, attempt)) {
				logger.debug('MCP Retry: Error not retryable, failing immediately', {
					error: lastError.message,
					attempt,
				});
				throw lastError;
			}

			// If this was the last attempt, don't delay and throw
			if (attempt === finalConfig.maxAttempts) {
				logger.warn('MCP Retry: All retry attempts exhausted', {
					maxAttempts: finalConfig.maxAttempts,
					finalError: lastError.message,
				});
				throw lastError;
			}

			// Calculate delay and wait
			const delayMs = calculateDelay(attempt, finalConfig.baseDelayMs, finalConfig.maxDelayMs);

			logger.debug('MCP Retry: Operation failed, retrying after delay', {
				attempt,
				maxAttempts: finalConfig.maxAttempts,
				delayMs,
				error: lastError.message,
			});

			await sleep(delayMs);
		}
	}

	// This should never be reached, but included for type safety
	throw lastError || new Error('Retry operation failed');
}

/**
 * Retry configuration specifically tuned for MCP operations.
 */
export const MCP_RETRY_CONFIG: RetryConfig = {
	maxAttempts: 3,
	baseDelayMs: 2000, // Start with 2 seconds
	maxDelayMs: 15000, // Cap at 15 seconds
	shouldRetry: (error: Error, attempt: number) => {
		// More specific retry logic for MCP operations
		const errorMessage = error.message.toLowerCase();

		// Don't retry validation or configuration errors
		if (errorMessage.includes('validation') ||
			errorMessage.includes('invalid') ||
			errorMessage.includes('unauthorized') ||
			errorMessage.includes('forbidden')) {
			return false;
		}

		// Retry connection, timeout, and server errors
		return errorMessage.includes('timeout') ||
			   errorMessage.includes('connection') ||
			   errorMessage.includes('network') ||
			   errorMessage.includes('server error') ||
			   errorMessage.includes('econnreset') ||
			   errorMessage.includes('econnrefused') ||
			   errorMessage.includes('operation failed');
	},
};