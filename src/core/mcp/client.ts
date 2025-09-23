/**
 * MCPClient implementation for the Model Context Protocol (MCP) module.
 *
 * This file contains the MCPClient class that handles connection management,
 * transport abstraction, and operations for a single MCP server.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GetPromptResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';

import type {
	IMCPClient,
	McpServerConfig,
	StdioServerConfig,
	SseServerConfig,
	StreamableHttpServerConfig,
	ToolSet,
	ToolExecutionResult,
} from './types.js';

import {
	DEFAULT_TIMEOUT_MS,
	ERROR_MESSAGES,
	LOG_PREFIXES,
	TRANSPORT_TYPES,
	ENV_VARS,
} from './constants.js';

import { Logger, createLogger } from '../logger/index.js';
import { withRetry, MCP_RETRY_CONFIG } from './retry-utils.js';

/**
 * Implementation of the IMCPClient interface for managing connections to MCP servers.
 * Supports stdio, SSE, and HTTP transports with comprehensive error handling and timeout management.
 */

export class MCPClient implements IMCPClient {
	private client: Client | null = null;
	private transport: Transport | null = null;
	private connected: boolean = false;
	private serverConfig: McpServerConfig | null = null;
	private serverName: string = '';
	private logger: Logger;
	private connectionPromise: Promise<Client> | null = null;
	private quietMode = false;
	// Tool caching for performance optimization
	private cachedTools: ToolSet | null = null;
	private toolsCacheValid: boolean = false;

	// Lazy connect flags for streamable-HTTP: defer client.connect() until first request
	private _isStreamHttpLazy = false;
	private _clientStarted = false;

	// Server process information (for stdio connections)
	private serverInfo = {
		spawned: false,
		pid: null as number | null,
		command: null as string | null,
		originalArgs: null as string[] | null,
		resolvedArgs: null as string[] | null,
		env: null as Record<string, string> | null,
		alias: null as string | null,
	};

	constructor() {
		this.logger = createLogger({ level: 'info' });
	}

	/**
	 * Enable quiet mode to reduce logging verbosity (useful for CLI mode)
	 */
	setQuietMode(quiet: boolean): void {
		this.quietMode = quiet;
	}

	/**
	 * Connect to an MCP server using the provided configuration.
	 */
	async connect(config: McpServerConfig, serverName: string): Promise<Client> {
		if (this.connected && this.client) {
			this.logger.warn(`${LOG_PREFIXES.CONNECT} Already connected to ${serverName}`);
			return this.client;
		}

		// If connection is already in progress, return the existing promise
		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		// Use retry mechanism for stdio connections, direct connection for others
		this.connectionPromise = this._performConnectionWithRetry(config, serverName);

		try {
			const client = await this.connectionPromise;
			this.connectionPromise = null;
			return client;
		} catch (error) {
			this.connectionPromise = null;
			throw error;
		}
	}

	/**
	 * Internal method to perform the actual connection.
	 */
	private async _performConnectionWithRetry(config: McpServerConfig, serverName: string): Promise<Client> {
		// For stdio connections, implement retry mechanism
		if (config.type === 'stdio') {
			return this._performStdioConnectionWithRetry(config as StdioServerConfig, serverName);
		}

		// For non-stdio connections, use direct connection
		return this._performConnection(config, serverName);
	}

