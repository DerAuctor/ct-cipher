import { ToolSet } from '../../../mcp/types.js';
import { MCPManager } from '../../../mcp/manager.js';
import { UnifiedToolManager, CombinedToolSet } from '../../tools/unified-tool-manager.js';
import { ContextManager } from '../messages/manager.js';
import { ImageData } from '../messages/types.js';
import { ILLMService, LLMServiceConfig } from './types.js';
import OpenAI from 'openai';
import { logger } from '../../../logger/index.js';
import { formatToolResult } from '../utils/tool-result-formatter.js';
import { EventManager } from '../../../events/event-manager.js';
import { SessionEvents } from '../../../events/event-types.js';
import { v4 as uuidv4 } from 'uuid';

export interface CodestralOptions {
	enableThinking?: boolean;
	thinkingBudget?: number;
	[key: string]: any;
}

export class CodestralService implements ILLMService {
	private client: OpenAI;
	private model: string;
	private mcpManager: MCPManager;
	private unifiedToolManager: UnifiedToolManager | undefined;
	private contextManager: ContextManager;
	private maxIterations: number;
	private codestralOptions: CodestralOptions;
	private eventManager?: EventManager;

	constructor(
		client: OpenAI,
		model: string,
		mcpManager: MCPManager,
		contextManager: ContextManager,
		maxIterations: number = 5,
		codestralOptions: CodestralOptions = {},
		unifiedToolManager?: UnifiedToolManager
	) {
		this.client = client;
		this.model = model;
		this.mcpManager = mcpManager;
		this.unifiedToolManager = unifiedToolManager;
		this.contextManager = contextManager;
		this.maxIterations = maxIterations;
		this.codestralOptions = codestralOptions;
	}

	setEventManager(eventManager: EventManager): void {
		this.eventManager = eventManager;
	}

