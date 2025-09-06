import { EnhancedPromptManager } from '../brain/systemPrompt/enhanced-manager.js';
import { ContextManager } from '../brain/llm/index.js';
import { MemAgentStateManager } from '../brain/memAgent/state-manager.js';
import { MCPManager } from '../mcp/manager.js';
import { SessionManager } from '../session/session-manager.js';
import { InternalToolManager } from '../brain/tools/manager.js';
import { UnifiedToolManager } from '../brain/tools/unified-tool-manager.js';
import { registerAllTools } from '../brain/tools/definitions/index.js';
import { logger } from '../logger/index.js';
import { AgentConfig } from '../brain/memAgent/config.js';
import { ServerConfigsSchema } from '../mcp/config.js';
import { ServerConfigs } from '../mcp/types.js';
import { EmbeddingManager } from '../brain/embedding/index.js';
import { VectorStoreManager, DualCollectionVectorManager } from '../vector_storage/index.js';
import { createLLMService } from '../brain/llm/services/factory.js';
import { createContextManager } from '../brain/llm/messages/factory.js';
import { ILLMService } from '../brain/llm/index.js';
import { getServiceCache, createServiceKey } from '../brain/memory/service-cache.js';
import {
	createVectorStoreFromEnv,
	createDualCollectionVectorStoreFromEnv,
	createMultiCollectionVectorStoreFromEnv,
} from '../vector_storage/factory.js';
import { KnowledgeGraphManager } from '../knowledge_graph/manager.js';
import { createKnowledgeGraphFromEnv } from '../knowledge_graph/factory.js';
import { EventManager } from '../events/event-manager.js';
import { EventPersistenceConfig } from '../events/persistence.js';
import { env } from '../env.js';
import { ProviderType } from '../brain/systemPrompt/interfaces.js';
import fs from 'fs';
import path from 'path';
import yaml from 'yaml';


export type AgentServices = {
	[key: string]: any;
	mcpManager: MCPManager;
	promptManager: EnhancedPromptManager;
	stateManager: MemAgentStateManager;
	sessionManager: SessionManager;
	internalToolManager: InternalToolManager;
	unifiedToolManager: UnifiedToolManager;
	embeddingManager?: EmbeddingManager;
	vectorStoreManager: VectorStoreManager | DualCollectionVectorManager;
	eventManager: EventManager;
	llmService?: ILLMService;
	contextManager?: any;
	knowledgeGraphManager?: KnowledgeGraphManager;
};

