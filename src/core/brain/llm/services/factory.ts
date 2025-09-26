import { MCPManager } from '../../../mcp/manager.js';
import { UnifiedToolManager } from '../../tools/unified-tool-manager.js';
import { ContextManager } from '../messages/manager.js';
import { LLMConfig } from '../config.js';
import { ILLMService } from './types.js';
import { env } from '../../../env.js';
import { logger } from '../../../logger/index.js';
import { OpenAIService } from './openai.js';
import { AnthropicService } from './anthropic.js';
import { OpenRouterService } from './openrouter.js';
import { OllamaService } from './ollama.js';
import { QwenService, QwenOptions } from './qwen.js';
import { AwsService } from './aws.js';
import { AzureService } from './azure.js';
import { GeminiService } from './gemini.js';
import { GeminiDirectService } from './gemini-direct.js';
import { LMStudioService } from './lmstudio.js';
import { CodestralService, CodestralOptions } from './codestral.js';
import { MistralService, MistralOptions } from './mistral.js';

function extractApiKey(config: LLMConfig): string {
	const provider = config.provider.toLowerCase();

	// These providers don't require traditional API keys
	if (
		provider === 'ollama' ||
		provider === 'lmstudio' ||
		provider === 'aws' ||
		provider === 'azure' ||
		provider === 'gemini-direct'
	) {
		return 'not-required';
	}

	// Get API key from config (already expanded)
	let apiKey = config.apiKey || '';

	if (!apiKey) {
		const errorMsg = `Error: API key for ${provider} not found`;
		logger.error(errorMsg);
		logger.error(`Please set your ${provider} API key in the config file or .env file`);
		throw new Error(errorMsg);
	}
	logger.debug('Verified API key');
	return apiKey;
}

function getOpenAICompatibleBaseURL(llmConfig: LLMConfig): string {
	if (llmConfig.baseURL) {
		let baseUrl = llmConfig.baseURL.replace(/\/$/, '');

		// For Ollama, ensure /v1 suffix for OpenAI-compatible endpoint
		const provider = llmConfig.provider.toLowerCase();
		if (provider === 'ollama' && !baseUrl.endsWith('/v1') && !baseUrl.endsWith('/api')) {
			baseUrl = baseUrl + '/v1';
		}

		return baseUrl;
	}

	// Provider-specific defaults - no environment fallbacks
	const provider = llmConfig.provider.toLowerCase();

	if (provider === 'openrouter') {
		return 'https://openrouter.ai/api/v1';
	}

	if (provider === 'ollama') {
		// Require explicit baseURL configuration - no environment fallback
		throw new Error(`Ollama requires explicit baseURL configuration in config file. No baseURL provided for provider: ${provider}`);
	}

	if (provider === 'lmstudio') {
		// Require explicit baseURL configuration - no environment fallback
		throw new Error(`LM Studio requires explicit baseURL configuration in config file. No baseURL provided for provider: ${provider}`);
	}

	if (provider === 'openai') {
		// OpenAI requires explicit baseURL if custom endpoint needed - no environment fallback
		throw new Error(`OpenAI custom baseURL must be explicitly configured in config file. No baseURL provided for provider: ${provider}`);
	}

	return '';
}