	async generate(userInput: string, imageData?: ImageData): Promise<string> {
		await this.contextManager.addUserMessage(userInput, imageData);

		const messageId = uuidv4();
		const startTime = Date.now();

		// Try to get sessionId from contextManager if available, otherwise undefined
		const sessionId = (this.contextManager as any)?.sessionId;

		// Emit LLM response started event
		if (this.eventManager && sessionId) {
			this.eventManager.emitSessionEvent(sessionId, SessionEvents.LLM_RESPONSE_STARTED, {
				sessionId,
				messageId,
				model: this.model,
				timestamp: startTime,
			});
		}

		let formattedTools: any[] = [];
		if (this.unifiedToolManager) {
			// Use 'codestral' for Codestral-specific tool formatting
			formattedTools = (await this.unifiedToolManager.getToolsForProvider('codestral')) || [];
		} else {
			const rawTools = await this.mcpManager.getAllTools();
			formattedTools = this.formatToolsForOpenAI(rawTools) || [];
		}

		logger.silly(`[Codestral] Formatted tools: ${JSON.stringify(formattedTools, null, 2)}`);

		let iterationCount = 0;
		try {
			while (iterationCount < this.maxIterations) {
				iterationCount++;
				const { message } = await this.getAIResponseWithRetries(formattedTools, userInput);

				if (
					!message.tool_calls ||
					!Array.isArray(message.tool_calls) ||
					message.tool_calls.length === 0
				) {
					const responseText = message.content || '';
					await this.contextManager.addAssistantMessage(responseText);

					// Emit LLM response completed event
					if (this.eventManager && sessionId) {
						this.eventManager.emitSessionEvent(sessionId, SessionEvents.LLM_RESPONSE_COMPLETED, {
							sessionId,
							messageId,
							model: this.model,
							duration: Date.now() - startTime,
							timestamp: Date.now(),
							response: responseText,
						});
					}

					return responseText;
				}

				if (message.content && message.content.trim()) {
					logger.info(`[Codestral] 💭 ${message.content.trim()}`);

					// Emit thinking event
					if (this.eventManager && sessionId) {
						this.eventManager.emitSessionEvent(sessionId, SessionEvents.LLM_THINKING, {
							sessionId,
							messageId,
							timestamp: Date.now(),
						});
					}
				}

				await this.contextManager.addAssistantMessage(message.content, message.tool_calls);

				for (const toolCall of message.tool_calls) {
					logger.debug(`[Codestral] Tool call initiated: ${JSON.stringify(toolCall, null, 2)}`);
					logger.info(`[Codestral] 🔧 Using tool: ${toolCall.function.name}`);
					const toolName = toolCall.function.name;
					let args: any = {};

					try {
						args = JSON.parse(toolCall.function.arguments);
					} catch (e) {
						logger.error(`[Codestral] Error parsing arguments for ${toolName}:`, e);
						await this.contextManager.addToolResult(toolCall.id, toolName, {
							error: `Failed to parse arguments: ${e}`,
						});
						continue;
					}

					try {
						let result: any;
						if (this.unifiedToolManager) {
							result = await this.unifiedToolManager.executeTool(toolName, args, sessionId);
						} else {
							result = await this.mcpManager.executeTool(toolName, args);
						}
						const formattedResult = formatToolResult(toolName, result);
						logger.info(`[Codestral] 📋 Tool Result:\n${formattedResult}`);
						await this.contextManager.addToolResult(toolCall.id, toolName, result);
					} catch (error) {
						const errorMessage = error instanceof Error ? error.message : String(error);
						logger.error(`[Codestral] Tool execution error for ${toolName}: ${errorMessage}`);
						await this.contextManager.addToolResult(toolCall.id, toolName, {
							error: errorMessage,
						});
					}
				}
			}
			logger.warn(`[Codestral] Reached maximum iterations (${this.maxIterations}) for task.`);
			const finalResponse = 'Task completed but reached maximum tool call iterations.';
			await this.contextManager.addAssistantMessage(finalResponse);
			return finalResponse;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`[Codestral] Error in Codestral service API call: ${errorMessage}`, { error });
			await this.contextManager.addAssistantMessage(
				`[Codestral] Error processing request: ${errorMessage}`
			);
			return `[Codestral] Error processing request: ${errorMessage}`;
		}
	}

	async getAllTools(): Promise<ToolSet | CombinedToolSet> {
		if (this.unifiedToolManager) {
			return await this.unifiedToolManager.getAllTools();
		}
		return this.mcpManager.getAllTools();
	}

	getConfig(): LLMServiceConfig {
		return {
			provider: 'codestral',
			model: this.model,
		};
	}

	private async getAIResponseWithRetries(
		tools: any[],
		userInput: string
	): Promise<{ message: any }> {
		const MAX_ATTEMPTS = 3;
		let attempts = 0;
		logger.debug(`[Codestral] Tools in response: ${tools?.length || 0}`);
		while (attempts < MAX_ATTEMPTS) {
			attempts++;
			try {
				const formattedMessages = await this.contextManager.getFormattedMessage({
					role: 'user',
					content: userInput,
				});
				logger.debug(`[Codestral] Sending ${formattedMessages.length} formatted messages to Codestral:`, {
					messages: formattedMessages.map((msg, idx) => ({
						index: idx,
						role: msg.role,
						hasContent: !!msg.content,
						hasToolCalls: !!msg.tool_calls,
						toolCallId: msg.tool_call_id,
						name: msg.name,
					})),
				});

				// Transform codestralOptions to API format (camelCase to snake_case)
				const apiOptions: any = {};

				// Always set enable_thinking explicitly for non-streaming calls
				// Codestral API requires this to be explicitly set to false for non-streaming calls
				apiOptions.enable_thinking = this.codestralOptions.enableThinking ?? false;

				if (this.codestralOptions.thinkingBudget !== undefined) {
					apiOptions.thinking_budget = this.codestralOptions.thinkingBudget;
				}
				if (this.codestralOptions.temperature !== undefined) {
					apiOptions.temperature = this.codestralOptions.temperature;
				}
				if (this.codestralOptions.top_p !== undefined) {
					apiOptions.top_p = this.codestralOptions.top_p;
				}

				// Debug logging to see what's being sent
				logger.debug('[Codestral] CodestralOptions being sent to API:', {
					codestralOptions: this.codestralOptions,
					apiOptions: apiOptions,
					enableThinking: this.codestralOptions.enableThinking,
					enable_thinking: apiOptions.enable_thinking,
				});

				const requestBody: any = {
					model: this.model,
					messages: formattedMessages,
					tools: attempts === 1 ? tools || [] : [],
					tool_choice: attempts === 1 ? 'auto' : 'none',
					...apiOptions,
				};
				const response = await this.client.chat.completions.create(requestBody);
				logger.silly('[Codestral] CODESTRAL CHAT COMPLETION RESPONSE: ', JSON.stringify(response, null, 2));
				const message = response.choices[0]?.message;
				if (!message) {
					throw new Error('[Codestral] Received empty message from Codestral API');
				}
				return { message };
			} catch (error) {
				const apiError = error as any;
				logger.error(
					`[Codestral] Error in Codestral API call (Attempt ${attempts}/${MAX_ATTEMPTS}): ${apiError.message || JSON.stringify(apiError, null, 2)}`,
					{ status: apiError.status, headers: apiError.headers }
				);
				if (apiError.status === 400 && apiError.error?.code === 'context_length_exceeded') {
					logger.warn(
						`[Codestral] Context length exceeded. ContextManager compression might not be sufficient. Error details: ${JSON.stringify(apiError.error)}`
					);
				}
				if (attempts >= MAX_ATTEMPTS) {
					logger.error(`[Codestral] Failed to get response from Codestral after ${MAX_ATTEMPTS} attempts.`);
					throw error;
				}
				await new Promise(resolve => setTimeout(resolve, 500 * attempts));
			}
		}
		throw new Error('[Codestral] Failed to get response after maximum retry attempts');
	}

	async directGenerate(userInput: string, systemPrompt?: string): Promise<string> {
		try {
			logger.debug('[CodestralService] Direct generate call (bypassing conversation context)', {
				inputLength: userInput.length,
				hasSystemPrompt: !!systemPrompt,
			});

			// Create a minimal message array for direct API call
			const messages: any[] = [];

			if (systemPrompt) {
				messages.push({
					role: 'system',
					content: systemPrompt,
				});
			}

			messages.push({
				role: 'user',
				content: userInput,
			});

			// Transform codestralOptions to API format (camelCase to snake_case)
			const apiOptions: any = {};
			apiOptions.enable_thinking = this.codestralOptions.enableThinking ?? false;

			if (this.codestralOptions.thinkingBudget !== undefined) {
				apiOptions.thinking_budget = this.codestralOptions.thinkingBudget;
			}
			if (this.codestralOptions.temperature !== undefined) {
				apiOptions.temperature = this.codestralOptions.temperature;
			}
			if (this.codestralOptions.top_p !== undefined) {
				apiOptions.top_p = this.codestralOptions.top_p;
			}

			// Make direct API call without adding to conversation context
			const response = await this.client.chat.completions.create({
				model: this.model,
				messages: messages,
				...apiOptions,
				// No tools for direct calls - this is for simple text generation
			});

			const responseText = response.choices[0]?.message?.content || '';

			logger.debug('[CodestralService] Direct generate completed', {
				responseLength: responseText.length,
			});

			return responseText;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`[CodestralService] Direct generate failed: ${errorMessage}`, error);
			throw new Error(`[CodestralService] Direct generate failed: ${errorMessage}`);
		}
	}

	private formatToolsForOpenAI(tools: ToolSet): any[] {
		if (!tools || typeof tools !== 'object') {
			return [];
		}
		return Object.entries(tools).map(([name, tool]) => {
			return {
				type: 'function',
				function: {
					name,
					description: tool.description,
					parameters: tool.parameters,
				},
			};
		});
	}
}