	private async _performStdioConnectionWithRetry(config: StdioServerConfig, serverName: string): Promise<Client> {
		const maxRetries = 3;
		const baseDelay = 1000; // 1 second
		const serverCategory = this._getStdioServerCategory(serverName, config.command);

		// Adjust retry strategy based on server category
		const retryConfig = {
			fast: { maxRetries: 2, baseDelay: 500 },
			standard: { maxRetries: 3, baseDelay: 1000 },
			heavy: { maxRetries: 4, baseDelay: 2000 }
		}[serverCategory];

		let lastError: Error;

		for (let attempt = 1; attempt <= retryConfig.maxRetries; attempt++) {
			try {
				if (attempt > 1) {
					const delay = retryConfig.baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
					this.logger.info(`[MCP-RETRY] Retrying connection to ${serverName} (attempt ${attempt}/${retryConfig.maxRetries}) after ${delay}ms`, {
						serverName,
						attempt,
						maxRetries: retryConfig.maxRetries,
						delay,
						serverCategory
					});
					await this._delay(delay);
				}

				return await this._performConnection(config, serverName);

			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));
				
				this.logger.warn(`[MCP-RETRY] Connection attempt ${attempt} failed for ${serverName}`, {
					serverName,
					attempt,
					maxRetries: retryConfig.maxRetries,
					error: lastError.message,
					serverCategory
				});

				// Don't retry for certain error types
				if (lastError.message.includes('ENOENT') || 
				    lastError.message.includes('EACCES')) {
					this.logger.error(`[MCP-RETRY] Non-retryable error for ${serverName}`, {
						serverName,
						error: lastError.message,
						errorType: 'FATAL'
					});
					throw lastError;
				}
			}
		}

		// All retries exhausted
		this.logger.error(`[MCP-RETRY] All retry attempts exhausted for ${serverName}`, {
			serverName,
			maxRetries: retryConfig.maxRetries,
			finalError: lastError!.message,
			serverCategory
		});

		throw lastError!;
	}

	private _getStdioServerCategory(serverName: string, command: string): 'fast' | 'standard' | 'heavy' {
		const name = serverName.toLowerCase();
		const cmd = command.toLowerCase();

		// Fast servers
		const fastPatterns = ['time', 'echo', 'date', 'simple', 'basic'];
		if (fastPatterns.some(pattern => name.includes(pattern) || cmd.includes(pattern))) {
			return 'fast';
		}

		// Heavy servers
		const heavyPatterns = [
			'langchain', 'langgraph', 'tensorflow', 'pytorch', 'docker', 
			'kubernetes', 'database', 'postgres', 'mysql', 'mongodb', 
			'elasticsearch', 'redis', 'neo4j'
		];
		if (heavyPatterns.some(pattern => name.includes(pattern) || cmd.includes(pattern))) {
			return 'heavy';
		}

		return 'standard';
	}

	private async _delay(ms: number): Promise<void> {
		return new Promise(resolve => setTimeout(resolve, ms));
	}

	private async _performConnection(config: McpServerConfig, serverName: string): Promise<Client> {
		this.serverConfig = config;
		this.serverName = serverName;

		if (!this.quietMode) {
			this.logger.info(`${LOG_PREFIXES.CONNECT} Connecting to ${serverName} (${config.type})`, {
				serverName,
				transportType: config.type,
			});
		}

		try {
			// Create transport based on configuration type
			this.transport = await this._createTransport(config);

			// Create the client (connection may be lazy for streamable-HTTP)
			this.client = new Client(
				{
					name: `cipher-mcp-client-${serverName}`,
					version: '1.0.0',
				},
				{
					capabilities: {
						tools: {},
						prompts: {},
						resources: {},
					},
				}
			);

			const timeout = this._getOperationTimeout(config);

				// SPEC-CONFORM: Always perform initialize handshake on connect for all transports,
				// including streamable-HTTP, to establish a real session eagerly.
				await this._connectWithTimeout(this.transport, timeout);
				this._clientStarted = true;
				this._isStreamHttpLazy = false;
				this.connected = true;

			if (!this.quietMode) {
				this.logger.info(`${LOG_PREFIXES.CONNECT} Successfully connected to ${serverName}`, {
					serverName,
					timeout,
				});
			}

			return this.client;
		} catch (error) {
			await this._cleanup();

			const errorMessage = error instanceof Error ? error.message : String(error);
			
			// Enhanced error handling with transport-specific details
			const errorContext: any = {
				serverName,
				error: errorMessage,
				transportType: config.type,
			};

			// Add stdio-specific error details
			if (config.type === 'stdio') {
				const stdioConfig = config as StdioServerConfig;
				errorContext.command = stdioConfig.command;
				errorContext.args = stdioConfig.args;
				
				// Include process information if available
				if (this.serverInfo.pid) {
					errorContext.processId = this.serverInfo.pid;
				}
				
				// Categorize stdio-specific error types
				if (error instanceof Error) {
					if (error.message.includes('ENOENT')) {
						errorContext.errorType = 'COMMAND_NOT_FOUND';
						errorContext.suggestion = `Command '${stdioConfig.command}' not found in PATH`;
					} else if (error.message.includes('EACCES')) {
						errorContext.errorType = 'PERMISSION_DENIED';
						errorContext.suggestion = `Permission denied executing '${stdioConfig.command}'`;
					} else if (error.message.includes('timeout')) {
						errorContext.errorType = 'CONNECTION_TIMEOUT';
						errorContext.suggestion = 'Consider increasing timeout or checking server startup time';
					} else if (error.message.includes('spawn')) {
						errorContext.errorType = 'SPAWN_FAILED';
						errorContext.suggestion = 'Process spawning failed - check command path and arguments';
					} else {
						errorContext.errorType = 'STDIO_CONNECTION_ERROR';
					}
				}
			} else if (config.type === 'sse') {
				const sseConfig = config as SseServerConfig;
				errorContext.url = sseConfig.url;
				errorContext.headers = Object.keys(sseConfig.headers || {});
			} else if (config.type === 'streamable-http') {
				const httpConfig = config as StreamableHttpServerConfig;
				errorContext.url = httpConfig.url;
				errorContext.headers = Object.keys(httpConfig.headers || {});
			}

			this.logger.error(
				`${LOG_PREFIXES.CONNECT} ${ERROR_MESSAGES.CONNECTION_FAILED}: ${serverName}`,
				errorContext
			);

			throw new Error(`${ERROR_MESSAGES.CONNECTION_FAILED}: ${errorMessage}`);
		}
	}

	/**
	 * Ensure client.connect() executed for lazy streamable-HTTP mode.
	 */
	private async _lazyConnectIfNeeded(): Promise<void> {
		if (!this.client || !this.transport) return;
		if (this._isStreamHttpLazy && !this._clientStarted) {
			// Attempt to start the underlying transport connection now
			const timeout = this._getOperationTimeout();
			await this._connectWithTimeout(this.transport, timeout);
			this._clientStarted = true;
		}
	}

	/**
	 * Create transport based on server configuration.
	 */
	private async _createTransport(config: McpServerConfig): Promise<Transport> {
		switch (config.type) {
			case TRANSPORT_TYPES.STDIO:
				return this._createStdioTransport(config as StdioServerConfig);

			case TRANSPORT_TYPES.SSE:
				return this._createSseTransport(config as SseServerConfig);

			case TRANSPORT_TYPES.STREAMABLE_HTTP:
				return this._createStreamableHttpTransport(config as StreamableHttpServerConfig);

			default:
				throw new Error(`${ERROR_MESSAGES.UNSUPPORTED_SERVER_TYPE}: ${(config as any).type}`);
		}
	}

	/**
	 * Create stdio transport.
	 */
	private async _createStdioTransport(config: StdioServerConfig): Promise<Transport> {
		const resolvedCommand = this._resolveCommand(config.command);
		const resolvedArgs = this._resolveArgs(config.args || []);
		const env = this._mergeEnvironment(config.env || {});

		// Store server info for stdio connections
		this.serverInfo = {
			spawned: true,
			pid: null, // Will be set after spawn
			command: resolvedCommand,
			originalArgs: config.args || [],
			resolvedArgs,
			env,
			alias: this.serverName,
		};

		// Enhanced logging for stdio transport creation
		this.logger.debug(`${LOG_PREFIXES.CONNECT} Creating stdio transport for ${this.serverName}`, {
			command: resolvedCommand,
			args: resolvedArgs,
			envKeys: Object.keys(env),
			serverName: this.serverName,
		});

		try {
			const transport = new StdioClientTransport({
				command: resolvedCommand,
				args: resolvedArgs,
				env,
			});

			// Add process event listeners for better diagnosis
			if ((transport as any).process) {
				const process = (transport as any).process;
				
				process.on('error', (error: Error) => {
					this.logger.error(`${LOG_PREFIXES.CONNECT} Process error for ${this.serverName}`, {
						serverName: this.serverName,
						command: resolvedCommand,
						error: error.message,
						errorCode: (error as any).code,
					});
				});

				process.on('exit', (code: number | null, signal: string | null) => {
					this.logger.warn(`${LOG_PREFIXES.CONNECT} Process exited for ${this.serverName}`, {
						serverName: this.serverName,
						command: resolvedCommand,
						exitCode: code,
						signal: signal,
					});
				});

				// Store the process PID for monitoring
				if (process.pid) {
					this.serverInfo.pid = process.pid;
					this.logger.debug(`${LOG_PREFIXES.CONNECT} Process spawned for ${this.serverName}`, {
						serverName: this.serverName,
						pid: process.pid,
					});
				}
			}

			return transport;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${LOG_PREFIXES.CONNECT} Failed to create stdio transport for ${this.serverName}`, {
				serverName: this.serverName,
				command: resolvedCommand,
				args: resolvedArgs,
				error: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * Create SSE transport.
	 */
	private async _createSseTransport(config: SseServerConfig): Promise<Transport> {
	this.logger.debug(`${LOG_PREFIXES.CONNECT} Creating SSE transport`, {
		url: config.url,
		serverName: this.serverName,
	});

	// Align with MCP TS SDK v1.18.0: use requestInit for headers
	if (config.headers && Object.keys(config.headers).length > 0) {
		const headers = config.headers;
		const transport = new SSEClientTransport(new URL(config.url), {
			requestInit: { headers },
			eventSourceInit: {
				fetch: (url, init) => fetch(url, { ...init, headers }),
			},
		});
		return transport;
	}

	const transport = new SSEClientTransport(new URL(config.url));
	return transport;
}

	/**
	 * Create streamable HTTP transport.
	 */
	private async _createStreamableHttpTransport(
	config: StreamableHttpServerConfig
): Promise<Transport> {
	this.logger.info(`${LOG_PREFIXES.CONNECT} DEBUG: Creating streamable HTTP transport`, {
		url: config.url,
		serverName: this.serverName,
		headers: config.headers ? Object.keys(config.headers) : [],
		timeout: config.timeout || 'default'
	});

	try {
		// Add required Accept headers for MCP streamable-http protocol
		const requiredHeaders = {
			'Accept': 'application/json, text/event-stream',
			'Content-Type': 'application/json'
		};

		// Merge with user-provided headers
		const finalHeaders = {
			...requiredHeaders,
			...(config.headers || {})
		};

		this.logger.info(`${LOG_PREFIXES.CONNECT} DEBUG: Using headers for streamable HTTP transport`, {
			url: config.url,
			serverName: this.serverName,
			headers: finalHeaders
		});

		const transport = new StreamableHTTPClientTransport(new URL(config.url), {
			requestInit: { headers: finalHeaders },
		});

		this.logger.info(`${LOG_PREFIXES.CONNECT} DEBUG: Streamable HTTP transport created with required headers`, {
			url: config.url,
			serverName: this.serverName,
			headerCount: Object.keys(finalHeaders).length
		});
		return transport as Transport;
	} catch (error) {
		this.logger.error(`${LOG_PREFIXES.CONNECT} DEBUG: Failed to create streamable HTTP transport`, {
			url: config.url,
			serverName: this.serverName,
			error: error instanceof Error ? error.message : String(error),
			errorType: error instanceof Error ? error.constructor.name : 'Unknown'
		});
		throw error;
	}
}

	/**
	 * Connect client to transport with timeout.
	 */
	private async _connectWithTimeout(transport: Transport, timeout: number): Promise<void> {
		if (!this.client) {
			throw new Error('Client not initialized');
		}

		const startTime = Date.now();
		this.logger.info(`${LOG_PREFIXES.CONNECT} DEBUG: Starting transport connection`, {
			serverName: this.serverName,
			timeout,
			transportType: this.serverConfig?.type,
			transportDetails: this.serverConfig?.type === 'streamable-http' ? 
				{ url: (this.serverConfig as any).url } : undefined
		});

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const elapsed = Date.now() - startTime;
				this.logger.error(`${LOG_PREFIXES.CONNECT} DEBUG: Transport connection timed out`, {
					serverName: this.serverName,
					timeout,
					elapsed,
					transportType: this.serverConfig?.type
				});
				reject(new Error(`Connection timeout after ${timeout}ms (${elapsed}ms elapsed)`));
			}, timeout);

			const cleanup = () => clearTimeout(timeoutId);

			this.client!.connect(transport)
				.then(() => {
					cleanup();
					const elapsed = Date.now() - startTime;
					this.logger.info(`${LOG_PREFIXES.CONNECT} DEBUG: Transport connection successful`, {
						serverName: this.serverName,
						elapsed,
						timeout,
						transportType: this.serverConfig?.type
					});
					resolve();
				})
				.catch(error => {
					cleanup();
					const elapsed = Date.now() - startTime;
					this.logger.error(`${LOG_PREFIXES.CONNECT} DEBUG: Transport connection failed`, {
						serverName: this.serverName,
						elapsed,
						timeout,
						error: error instanceof Error ? error.message : String(error),
						errorType: error instanceof Error ? error.constructor.name : 'Unknown',
						transportType: this.serverConfig?.type,
						stack: error instanceof Error ? error.stack : undefined
					});
					reject(error);
				});
		});
	}

	/**
	 * Disconnect from the MCP server.
	 */
	async disconnect(): Promise<void> {
		if (!this.connected) {
			this.logger.warn(`${LOG_PREFIXES.CONNECT} Already disconnected from ${this.serverName}`);
			return;
		}

		this.logger.info(`${LOG_PREFIXES.CONNECT} Disconnecting from ${this.serverName}`);

		try {
			await this._cleanup();
			this.logger.info(`${LOG_PREFIXES.CONNECT} Successfully disconnected from ${this.serverName}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(
				`${LOG_PREFIXES.CONNECT} ${ERROR_MESSAGES.DISCONNECTION_FAILED}: ${this.serverName}`,
				{ serverName: this.serverName, error: errorMessage }
			);
			throw new Error(`${ERROR_MESSAGES.DISCONNECTION_FAILED}: ${errorMessage}`);
		}
	}


	/**
	 * Terminate the remote session for streamable-HTTP transport if available.
	 * For other transports, falls back to a normal disconnect.
	 */
	async terminateSession(): Promise<void> {
		if (!this.transport) {
			return;
		}

		try {
			if (this.transport instanceof StreamableHTTPClientTransport) {
				await (this.transport as StreamableHTTPClientTransport).terminateSession();
				await this._cleanup();
				this.logger.info(`${LOG_PREFIXES.CONNECT} Session terminated for ${this.serverName}`);
				return;
			}

			await this._cleanup();
			this.logger.info(`${LOG_PREFIXES.CONNECT} Disconnected (no session termination for transport) for ${this.serverName}`);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${LOG_PREFIXES.CONNECT} Failed to terminate session for ${this.serverName}`, {
				serverName: this.serverName,
				error: errorMessage,
			});
			throw error;
		}
	}
	/**
	 * Call a tool with the given name and arguments.
	 */
	async callTool(name: string, args: any): Promise<ToolExecutionResult> {
		await this._lazyConnectIfNeeded();
		this._ensureConnected();

		const timeout = this._getOperationTimeout();

		this.logger.info(`${LOG_PREFIXES.TOOL} Calling tool: ${name}`, {
			toolName: name,
			serverName: this.serverName,
			timeout,
		});

		try {
			const result = await this._executeWithTimeout(
				() => this.client!.callTool({ name, arguments: args }),
				timeout,
				`Tool execution timeout: ${name}`
			);

			this.logger.info(`${LOG_PREFIXES.TOOL} Tool executed successfully: ${name}`, {
				toolName: name,
				serverName: this.serverName,
			});

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${LOG_PREFIXES.TOOL} ${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${name}`, {
				toolName: name,
				serverName: this.serverName,
				error: errorMessage,
			});
			throw new Error(`${ERROR_MESSAGES.TOOL_EXECUTION_FAILED}: ${errorMessage}`);
		}
	}

	/**
	 * Get all tools provided by this client.
	 */
	async getTools(_allowRetry: boolean = true): Promise<ToolSet> {
	await this._lazyConnectIfNeeded();
	// Return cached tools if valid
	if (this.toolsCacheValid && this.cachedTools) {
		return this.cachedTools;
	}
	this._ensureConnected();

	const timeout = this._getOperationTimeout();

	const fetchTools = async (): Promise<ToolSet> => {
		return await withRetry(async () => {
			this.logger.debug(`${LOG_PREFIXES.TOOL} Starting listTools() call`, {
				serverName: this.serverName,
				timeout,
				clientConnected: this.connected,
				transportType: this.serverConfig?.type
			});

			const result = await this._executeWithTimeout(
				() => this.client!.listTools(),
				timeout,
				'List tools timeout'
			);

			this.logger.debug(`${LOG_PREFIXES.TOOL} listTools() successful`, {
				serverName: this.serverName,
				toolCount: result.tools.length,
				tools: result.tools.map(t => t.name)
			});

			const toolSet: ToolSet = {};
			result.tools.forEach(tool => {
				toolSet[tool.name] = {
					description: tool.description || '',
					parameters: tool.inputSchema as any,
				};
			});
			// Cache tools for subsequent requests
			this.cachedTools = toolSet;
			this.toolsCacheValid = true;
			return toolSet;
		}, MCP_RETRY_CONFIG);
	};

	try {
		return await fetchTools();
	} catch (error) {
		const errorMessage = error instanceof Error ? error.message : String(error);
		const rawError = this._safeStringifyError(error);

		this.logger.error(`${LOG_PREFIXES.TOOL} DEBUG: listTools() failed with detailed error`, {
			serverName: this.serverName,
			error: errorMessage,
			errorType: error instanceof Error ? error.constructor.name : 'Unknown',
			stack: error instanceof Error ? error.stack : undefined,
			clientConnected: this.connected,
			transportType: this.serverConfig?.type,
			timeout,
			rawError,
		});

		const reconnectConfig = this.serverConfig as McpServerConfig | null;
		const reconnectServerName = this.serverName;
		const reconnectHint = this._shouldAttemptReconnect(errorMessage);
		const shouldRetry = _allowRetry && reconnectConfig;

		if (shouldRetry) {
			this.logger.warn(`${LOG_PREFIXES.TOOL} Attempting reconnect after tool listing failure`, {
				serverName: this.serverName,
				error: errorMessage,
				rawError,
				reconnectHint,
			});

			try {
				await this._cleanup();
				await this.connect(reconnectConfig!, reconnectServerName);
				return await this.getTools(false);
			} catch (reconnectError) {
				const reconnectMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
				this.logger.error(`${LOG_PREFIXES.TOOL} Reconnect-and-retry failed while listing tools`, {
					serverName: this.serverName,
					error: reconnectMsg,
				});
			}
		} else {
			this.logger.warn(`${LOG_PREFIXES.TOOL} Retry skipped after tool listing failure`, {
				serverName: this.serverName,
				error: errorMessage,
				rawError,
				_allowRetry,
				hasServerConfig: !!reconnectConfig,
				reconnectHint,
			});
		}

		this.logger.error(`${LOG_PREFIXES.TOOL} Failed to list tools`, {
			serverName: this.serverName,
			error: errorMessage,
		});
		throw error;
	}
}

	/**
	 * List all prompts provided by this client.
	 */
	async listPrompts(_allowRetry: boolean = true): Promise<string[]> {
		await this._lazyConnectIfNeeded();
		this._ensureConnected();

		const timeout = this._getOperationTimeout();

		try {
			this.logger.info(`${LOG_PREFIXES.PROMPT} DEBUG: Starting listPrompts() call`, {
				serverName: this.serverName,
				timeout,
				clientConnected: this.connected,
				transportType: this.serverConfig?.type
			});

			const result = await withRetry(
				() => this._executeWithTimeout(
					() => this.client!.listPrompts(),
					timeout,
					'List prompts timeout'
				),
				MCP_RETRY_CONFIG
			);

			const promptNames = result.prompts.map(prompt => prompt.name);

			this.logger.info(`${LOG_PREFIXES.PROMPT} DEBUG: listPrompts() successful`, {
				serverName: this.serverName,
				promptCount: promptNames.length,
				prompts: promptNames
			});

			return promptNames;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const rawError = this._safeStringifyError(error);

			this.logger.error(`${LOG_PREFIXES.PROMPT} DEBUG: listPrompts() failed with detailed error`, {
				serverName: this.serverName,
				error: errorMessage,
				errorType: error instanceof Error ? error.constructor.name : 'Unknown',
				stack: error instanceof Error ? error.stack : undefined,
				clientConnected: this.connected,
				transportType: this.serverConfig?.type,
				timeout,
				rawError,
			});

			// Check if this is a "capability not supported" error (common for filesystem servers)
			const isCapabilityError =
				errorMessage.includes('not implemented') ||
				errorMessage.includes('not supported') ||
				errorMessage.includes('Method not found') ||
				errorMessage.includes('prompts') === false; // Some servers just don't respond to prompt requests

			if (isCapabilityError) {
				this.logger.debug(
					`${LOG_PREFIXES.PROMPT} Prompts not supported by server (this is normal)`,
					{
						serverName: this.serverName,
						reason: 'Server does not implement prompt capability',
					}
				);
				return []; // Return empty array instead of throwing
			}

			const reconnectConfig = this.serverConfig as McpServerConfig | null;
			const reconnectServerName = this.serverName;
			const reconnectHint = this._shouldAttemptReconnect(errorMessage);
			const shouldRetry = _allowRetry && reconnectConfig;

			if (shouldRetry) {
				this.logger.warn(`${LOG_PREFIXES.PROMPT} Attempting reconnect after prompt listing failure`, {
					serverName: reconnectServerName,
					error: errorMessage,
					rawError,
					reconnectHint,
				});
				try {
					await this._cleanup();
					await this.connect(reconnectConfig!, reconnectServerName);
					return await this.listPrompts(false);
				} catch (reconnectError) {
					const reconnectMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
					this.logger.error(`${LOG_PREFIXES.PROMPT} Reconnect-and-retry failed while listing prompts`, {
						serverName: reconnectServerName,
						error: reconnectMsg,
					});
				}
			} else {
				this.logger.warn(`${LOG_PREFIXES.PROMPT} Retry skipped after prompt listing failure`, {
					serverName: reconnectServerName,
					error: errorMessage,
					rawError,
					_allowRetry,
					hasServerConfig: !!reconnectConfig,
					reconnectHint,
				});
			}

			// Real error - log as error and throw
			this.logger.error(`${LOG_PREFIXES.PROMPT} Failed to list prompts`, {
				serverName: this.serverName,
				error: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * Get a prompt by name.
	 */
	async getPrompt(name: string, args?: any): Promise<GetPromptResult> {
		await this._lazyConnectIfNeeded();
		this._ensureConnected();

		const timeout = this._getOperationTimeout();

		this.logger.info(`${LOG_PREFIXES.PROMPT} Getting prompt: ${name}`, {
			promptName: name,
			serverName: this.serverName,
		});

		try {
			const result = await this._executeWithTimeout(
				() => this.client!.getPrompt({ name, arguments: args }),
				timeout,
				`Get prompt timeout: ${name}`
			);

			this.logger.info(`${LOG_PREFIXES.PROMPT} Retrieved prompt successfully: ${name}`, {
				promptName: name,
				serverName: this.serverName,
			});

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${LOG_PREFIXES.PROMPT} Failed to get prompt: ${name}`, {
				promptName: name,
				serverName: this.serverName,
				error: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * List all resources provided by this client.
	 */
	async listResources(_allowRetry: boolean = true): Promise<string[]> {
		await this._lazyConnectIfNeeded();
		this._ensureConnected();

		const timeout = this._getOperationTimeout();

		try {
			this.logger.info(`${LOG_PREFIXES.RESOURCE} DEBUG: Starting listResources() call`, {
				serverName: this.serverName,
				timeout,
				clientConnected: this.connected,
				transportType: this.serverConfig?.type
			});

			const result = await withRetry(
				() => this._executeWithTimeout(
					() => this.client!.listResources(),
					timeout,
					'List resources timeout'
				),
				MCP_RETRY_CONFIG
			);

			const resourceUris = result.resources.map(resource => resource.uri);

			this.logger.info(`${LOG_PREFIXES.RESOURCE} DEBUG: listResources() successful`, {
				serverName: this.serverName,
				resourceCount: resourceUris.length,
				resources: resourceUris
			});

			return resourceUris;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			const rawError = this._safeStringifyError(error);

			this.logger.error(`${LOG_PREFIXES.RESOURCE} DEBUG: listResources() failed with detailed error`, {
				serverName: this.serverName,
				error: errorMessage,
				errorType: error instanceof Error ? error.constructor.name : 'Unknown',
				stack: error instanceof Error ? error.stack : undefined,
				clientConnected: this.connected,
				transportType: this.serverConfig?.type,
				timeout,
				rawError,
			});

			// Check if this is a "capability not supported" error (common for filesystem servers)
			const isCapabilityError =
				errorMessage.includes('not implemented') ||
				errorMessage.includes('not supported') ||
				errorMessage.includes('Method not found') ||
				errorMessage.includes('resources') === false; // Some servers just don't respond to resource requests

			if (isCapabilityError) {
				this.logger.debug(
					`${LOG_PREFIXES.RESOURCE} Resources not supported by server (this is normal)`,
					{
						serverName: this.serverName,
						reason: 'Server does not implement resource capability',
					}
				);
				return []; // Return empty array instead of throwing
			}

			const reconnectConfig = this.serverConfig as McpServerConfig | null;
			const reconnectServerName = this.serverName;
			const reconnectHint = this._shouldAttemptReconnect(errorMessage);
			const shouldRetry = _allowRetry && reconnectConfig;

			if (shouldRetry) {
				this.logger.warn(`${LOG_PREFIXES.RESOURCE} Attempting reconnect after resource listing failure`, {
					serverName: reconnectServerName,
					error: errorMessage,
					rawError,
					reconnectHint,
				});
				try {
					await this._cleanup();
					await this.connect(reconnectConfig!, reconnectServerName);
					return await this.listResources(false);
				} catch (reconnectError) {
					const reconnectMsg = reconnectError instanceof Error ? reconnectError.message : String(reconnectError);
					this.logger.error(`${LOG_PREFIXES.RESOURCE} Reconnect-and-retry failed while listing resources`, {
						serverName: reconnectServerName,
						error: reconnectMsg,
					});
				}
			} else {
				this.logger.warn(`${LOG_PREFIXES.RESOURCE} Retry skipped after resource listing failure`, {
					serverName: reconnectServerName,
					error: errorMessage,
					rawError,
					_allowRetry,
					hasServerConfig: !!reconnectConfig,
					reconnectHint,
				});
			}

			// Real error - log as error and throw
			this.logger.error(`${LOG_PREFIXES.RESOURCE} Failed to list resources`, {
				serverName: this.serverName,
				error: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * Read a resource by URI.
	 */
	async readResource(uri: string): Promise<ReadResourceResult> {
		this._ensureConnected();
		await this._lazyConnectIfNeeded();

		const timeout = this._getOperationTimeout();

		this.logger.info(`${LOG_PREFIXES.RESOURCE} Reading resource: ${uri}`, {
			resourceUri: uri,
			serverName: this.serverName,
		});

		try {
			const result = await this._executeWithTimeout(
				() => this.client!.readResource({ uri }),
				timeout,
				`Read resource timeout: ${uri}`
			);

			this.logger.info(`${LOG_PREFIXES.RESOURCE} Read resource successfully: ${uri}`, {
				resourceUri: uri,
				serverName: this.serverName,
			});

			return result;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.logger.error(`${LOG_PREFIXES.RESOURCE} Failed to read resource: ${uri}`, {
				resourceUri: uri,
				serverName: this.serverName,
				error: errorMessage,
			});
			throw error;
		}
	}

	/**
	 * Get the connection status of the client.
	 */
	getConnectionStatus(): boolean {
		// Basic connection status
		if (!this.connected) {
			return false;
		}

			// For stdio connections, also check process health
			if (this.serverConfig && this.serverConfig.type === 'stdio' && this.serverInfo.spawned) {
				return this._isStdioProcessHealthy();
			}

		return this.connected;
	}

	private _isStdioProcessHealthy(): boolean {
		const LOG_PREFIX = '[MCP-CLIENT-HEALTH]';
		
		try {
			// Check if we have transport with process access
			const stdioTransport = this.transport as any;
			if (!stdioTransport?.process) {
				this.logger.warn(`${LOG_PREFIX} No process reference available for ${this.serverName}`);
				return false;
			}

			const process = stdioTransport.process;

			// Check if process was killed
			if (process.killed) {
				this.logger.warn(`${LOG_PREFIX} Process killed for ${this.serverName}`, {
					serverName: this.serverName,
					pid: process.pid,
					killed: process.killed,
					exitCode: process.exitCode
				});
				return false;
			}

			// Check exit code (null means still running, 0 means successful exit)
			if (process.exitCode !== null && process.exitCode !== 0) {
				this.logger.warn(`${LOG_PREFIX} Process exited with error code for ${this.serverName}`, {
					serverName: this.serverName,
					pid: process.pid,
					exitCode: process.exitCode
				});
				return false;
			}

			// Additional check: try to get process status via kill(0)
			// This is a non-destructive way to check if process is alive
			try {
				if (process.pid) {
					// kill(pid, 0) returns true if process exists, throws if not
					process.kill(0);
					this.logger.debug(`${LOG_PREFIX} Process health check passed for ${this.serverName}`, {
						serverName: this.serverName,
						pid: process.pid,
						killed: process.killed,
						exitCode: process.exitCode
					});
					return true;
				}
			} catch (error) {
				// Process doesn't exist anymore
				this.logger.warn(`${LOG_PREFIX} Process no longer exists for ${this.serverName}`, {
					serverName: this.serverName,
					pid: process.pid,
					error: (error as Error).message
				});
				return false;
			}

			// If we reach here, something is wrong
			this.logger.warn(`${LOG_PREFIX} Unable to determine process health for ${this.serverName}`);
			return false;

		} catch (error) {
			this.logger.error(`${LOG_PREFIX} Error checking process health for ${this.serverName}`, {
				serverName: this.serverName,
				error: (error as Error).message
			});
			return false;
		}
	}

	/**
	 * Get the underlying MCP client instance.
	 */
	getClient(): Client | null {
		return this.client;
	}

	/**
	 * Get information about the connected server.
	 */
	getServerInfo() {
		return { ...this.serverInfo };
	}

	/**
	 * Get the client instance once connected.
	 */
	async getConnectedClient(): Promise<Client> {
		if (this.connected && this.client) {
			return this.client;
		}

		if (this.connectionPromise) {
			return this.connectionPromise;
		}

		throw new Error(ERROR_MESSAGES.NOT_CONNECTED);
	}

	// ======================================================
	// Private Utility Methods
	// ======================================================

	/**
	 * Ensure the client is connected before performing operations.
	 */
	private _ensureConnected(): void {
		if (!this.connected || !this.client) {
			throw new Error(ERROR_MESSAGES.NOT_CONNECTED);
		}
	}

	/**
	 * Get the operation timeout from configuration or default.
	 */
	private _getOperationTimeout(config?: McpServerConfig): number {
		if (config?.timeout) {
			return config.timeout;
		}

		if (this.serverConfig?.timeout) {
			return this.serverConfig.timeout;
		}

		// Stdio-specific timeout strategies
		if (this.serverConfig?.type === 'stdio') {
			return this._getStdioAdaptiveTimeout();
		}

		// Check environment variable
		const envTimeout = process.env[ENV_VARS.GLOBAL_TIMEOUT];
		if (envTimeout) {
			const parsed = parseInt(envTimeout, 10);
			if (!isNaN(parsed) && parsed > 0) {
				return parsed;
			}
		}

		return DEFAULT_TIMEOUT_MS;
	}

	private _getStdioAdaptiveTimeout(): number {
		const config = this.serverConfig as StdioServerConfig;
		const serverName = this.serverName.toLowerCase();
		const command = config.command.toLowerCase();

		// Fast-startup servers (10s timeout)
		const fastServers = [
			'time',
			'echo',
			'date',
			'simple',
			'basic'
		];

		// Heavy servers (60s timeout)
		const heavyServers = [
			'langchain',
			'langgraph',
			'tensorflow',
			'pytorch',
			'docker',
			'kubernetes',
			'database',
			'postgres',
			'mysql',
			'mongodb',
			'elasticsearch',
			'redis',
			'neo4j'
		];

		// Check server name patterns
		for (const pattern of fastServers) {
			if (serverName.includes(pattern) || command.includes(pattern)) {
				this.logger.debug(`[MCP-TIMEOUT] Using fast timeout for ${this.serverName}`, {
					serverName: this.serverName,
					command: config.command,
					timeout: 10000,
					category: 'fast'
				});
				return 10000; // 10s
			}
		}

		for (const pattern of heavyServers) {
			if (serverName.includes(pattern) || command.includes(pattern)) {
				this.logger.debug(`[MCP-TIMEOUT] Using heavy timeout for ${this.serverName}`, {
					serverName: this.serverName,
					command: config.command,
					timeout: 60000,
					category: 'heavy'
				});
				return 60000; // 60s
			}
		}

		// Standard servers (30s timeout - current default)
		this.logger.debug(`[MCP-TIMEOUT] Using standard timeout for ${this.serverName}`, {
			serverName: this.serverName,
			command: config.command,
			timeout: DEFAULT_TIMEOUT_MS,
			category: 'standard'
		});
		return DEFAULT_TIMEOUT_MS; // 30s
	}

	/**
	 * Execute a function with timeout.
	 */
	private _safeStringifyError(error: unknown): string | undefined {
		try {
			if (error instanceof Error) {
				return JSON.stringify(error, Object.getOwnPropertyNames(error));
			}

			if (typeof error === 'object') {
				return JSON.stringify(error);
			}

			return String(error);
		} catch {
			return undefined;
		}
	}

	private _shouldAttemptReconnect(errorMessage: string): boolean {
		const lower = errorMessage.toLowerCase();

		return (
			lower.includes('session not found') ||
			lower.includes('http 404') ||
			lower.includes('timeout') ||
			lower.includes('connection reset') ||
			lower.includes('econnreset') ||
			lower.includes('socket hang up') ||
			lower.includes('connection refused') ||
			lower.includes('econnrefused') ||
			lower.includes('network error') ||
			lower.includes('fetch failed') ||
			lower.includes('connection closed') ||
			lower.includes('server disconnected')
		);
	}

	private async _executeWithTimeout<T>(
		operation: () => Promise<T>,
		timeout: number,
		timeoutMessage: string
	): Promise<T> {
		const startTime = Date.now();
		
		this.logger.info(`${LOG_PREFIXES.TOOL} DEBUG: Starting operation with timeout`, {
			serverName: this.serverName,
			timeout,
			timeoutMessage,
			transportType: this.serverConfig?.type
		});

		return new Promise((resolve, reject) => {
			const timeoutId = setTimeout(() => {
				const elapsed = Date.now() - startTime;
				this.logger.error(`${LOG_PREFIXES.TOOL} DEBUG: Operation timed out`, {
					serverName: this.serverName,
					timeout,
					elapsed,
					timeoutMessage,
					transportType: this.serverConfig?.type
				});
				reject(new Error(`${timeoutMessage} (${elapsed}ms elapsed)`));
			}, timeout);

			const cleanup = () => clearTimeout(timeoutId);

			operation()
				.then(result => {
					cleanup();
					const elapsed = Date.now() - startTime;
					this.logger.info(`${LOG_PREFIXES.TOOL} DEBUG: Operation completed successfully`, {
						serverName: this.serverName,
						elapsed,
						timeout,
						transportType: this.serverConfig?.type
					});
					resolve(result);
				})
				.catch(error => {
					cleanup();
					const elapsed = Date.now() - startTime;
					this.logger.error(`${LOG_PREFIXES.TOOL} DEBUG: Operation failed with error`, {
						serverName: this.serverName,
						elapsed,
						timeout,
						error: error instanceof Error ? error.message : String(error),
						errorType: error instanceof Error ? error.constructor.name : 'Unknown',
						transportType: this.serverConfig?.type
					});
					reject(error);
				});
		});
	}

	/**
	 * Resolve command path, handling bundled scripts and relative paths.
	 */
	private _resolveCommand(command: string): string {
		// If it's already an absolute path, return as-is
		if (path.isAbsolute(command)) {
			return command;
		}

		// Check if it's a relative path from current working directory
		const cwdPath = path.resolve(process.cwd(), command);
		if (fs.existsSync(cwdPath)) {
			return cwdPath;
		}

		// Check if it's a bundled script relative to module
		try {
			const moduleDir = path.dirname(fileURLToPath(import.meta.url));
			const bundledPath = path.resolve(moduleDir, '../../../', command);
			if (fs.existsSync(bundledPath)) {
				return bundledPath;
			}
		} catch {
			// Ignore errors from import.meta.url resolution
		}

		// Return original command (might be in PATH)
		return command;
	}

	/**
	 * Resolve arguments, performing any necessary path resolution.
	 */
	private _resolveArgs(args: string[]): string[] {
		return args.map(arg => {
			// If argument looks like a path (contains / or \), try to resolve it
			if (arg.includes('/') || arg.includes('\\')) {
				const resolved = this._resolveCommand(arg);
				return resolved;
			}
			return arg;
		});
	}

	/**
	 * Merge environment variables with current process environment.
	 */
	private _mergeEnvironment(configEnv: Record<string, string>): Record<string, string> {
		// Filter out undefined values from env and convert to proper process.env format
		const processEnv = Object.fromEntries(
			Object.entries(process.env).filter(([_, value]) => value !== undefined)
		) as Record<string, string>;

		return {
			...processEnv,
			...configEnv,
		};
	}

	/**
	 * Clean up resources and reset state.
	 */
	private async _cleanup(): Promise<void> {
		this.connected = false;
		
		// Invalidate tool cache on disconnect
		this.cachedTools = null;
		this.toolsCacheValid = false;

		if (this.client) {
			try {
				await this.client.close();
			} catch (_error) {
				// Log but don't throw cleanup errors
				this.logger.warn(`${LOG_PREFIXES.CONNECT} Error during client cleanup`, {
					error: _error instanceof Error ? _error.message : String(_error),
				});
			}
			this.client = null;
		}

		if (this.transport) {
			try {
				await this.transport.close();
			} catch (_error) {
				// Log but don't throw cleanup errors
				this.logger.warn(`${LOG_PREFIXES.CONNECT} Error during transport cleanup`, {
					error: _error instanceof Error ? _error.message : String(_error),
				});
			}
			this.transport = null;
		}

		// Reset server info
		this.serverInfo = {
			spawned: false,
			pid: null,
			command: null,
			originalArgs: null,
			resolvedArgs: null,
			env: null,
			alias: null,
		};

		this.serverConfig = null;
		this.serverName = '';
	}
}
