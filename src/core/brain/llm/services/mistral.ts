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

export interface MistralOptions {
	temperature?: number;
	top_p?: number;
	[key: string]: any;
}

export class MistralService implements ILLMService {
	private client: OpenAI;
	private model: string;
	private mcpManager: MCPManager;
	private unifiedToolManager: UnifiedToolManager | undefined;
	private contextManager: ContextManager;
	private maxIterations: number;
	private mistralOptions: MistralOptions;
	private eventManager?: EventManager;

	constructor(
		client: OpenAI,
		model: string,
		mcpManager: MCPManager,
		contextManager: ContextManager,
		maxIterations: number = 5,
		mistralOptions: MistralOptions = {},
		unifiedToolManager?: UnifiedToolManager
	) {
		this.client = client;
		this.model = model;
		this.mcpManager = mcpManager;
		this.unifiedToolManager = unifiedToolManager;
		this.contextManager = contextManager;
		this.maxIterations = maxIterations;
		this.mistralOptions = mistralOptions;
	}

	setEventManager(eventManager: EventManager): void {
		this.eventManager = eventManager;
	}

	async generate(userInput: string, imageData?: ImageData, stream?: boolean): Promise<string> {
		try {
			logger.debug('[MistralService] Starting generation', {
				model: this.model,
				inputLength: userInput.length,
				hasImageData: !!imageData,
				maxIterations: this.maxIterations,
			});

			// Emit thinking start event
			this.eventManager?.emitSessionEvent?.(uuidv4(), SessionEvents.LLM_THINKING, {
				sessionId: uuidv4(),
				messageId: uuidv4(),
				timestamp: Date.now(),
			});

			let conversation = await this.contextManager.getRawMessagesAsync();
			conversation.push({ role: 'user', content: userInput });

			let iterationCount = 0;
			let finalResponse = '';

			while (iterationCount < this.maxIterations) {
				iterationCount++;

				logger.debug(`[MistralService] Iteration ${iterationCount}/${this.maxIterations}`);

				// Get available tools
				const tools = await this.getAllTools();
				const combinedTools = {
					...tools,
				} as any;

				// Get OpenAI-compatible tools array
				const openaiTools = (await this.unifiedToolManager?.getToolsForProvider('mistral')) || [];

				const chatCompletion = await this.client.chat.completions.create({
					model: this.model,
					messages: conversation as any,
					...(openaiTools && openaiTools.length > 0 ? { tools: openaiTools } : {}),
					...(openaiTools.length > 0 ? { tool_choice: 'auto' } : {}),
					temperature: this.mistralOptions.temperature || 0.7,
					top_p: this.mistralOptions.top_p || 1.0,
				});

				const assistantMessage = chatCompletion.choices[0]?.message;
				if (!assistantMessage) {
					throw new Error('No assistant message in response');
				}

				conversation.push({
					role: 'assistant',
					content: assistantMessage.content || '',
				});

				// Check if there are tool calls
				if (assistantMessage.tool_calls && assistantMessage.tool_calls.length > 0) {
					logger.debug('[MistralService] Processing tool calls', {
						toolCallCount: assistantMessage.tool_calls.length,
					});

					// Process each tool call
					for (const toolCall of assistantMessage.tool_calls) {
						try {
							const args = JSON.parse(toolCall.function.arguments);
							const result = await this.unifiedToolManager?.executeTool(
								toolCall.function.name,
								args
							);

							const formattedResult = formatToolResult(toolCall.function.name, result);
							conversation.push({
								role: 'tool',
								content: formattedResult,
								toolCallId: toolCall.id,
							});

							logger.debug('[MistralService] Tool call executed successfully', {
								toolName: toolCall.function.name,
								resultLength: formattedResult.length,
							});
						} catch (error) {
							const errorMessage = `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`;
							conversation.push({
								role: 'tool',
								content: errorMessage,
								toolCallId: toolCall.id,
							});
							logger.error('[MistralService] Tool call failed', {
								toolName: toolCall.function.name,
								error: errorMessage,
							});
						}
					}
				} else {
					// No tool calls, we have our final response
					finalResponse = assistantMessage.content || '';
					break;
				}
			}

			// Update conversation history
			await this.contextManager.addUserMessage(userInput, imageData);
			await this.contextManager.addAssistantMessage(finalResponse);

			// Emit thinking end event
			this.eventManager?.emitSessionEvent?.(uuidv4(), SessionEvents.LLM_RESPONSE_COMPLETED, {
				sessionId: uuidv4(),
				messageId: uuidv4(),
				model: this.model,
				tokenCount: 0,
				duration: 0,
				timestamp: Date.now(),
				response: finalResponse,
			});

			logger.debug('[MistralService] Generation completed', {
				iterations: iterationCount,
				responseLength: finalResponse.length,
			});

			return finalResponse;
		} catch (error) {
			logger.error('[MistralService] Generation failed:', error);
			
			// Emit thinking end event on error
			this.eventManager?.emitSessionEvent?.(uuidv4(), SessionEvents.LLM_RESPONSE_ERROR, {
				sessionId: uuidv4(),
				messageId: uuidv4(),
				model: this.model,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			});

			throw new Error(`Mistral API call failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async directGenerate(userInput: string, systemPrompt?: string): Promise<string> {
		try {
			logger.debug('[MistralService] Direct generate call (bypassing conversation context)', {
				inputLength: userInput.length,
				hasSystemPrompt: !!systemPrompt,
			});

			const messages: Array<{ role: string; content: string }> = [];

			if (systemPrompt) {
				messages.push({ role: 'system', content: systemPrompt });
			}

			messages.push({ role: 'user', content: userInput });

			const chatCompletion = await this.client.chat.completions.create({
				model: this.model,
				messages: messages as any,
				temperature: this.mistralOptions.temperature || 0.7,
				top_p: this.mistralOptions.top_p || 1.0,
			});

			const content = chatCompletion.choices[0]?.message?.content || '';

			logger.debug('[MistralService] Direct generate completed', {
				responseLength: content.length,
			});

			return content;
		} catch (error) {
			logger.error('[MistralService] Direct generate failed:', error);
			throw new Error(`Mistral API call failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	async getAllTools(): Promise<ToolSet> {
		const mcpTools = await this.mcpManager.getAllTools();
		const internalTools = this.unifiedToolManager?.getToolsForProvider('mistral') || [];
		
		return {
			...mcpTools,
			...((internalTools as any) || {}),
		} as ToolSet;
	}

	getConfig(): LLMServiceConfig {
		return {
			provider: 'mistral',
			model: this.model,
		};
	}
}