async function _createLLMService(
	config: LLMConfig,
	mcpManager: MCPManager,
	contextManager: ContextManager,
	unifiedToolManager?: UnifiedToolManager
): ILLMService {
	// Extract and validate API key
	const apiKey = extractApiKey(config);

	switch (config.provider.toLowerCase()) {
		case 'openai': {
			const baseURL = getOpenAICompatibleBaseURL(config);
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({ apiKey, ...(baseURL ? { baseURL } : {}) });
			return new OpenAIService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				unifiedToolManager
			);
		}
		case 'openrouter': {
			const baseURL = getOpenAICompatibleBaseURL(config);
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({
				apiKey,
				baseURL,
				defaultHeaders: {
					'HTTP-Referer': 'https://github.com/byterover/cipher',
					'X-Title': 'Core_Team-cipher Memory Agent',
				},
			});
			return new OpenRouterService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				unifiedToolManager
			);
		}
		case 'lmstudio': {
			const baseURL = getOpenAICompatibleBaseURL(config);
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({
				apiKey: 'lm-studio', // LM Studio uses "lm-studio" as the API key
				baseURL,
			});
			return new LMStudioService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				unifiedToolManager
			);
		}
		case 'anthropic': {
			// Use require for Anthropic SDK for compatibility
			// @ts-ignore

			const { default: AnthropicClass } = await import('@anthropic-ai/sdk');
			const anthropic = new AnthropicClass({ apiKey });
			return new AnthropicService(
				anthropic,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				unifiedToolManager
			);
		}
		case 'ollama': {
			const baseURL = getOpenAICompatibleBaseURL(config);
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			// Ollama uses OpenAI-compatible API but runs locally
			const openai = new OpenAIClass({
				apiKey: 'not-required', // Ollama doesn't require an API key
				baseURL,
			});
			return new OllamaService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				unifiedToolManager
			);
		}
		case 'aws': {
			return new AwsService(
				config.model,
				mcpManager,
				contextManager,
				unifiedToolManager,
				config.maxIterations,
				config.aws
			);
		}
		case 'azure': {
			return new AzureService(
				config.model,
				mcpManager,
				contextManager,
				unifiedToolManager,
				config.maxIterations,
				config.azure
			);
		}
		case 'qwen': {
			// QwenService: OpenAI-compatible endpoint for Alibaba Cloud Qwen
			// Accepts Qwen-specific options via config.qwenOptions
			// Requires explicit baseURL configuration
			if (!config.baseURL) {
				throw new Error('BaseURL is required for Qwen provider. Please specify baseURL in configuration.');
			}
			const baseURL = config.baseURL;
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({ apiKey, baseURL });
			const qwenOptions: QwenOptions = {
				...(config.qwenOptions?.enableThinking !== undefined && {
					enableThinking: config.qwenOptions.enableThinking,
				}),
				...(config.qwenOptions?.thinkingBudget !== undefined && {
					thinkingBudget: config.qwenOptions.thinkingBudget,
				}),
				...(config.qwenOptions?.temperature !== undefined && {
					temperature: config.qwenOptions.temperature,
				}),
				...(config.qwenOptions?.top_p !== undefined && { top_p: config.qwenOptions.top_p }),
			};
			return new QwenService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				qwenOptions,
				unifiedToolManager
			);
		}
		case 'gemini': {
			logger.debug('Creating Gemini service', { model: config.model, hasApiKey: !!apiKey });
			try {
				return new GeminiService(
					apiKey,
					config.model,
					mcpManager,
					contextManager,
					config.maxIterations,
					unifiedToolManager
				);
			} catch (error) {
				logger.error('Failed to create Gemini service', {
					error: error instanceof Error ? error.message : String(error),
					model: config.model,
				});
				throw error;
			}
		}
		case 'gemini-direct': {
			logger.debug('Creating Gemini Direct service (OAuth2, no API key required)', { model: config.model });
			try {
				return new GeminiDirectService(
					config.model,
					mcpManager,
					contextManager,
					config.maxIterations,
					unifiedToolManager
				);
			} catch (error) {
				logger.error('Failed to create Gemini Direct service', {
					error: error instanceof Error ? error.message : String(error),
					model: config.model,
				});
				throw error;
			}
		}
		case 'mistral': {
			// MistralService: Direct Mistral API for chat models
			// Requires explicit baseURL configuration
			if (!config.baseURL) {
				throw new Error('BaseURL is required for Mistral provider. Please specify baseURL in configuration.');
			}
			const baseURL = config.baseURL;
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({ apiKey, baseURL });
			const mistralOptions: MistralOptions = {
				...(config.temperature !== undefined && {
					temperature: config.temperature,
				}),
				...(config.top_p !== undefined && { top_p: config.top_p }),
			};
			return new MistralService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				mistralOptions,
				unifiedToolManager
			);
		}
		case 'codestral': {
			// CodestralService: OpenAI-compatible endpoint for Mistral's Codestral
			// Requires explicit baseURL configuration
			if (!config.baseURL) {
				throw new Error('BaseURL is required for Codestral provider. Please specify baseURL in configuration.');
			}
			const baseURL = config.baseURL;
			// Use require for OpenAI SDK for compatibility
			// @ts-ignore

			const { default: OpenAIClass } = await import('openai');
			const openai = new OpenAIClass({ apiKey, baseURL });
			const codestralOptions: CodestralOptions = {
				...(config.codestralOptions?.enableThinking !== undefined && {
					enableThinking: config.codestralOptions.enableThinking,
				}),
				...(config.codestralOptions?.thinkingBudget !== undefined && {
					thinkingBudget: config.codestralOptions.thinkingBudget,
				}),
				...(config.codestralOptions?.temperature !== undefined && {
					temperature: config.codestralOptions.temperature,
				}),
				...(config.codestralOptions?.top_p !== undefined && { top_p: config.codestralOptions.top_p }),
			};
			return new CodestralService(
				openai,
				config.model,
				mcpManager,
				contextManager,
				config.maxIterations,
				codestralOptions,
				unifiedToolManager
			);
		}
		default:
			throw new Error(`Unsupported LLM provider: ${config.provider}`);
	}
}

export async function createLLMService(
	config: LLMConfig,
	mcpManager: MCPManager,
	contextManager: ContextManager,
	unifiedToolManager?: UnifiedToolManager,
	eventManager?: any
): ILLMService {
	const service = await _createLLMService(config, mcpManager, contextManager, unifiedToolManager);

	// Set event manager if provided
	if (eventManager && typeof (service as any).setEventManager === 'function') {
		(service as any).setEventManager(eventManager);
	}

	// Configure token-aware compression for the context manager
	configureCompressionForService(config, contextManager);

	return service;
}

/**
 * Configure compression settings for the context manager based on LLM config
 */
async function configureCompressionForService(
	config: LLMConfig,
	contextManager: ContextManager
): Promise<void> {
	try {
		// Extract provider and model info
		const provider = config.provider.toLowerCase();
		const model = config.model;

		// Get context window size from defaults since it's not in config
		// Context window must be explicitly configured - no default fallbacks
		if (!config.contextWindow) {
			throw new Error(`Context window must be explicitly configured for ${provider} provider with model ${model}. Please specify contextWindow in configuration.`);
		}
		const contextWindow = config.contextWindow;

		// Configure compression asynchronously to avoid blocking service creation
		setImmediate(async () => {
			try {
				await contextManager.configureCompression(provider, model, contextWindow);
				logger.debug('Token-aware compression configured for LLM service', {
					provider,
					model,
					contextWindow,
				});
			} catch (error) {
				logger.warn('Failed to configure compression for LLM service', {
					error: (error as Error).message,
					provider,
					model,
				});
			}
		});
	} catch (error) {
		logger.error('Error in compression configuration', { error });
	}
}

/**
 * Get default context window size for provider/model combinations
 */
// REMOVED: getDefaultContextWindow function
// Context windows must now be explicitly configured - no fallback defaults
// This enforces fail-fast behavior for LLM service configuration