export async function createAgentServices(
	agentConfig: AgentConfig,
	appMode?: 'cli' | 'mcp' | 'api'
): Promise<AgentServices> {
	logger.info('FLOW_DEBUG: createAgentServices function ENTRY POINT called', {
		appMode,
		hasConfig: !!agentConfig,
		timestamp: new Date().toISOString()
	});
	let contextManager: ContextManager | undefined = undefined;
	// 1. Initialize agent config
	const config = agentConfig;

	// 1.1. Initialize event manager first (other services will use it)
	logger.debug('Initializing event manager...');

	// Use eventPersistence config if present, with environment variable overrides
	const eventPersistenceConfig = {
		...config.eventPersistence,
		// Support EVENT_PERSISTENCE_ENABLED env variable
		enabled:
			process.env.EVENT_PERSISTENCE_ENABLED === 'true' ||
			(config.eventPersistence?.enabled ?? false),
		// Support EVENT_PERSISTENCE_PATH env variable
		filePath: process.env.EVENT_PERSISTENCE_PATH || config.eventPersistence?.filePath,
	};

	// Support EVENT_FILTERING_ENABLED env variable
	const enableFiltering = process.env.EVENT_FILTERING_ENABLED === 'true';

	// Support EVENT_FILTERED_TYPES env variable (comma-separated)
	const filteredTypes = (process.env.EVENT_FILTERED_TYPES || '')
		.split(',')
		.map(s => s.trim())
		.filter(Boolean);

	const eventManager = new EventManager({
		enableLogging: true,
		enablePersistence: eventPersistenceConfig.enabled,
		enableFiltering,
		maxServiceListeners: 300,
		maxSessionListeners: 150,
		maxSessionHistorySize: 1000,
		sessionCleanupInterval: 300000, // 5 minutes
		// Pass through eventPersistenceConfig for use by persistence provider
		eventPersistenceConfig: eventPersistenceConfig as Partial<EventPersistenceConfig>,
	});

	// Register filter for filtered event types
	if (enableFiltering && filteredTypes.length > 0) {
		eventManager.registerFilter({
			name: 'env-filtered-types',
			description: 'Block event types from EVENT_FILTERED_TYPES',
			enabled: true,
			filter: event => !filteredTypes.includes(event.type),
		});
	}

	// Log event persistence configuration
	if (eventPersistenceConfig.enabled) {
		logger.info('Event persistence enabled', {
			storageType: eventPersistenceConfig.storageType || 'file',
			filePath: eventPersistenceConfig.filePath || './data/events',
			enabled: eventPersistenceConfig.enabled,
		});
	}

	// Emit cipher startup event
	eventManager.emitServiceEvent('cipher:started', {
		timestamp: Date.now(),
		version: process.env.npm_package_version || '1.0.0',
	});

	const mcpManager = new MCPManager();

	// Set event manager for connection lifecycle events
	mcpManager.setEventManager(eventManager);

	// Set quiet mode for CLI to reduce MCP logging noise
	if (appMode === 'cli') {
		mcpManager.setQuietMode(true);
	}

	// Parse and validate the MCP server configurations to ensure required fields are present
	// The ServerConfigsSchema.parse() will transform input types to output types with required fields
	const parsedMcpServers = ServerConfigsSchema.parse(config.mcpServers) as ServerConfigs;
	await mcpManager.initializeFromConfig(parsedMcpServers);

	const mcpServerCount = Object.keys(config.mcpServers || {}).length;
	if (mcpServerCount === 0) {
		if (appMode !== 'cli') {
			logger.debug('Agent initialized without MCP servers - only built-in capabilities available');
		}
	} else {
		if (appMode !== 'cli') {
			logger.debug(`Client manager initialized with ${mcpServerCount} MCP server(s)`);
		}
	}

	// Emit MCP manager initialization event
	eventManager.emitServiceEvent('cipher:serviceStarted', {
		serviceType: 'MCPManager',
		timestamp: Date.now(),
	});

	logger.info('FLOW_CHECK: After MCP initialization, before embedding');

	// 2. Initialize embedding manager with new fallback mechanism
	logger.info('EMBEDDING_INIT: Starting embedding manager initialization', { 
		appMode,
		hasEmbeddingConfig: !!config.embedding,
		embeddingConfigType: typeof config.embedding,
		embeddingConfigValue: config.embedding ? JSON.stringify(config.embedding, null, 2) : 'null'
	});
	if (appMode !== 'cli') {
		logger.debug('Initializing embedding manager...');
	}
	const embeddingManager = new EmbeddingManager();
	let embeddingEnabled = false;

	try {
		let embeddingResult: { embedder: any; info: any } | null = null;

		// Check if embeddings are explicitly disabled
		const explicitlyDisabled =
			(config.embedding &&
				typeof config.embedding === 'object' &&
				'disabled' in config.embedding &&
				config.embedding.disabled === true) ||
			config.embedding === null ||
			config.embedding === false ||
			process.env.DISABLE_EMBEDDINGS === 'true' ||
			process.env.EMBEDDING_DISABLED === 'true';

		logger.info('Embedding configuration analysis', {
			hasEmbeddingConfig: !!config.embedding,
			configType: typeof config.embedding,
			hasDisabledField: config.embedding && typeof config.embedding === 'object' && 'disabled' in config.embedding,
			disabledValue: config.embedding && typeof config.embedding === 'object' && 'disabled' in config.embedding ? (config.embedding as any).disabled : undefined,
			DISABLE_EMBEDDINGS: process.env.DISABLE_EMBEDDINGS,
			EMBEDDING_DISABLED: process.env.EMBEDDING_DISABLED,
			explicitlyDisabled
		});

		if (explicitlyDisabled) {
			logger.warn(
				'Embeddings are explicitly disabled - all embedding-dependent tools will be unavailable (chat-only mode)'
			);
			// Removed global embedding state -('Explicitly disabled in configuration');
			embeddingEnabled = false;
		} else {
			// Priority 1: Try explicit YAML embedding configuration if available
			if (
				config.embedding &&
				typeof config.embedding === 'object' &&
				!((config.embedding as any).disabled === true)
			) {
				logger.info('Found explicit embedding configuration in YAML, using it', {
					embeddingConfig: {
						type: (config.embedding as any).type,
						hasApiKey: !!(config.embedding as any).apiKey,
						model: (config.embedding as any).model,
						baseUrl: (config.embedding as any).baseUrl,
						disabled: (config.embedding as any).disabled
					}
				});

				// Validate API key for explicit embedding config
				const embeddingConfig = config.embedding as any;
				const needsApiKey = ['openai', 'gemini', 'anthropic', 'voyage', 'qwen', 'codestral'].includes(
					embeddingConfig.type
				);
				const needsAwsCredentials = embeddingConfig.type === 'aws-bedrock';

				if (needsApiKey) {
					const apiKey =
					embeddingConfig.apiKey || process.env[embeddingConfig.type === 'codestral' ? 'MISTRAL_API_KEY' : `${embeddingConfig.type.toUpperCase()}_API_KEY`];
				
				logger.info('API key resolution for embedding', {
					embeddingType: embeddingConfig.type,
					hasConfigApiKey: !!embeddingConfig.apiKey,
					configApiKeyLength: embeddingConfig.apiKey ? embeddingConfig.apiKey.length : 0,
					envKeyName: embeddingConfig.type === 'codestral' ? 'MISTRAL_API_KEY' : `${embeddingConfig.type.toUpperCase()}_API_KEY`,
					hasEnvApiKey: !!process.env[embeddingConfig.type === 'codestral' ? 'MISTRAL_API_KEY' : `${embeddingConfig.type.toUpperCase()}_API_KEY`],
					finalApiKeyLength: apiKey ? apiKey.length : 0
				});
					if (!apiKey || apiKey.trim() === '') {
						logger.debug(
							`No API key available for explicit ${embeddingConfig.type} embedding config - switching to chat-only mode`
						);
						// API key not provided for explicit embedding config
						embeddingResult = null;
					} else {
						// Create a clean config object similar to the fallback logic
						const cleanEmbeddingConfig = {
							type: embeddingConfig.type,
							apiKey,
							model: embeddingConfig.model || 'text-embedding-3-small',
							baseUrl: embeddingConfig.baseUrl,
							organization: embeddingConfig.organization,
							timeout: embeddingConfig.timeout || 30000,
							maxRetries: embeddingConfig.maxRetries || 3,
							dimensions: embeddingConfig.dimensions,
						};
						
						logger.info('EMBEDDING_DEBUG: About to call createEmbedderFromConfig', {
							cleanConfig: {
								type: cleanEmbeddingConfig.type,
								hasApiKey: !!cleanEmbeddingConfig.apiKey,
								apiKeyLength: cleanEmbeddingConfig.apiKey?.length,
								model: cleanEmbeddingConfig.model,
								baseUrl: cleanEmbeddingConfig.baseUrl,
								dimensions: cleanEmbeddingConfig.dimensions,
								timeout: cleanEmbeddingConfig.timeout,
								maxRetries: cleanEmbeddingConfig.maxRetries
							}
						});
						
						try {
							embeddingResult = await embeddingManager.createEmbedderFromConfig(
								cleanEmbeddingConfig,
								'default'
							);
							
							logger.info('EMBEDDING_DEBUG: createEmbedderFromConfig result', {
								hasResult: !!embeddingResult,
								resultType: typeof embeddingResult,
								resultKeys: embeddingResult ? Object.keys(embeddingResult) : null
							});
						} catch (createError) {
							logger.error('EMBEDDING_DEBUG: createEmbedderFromConfig failed', {
								error: createError instanceof Error ? createError.message : String(createError),
								stack: createError instanceof Error ? createError.stack : undefined
							});
							embeddingResult = null;
						}
					}
				} else if (needsAwsCredentials) {
					const accessKeyId = embeddingConfig.accessKeyId || process.env.AWS_ACCESS_KEY_ID;
					const secretAccessKey =
						embeddingConfig.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY;
					console.log('accessKeyId', accessKeyId);
					console.log('secretAccessKey', secretAccessKey);
					if (
						!accessKeyId ||
						accessKeyId.trim() === '' ||
						!secretAccessKey ||
						secretAccessKey.trim() === ''
					) {
						logger.debug(
							'No AWS credentials available for explicit aws-bedrock embedding config - switching to chat-only mode'
						);
						// AWS credentials not available
						embeddingResult = null;
					} else {
						embeddingResult = await embeddingManager.createEmbedderFromConfig(
							embeddingConfig,
							'default'
						);
					}
				} else {
					// Ollama, LM Studio - no API key needed
					embeddingResult = await embeddingManager.createEmbedderFromConfig(
						embeddingConfig,
						'default'
					);
				}
			}

			// Strict validation: no fallbacks allowed
			if (!embeddingResult) {
				throw new Error(
					'Embedding configuration required but not found. Please add explicit "embedding" configuration to XInfty.yml or set DISABLE_EMBEDDINGS=true to disable embedding features.'
				);
			}

			if (embeddingResult) {
				if (appMode !== 'cli') {
					logger.info('Embedding manager initialized successfully', {
						provider: embeddingResult.info.provider,
						model: embeddingResult.info.model,
						dimension: embeddingResult.info.dimension,
					});
				}

				// Emit embedding manager initialization event
				eventManager.emitServiceEvent('cipher:serviceStarted', {
					serviceType: 'EmbeddingManager',
					timestamp: Date.now(),
				});
				embeddingEnabled = true;
			} else {
				logger.warn(
					'No embedding configuration available - embedding-dependent tools will be disabled (chat-only mode)'
				);
				embeddingEnabled = false;
			}
		}
	} catch (error) {
		logger.error('Failed to initialize embedding manager - configuration failed', {
			error: error instanceof Error ? error.message : String(error),
		});
		embeddingEnabled = false;
		// EmbeddingManager instance remains available in services, but disabled
	}

	// 3. Initialize vector storage manager with configuration
	// Use dual collection manager if reflection memory is enabled, otherwise use regular manager
	if (appMode !== 'cli') {
		logger.debug('Initializing vector storage manager...');
	}

	let vectorStoreManager: VectorStoreManager | DualCollectionVectorManager | any; // MultiCollectionVectorManager

	try {
		// Check workspace memory first, then reflection memory to determine which manager to use
		const workspaceEnabled = !!env.USE_WORKSPACE_MEMORY;
		const reflectionEnabled =
			!env.DISABLE_REFLECTION_MEMORY &&
			env.REFLECTION_VECTOR_STORE_COLLECTION &&
			env.REFLECTION_VECTOR_STORE_COLLECTION.trim() !== '';

		if (workspaceEnabled) {
			logger.debug('Workspace memory enabled, using multi collection vector manager');
			const { manager } = await createMultiCollectionVectorStoreFromEnv(config);
			vectorStoreManager = manager;

			// Set event manager for memory operation events
			(vectorStoreManager as any).setEventManager(eventManager);

			const info = (vectorStoreManager as any).getInfo();
			logger.debug('Multi collection vector storage manager initialized successfully', {
				backend: info.knowledge.manager.getInfo().backend.type,
				knowledgeCollection: info.knowledge.collectionName,
				reflectionCollection: info.reflection.enabled ? info.reflection.collectionName : 'disabled',
				workspaceCollection: info.workspace.enabled ? info.workspace.collectionName : 'disabled',
				dimension: info.knowledge.manager.getInfo().backend.dimension,
				knowledgeConnected: info.knowledge.connected,
				reflectionConnected: info.reflection.connected,
				workspaceConnected: info.workspace.connected,
				reflectionEnabled: info.reflection.enabled,
				workspaceEnabled: info.workspace.enabled,
			});
		} else if (reflectionEnabled) {
			logger.debug('Reflection memory enabled, using dual collection vector manager');
			const { manager } = await createDualCollectionVectorStoreFromEnv(config);
			vectorStoreManager = manager;

			// Set event manager for memory operation events
			(vectorStoreManager as DualCollectionVectorManager).setEventManager(eventManager);

			const info = (vectorStoreManager as DualCollectionVectorManager).getInfo();
			logger.debug('Dual collection vector storage manager initialized successfully', {
				backend: info.knowledge.manager.getInfo().backend.type,
				knowledgeCollection: info.knowledge.collectionName,
				reflectionCollection: info.reflection.collectionName,
				dimension: info.knowledge.manager.getInfo().backend.dimension,
				knowledgeConnected: info.knowledge.connected,
				reflectionConnected: info.reflection.connected,
				reflectionEnabled: info.reflection.enabled,
			});
		} else {
			logger.debug('Reflection memory disabled, using single collection vector manager');
			const { manager } = await createVectorStoreFromEnv(config);
			vectorStoreManager = manager;

			// Set event manager for memory operation events
			(vectorStoreManager as VectorStoreManager).setEventManager(eventManager);

			logger.debug('Vector storage manager initialized successfully', {
				backend: vectorStoreManager.getInfo().backend.type,
				collection: vectorStoreManager.getInfo().backend.collectionName,
				dimension: vectorStoreManager.getInfo().backend.dimension,
				fallback: vectorStoreManager.getInfo().backend.fallback || false,
			});
		}
	} catch (error) {
		logger.warn('Failed to initialize vector storage manager', {
			error: error instanceof Error ? error.message : String(error),
		});
		logger.warn(error instanceof Error ? error.message : String(error));
		// Fallback to regular manager in case of error
		const { manager } = await createVectorStoreFromEnv(config);
		vectorStoreManager = manager;
	}

	// 4. Initialize knowledge graph manager with configuration
	if (appMode !== 'cli') {
		logger.debug('Initializing knowledge graph manager...');
	}
	let knowledgeGraphManager: KnowledgeGraphManager | undefined = undefined;

	try {
		const kgFactory = await createKnowledgeGraphFromEnv();
		if (kgFactory) {
			knowledgeGraphManager = kgFactory.manager;
			logger.debug('Knowledge graph manager initialized successfully', {
				backend: knowledgeGraphManager.getInfo().backend.type,
				connected: knowledgeGraphManager.isConnected(),
				// fallback: knowledgeGraphManager.getInfo().backend.fallback || false,
			});
		} else {
			logger.debug('Knowledge graph is disabled in environment configuration');
		}
	} catch (error) {
		logger.warn('Failed to initialize knowledge graph manager', {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// 5. Initialize prompt manager
	// --- BEGIN MERGE ADVANCED PROMPT CONFIG ---
	const promptManager = new EnhancedPromptManager();

	// Load static provider from XInfty.yml
	let staticProvider: any = null;
	if (config.systemPrompt) {
		let enabled = true;
		let content = '';
		if (typeof config.systemPrompt === 'string') {
			content = config.systemPrompt;
		} else if (typeof config.systemPrompt === 'object' && config.systemPrompt !== null) {
			const promptObj = config.systemPrompt as any;
			enabled = promptObj.enabled !== false && promptObj.enabled !== undefined;
			content = promptObj.content || '';
		}
		staticProvider = {
			name: 'user-instruction',
			type: ProviderType.STATIC,
			priority: 100,
			enabled,
			config: { content },
		};
	}

	// Load providers from cipher-advanced-prompt.yml
	let advancedProviders: any[] = [];
	let advancedSettings: any = {};
	const advancedPromptPath = path.resolve(process.cwd(), 'memAgent/cipher-advanced-prompt.yml');
	if (fs.existsSync(advancedPromptPath)) {
		const fileContent = fs.readFileSync(advancedPromptPath, 'utf8');
		const parsed = yaml.parse(fileContent);
		if (Array.isArray(parsed.providers)) {
			advancedProviders = parsed.providers;
		}
		if (parsed.settings) {
			advancedSettings = parsed.settings;
		}
	}

	// Merge providers: staticProvider (from XInfty.yml) + advancedProviders (from cipher-advanced-prompt.yml)
	const mergedProviders = [
		...(staticProvider ? [staticProvider] : []),
		...advancedProviders.filter(p => !staticProvider || p.name !== staticProvider.name),
	];

	// DEBUG: Print merged provider list (skip in MCP mode to avoid stdout contamination)
	// Removed verbose logging for cleaner output

	// Merge settings: advancedSettings takes precedence, fallback to default
	const mergedSettings = {
		maxGenerationTime: 10000,
		failOnProviderError: false,
		contentSeparator: '\n\n',
		...advancedSettings,
	};

	const mergedPromptConfig = {
		providers: mergedProviders,
		settings: mergedSettings,
	};

	await promptManager.initialize(mergedPromptConfig);
	// --- END MERGE ADVANCED PROMPT CONFIG ---

	// 6. Initialize state manager for runtime state tracking
	const stateManager = new MemAgentStateManager(config);
	if (appMode !== 'cli') {
		logger.debug('Agent state manager initialized');
	}

	// 7. Initialize LLM service
	let llmService: ILLMService | undefined = undefined;
	try {
		if (appMode !== 'cli') {
			logger.debug('Initializing LLM service...');
		}
		const llmConfig = stateManager.getLLMConfig();
		// Use ServiceCache for ContextManager to prevent duplicate creation
		const serviceCache = getServiceCache();
		const contextManagerKey = createServiceKey('contextManager', {
			provider: llmConfig.provider,
			model: llmConfig.model,
			// Include additional config for proper cache key differentiation
			apiKey: llmConfig.apiKey ? 'present' : 'missing',
			baseURL: llmConfig.baseURL || 'default',
		});

		contextManager = await serviceCache.getOrCreate(contextManagerKey, async () => {
			return createContextManager(llmConfig, promptManager, undefined, undefined);
		});
		llmService = createLLMService(llmConfig, mcpManager, contextManager);
		if (appMode !== 'cli') {
			logger.info('LLM service initialized successfully', {
				provider: llmConfig.provider,
				model: llmConfig.model,
			});
		}

		// Inject llmService into promptManager for dynamic providers
		promptManager.setLLMService(llmService);
	} catch (error) {
		logger.warn('Failed to initialize LLM service', {
			error: error instanceof Error ? error.message : String(error),
		});
	}

	// 8. Prepare session manager configuration
	const sessionConfig: { maxSessions?: number; sessionTTL?: number } = {};
	if (config.sessions?.maxSessions !== undefined) {
		sessionConfig.maxSessions = config.sessions.maxSessions;
	}
	if (config.sessions?.sessionTTL !== undefined) {
		sessionConfig.sessionTTL = config.sessions.sessionTTL;
	}

	// 9. Initialize internal tool manager
	const internalToolManager = new InternalToolManager({
		enabled: true,
		timeout: 30000,
		enableCache: true,
		cacheTimeout: 300000,
	});

	await internalToolManager.initialize();

	// Set event manager for internal tool execution events
	internalToolManager.setEventManager(eventManager);

	// Register all internal tools
	const toolRegistrationResult = await registerAllTools(internalToolManager, { embeddingEnabled });
	// Only log tool registration results if there are failures or in non-CLI mode
	if (appMode !== 'cli' || toolRegistrationResult.failed.length > 0) {
		logger.info('Internal tools registration completed', {
			totalTools: toolRegistrationResult.total,
			registered: toolRegistrationResult.registered.length,
			failed: toolRegistrationResult.failed.length,
		});
	}

	if (toolRegistrationResult.failed.length > 0) {
		logger.warn('Some internal tools failed to register', {
			failedTools: toolRegistrationResult.failed,
		});
	}

	// Configure the internal tool manager with services for advanced tools
	// Only include embeddingManager if embeddings are enabled
	const services: any = {
		vectorStoreManager,
		llmService,
		knowledgeGraphManager,
	};

	if (embeddingEnabled) {
		services.embeddingManager = embeddingManager;
	}

	internalToolManager.setServices(services);

	// 10. Initialize unified tool manager with proper mode handling
	let unifiedToolManagerConfig: any;

	if (appMode === 'cli') {
		// CLI Mode: Only search tools accessible to Core_Team-cipher's LLM, background tools executed separately
		unifiedToolManagerConfig = {
			enableInternalTools: true,
			enableMcpTools: true,
			conflictResolution: 'prefix-internal',
			mode: 'cli', // Special CLI mode
		};
	} else if (appMode === 'mcp') {
		// MCP Mode: Configure based on MCP_SERVER_MODE
		const mcpServerMode = process.env.MCP_SERVER_MODE || 'default';

		if (mcpServerMode === 'aggregator') {
			// Aggregator mode: Use aggregator mode for unified tool manager to expose all tools
			unifiedToolManagerConfig = {
				enableInternalTools: true,
				enableMcpTools: true,
				conflictResolution: 'prefix-internal',
				mode: 'aggregator', // Aggregator mode exposes all tools without filtering
			};
		} else {
			// Default MCP mode: Use cli mode internally for agent access to all tools
			// External MCP exposure is controlled separately in mcp_handler.ts
			unifiedToolManagerConfig = {
				enableInternalTools: true,
				enableMcpTools: true,
				conflictResolution: 'prefix-internal',
				mode: 'cli', // Internal agent needs access to all tools in default mode
			};
		}
	} else {
		// API Mode: Respect MCP_SERVER_MODE like MCP mode does
		const mcpServerMode = process.env.MCP_SERVER_MODE || 'default';

		if (mcpServerMode === 'aggregator') {
			// Aggregator mode: Use aggregator mode for unified tool manager to expose all tools
			unifiedToolManagerConfig = {
				enableInternalTools: true,
				enableMcpTools: true,
				conflictResolution: 'prefix-internal',
				mode: 'aggregator', // Aggregator mode exposes all tools without filtering
			};
		} else {
			// Default API mode: Similar to CLI
			unifiedToolManagerConfig = {
				enableInternalTools: true,
				enableMcpTools: true,
				conflictResolution: 'prefix-internal',
				mode: 'api',
			};
		}
	}

	const unifiedToolManager = new UnifiedToolManager(
		mcpManager,
		internalToolManager,
		unifiedToolManagerConfig
	);

	// Set event manager for tool execution events
	unifiedToolManager.setEventManager(eventManager);

	// Set embedding manager for embedding status checking
	if (embeddingManager) {
		unifiedToolManager.setEmbeddingManager(embeddingManager);
	}

	if (appMode !== 'cli') {
		logger.debug('Unified tool manager initialized');
	}

	// 11. Create session manager with unified tool manager
	const sessionManager = new SessionManager(
		{
			stateManager,
			promptManager,
			contextManager,
			mcpManager,
			unifiedToolManager,
			eventManager,
			...(embeddingManager && { embeddingManager }), // Only include if available
		},
		sessionConfig
	);

	// Initialize the session manager with persistent storage
	await sessionManager.init();

	if (appMode !== 'cli') {
		logger.debug('Session manager with unified tools initialized');
	}

	// Emit session manager initialization event
	eventManager.emitServiceEvent('cipher:serviceStarted', {
		serviceType: 'SessionManager',
		timestamp: Date.now(),
	});

	// 12. Return the core services
	const agentServices: AgentServices = {
		mcpManager,
		promptManager,
		stateManager,
		sessionManager,
		internalToolManager,
		unifiedToolManager,
		vectorStoreManager,
		eventManager,
		contextManager,
		llmService: llmService || {
			generate: async () => '',
			directGenerate: async () => '',
			getAllTools: async () => ({}),
			getConfig: () => ({ provider: 'unknown', model: 'unknown' }),
		},
	};

	// Only include embeddingManager if embeddings are enabled
	if (embeddingEnabled) {
		agentServices.embeddingManager = embeddingManager;
	}

	// Only include knowledgeGraphManager when it's defined
	if (knowledgeGraphManager) {
		agentServices.knowledgeGraphManager = knowledgeGraphManager;
	}

	// Emit all services ready event
	const serviceTypes = Object.keys(agentServices).filter(
		key => agentServices[key as keyof AgentServices]
	);
	eventManager.emitServiceEvent('cipher:allServicesReady', {
		timestamp: Date.now(),
		services: serviceTypes,
	});

	return agentServices;
}
