/**
 * Tests for AggregatorMCPManager and related functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AggregatorMCPManager } from '../aggregator.js';
import type { AggregatorConfig, ToolSet } from '../types.js';

// Mock the logger
vi.mock('../../logger/index.js', () => ({
	createLogger: () => ({
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	}),
}));

// Mock the MCP SDK
vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
	Server: vi.fn().mockImplementation(() => ({
		setRequestHandler: vi.fn(),
		connect: vi.fn(),
		close: vi.fn(),
	})),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
	StdioServerTransport: vi.fn(),
}));

describe('AggregatorMCPManager', () => {
	let aggregator: AggregatorMCPManager;
	let mockConfig: AggregatorConfig;

	beforeEach(() => {
		aggregator = new AggregatorMCPManager();
		mockConfig = {
			type: 'aggregator',
			servers: {
				server1: {
					type: 'stdio',
					command: 'node',
					args: ['server1.js'],
				},
				server2: {
					type: 'stdio',
					command: 'node',
					args: ['server2.js'],
				},
			},
			conflictResolution: 'prefix',
			autoDiscovery: false,
		};
	});

	afterEach(async () => {
		try {
			await aggregator.stopServer();
		} catch {
			// Ignore errors during cleanup
		}
	});

	describe('Tool Conflict Resolution', () => {
		it('should handle prefix strategy correctly', async () => {
			// Create mock clients with conflicting tools
			const mockClient1 = createMockClient({
				'duplicate-tool': {
					description: 'Tool from server 1',
					parameters: { type: 'object', properties: {} },
				},
			});

			const mockClient2 = createMockClient({
				'duplicate-tool': {
					description: 'Tool from server 2',
					parameters: { type: 'object', properties: {} },
				},
			});

			// Register clients
			aggregator.registerClient('server1', mockClient1);
			aggregator.registerClient('server2', mockClient2);

			// Get all tools and check conflict resolution
			const tools = await aggregator.getAllTools();

			// Should have both tools with prefixed names
			expect(tools).toHaveProperty('duplicate-tool');
			expect(tools).toHaveProperty('server2.duplicate-tool');
			expect(Object.keys(tools)).toHaveLength(2);
		});

                it('should skip registering conflicting tools when using first-wins strategy', async () => {
                        const configFirstWins: AggregatorConfig = {
                                ...mockConfig,
                                conflictResolution: 'first-wins',
                        };

                        aggregator = new AggregatorMCPManager();

                        const mockClient1 = createMockClient({
                                'duplicate-tool': {
                                        description: 'Tool from server 1',
                                        parameters: { type: 'object', properties: {} },
                                },
                        });

                        const mockClient2 = createMockClient({
                                'duplicate-tool': {
                                        description: 'Tool from server 2',
                                        parameters: { type: 'object', properties: {} },
                                },
                        });

                        aggregator.registerClient('server1', mockClient1);
                        aggregator.registerClient('server2', mockClient2);

                        // Mock the config on the aggregator
                        (aggregator as any).config = configFirstWins;

                        const tools = await aggregator.getAllTools();

                        expect(Object.keys(tools)).toHaveLength(1);
                        expect(Object.keys(tools)).toContain('duplicate-tool');
                        expect(Object.keys(tools)).not.toContain('server2.duplicate-tool');
                        expect(tools['duplicate-tool']?.description).toBe('Tool from server 1');

                        const registry = aggregator.getToolRegistry();
                        expect(registry.size).toBe(1);

                        const aggregatedMap = (aggregator as any).aggregatedToolMap as Map<string, any>;
                        expect(aggregatedMap.size).toBe(1);

                        const stats = aggregator.getStats();
                        expect(stats.conflicts).toBe(1);
                });

                it('should return existing registration details for first-wins conflicts', () => {
                        const configFirstWins: AggregatorConfig = {
                                ...mockConfig,
                                conflictResolution: 'first-wins',
                        };

                        aggregator = new AggregatorMCPManager();
                        (aggregator as any).config = configFirstWins;

                        const timestamp = Date.now();
                        (aggregator as any).toolRegistry.set('duplicate-tool', {
                                tool: {
                                        description: 'Tool from server 1',
                                        parameters: { type: 'object', properties: {} },
                                },
                                clientName: 'server1',
                                originalName: 'duplicate-tool',
                                registeredName: 'duplicate-tool',
                                timestamp,
                        });

                        const result = (aggregator as any)._resolveToolNameConflict('duplicate-tool', 'server2', {
                                description: 'Tool from server 2',
                                parameters: { type: 'object', properties: {} },
                        });

                        expect(result).toEqual({ resolvedName: 'duplicate-tool', shouldRegister: false });
                        const registry = (aggregator as any).toolRegistry as Map<string, any>;
                        expect(registry.size).toBe(1);
                });

		it('should handle error strategy correctly', async () => {
			// Test the conflict resolution method directly since the full flow clears registry
			const configError: AggregatorConfig = {
				...mockConfig,
				conflictResolution: 'error',
			};

			aggregator = new AggregatorMCPManager();
			(aggregator as any).config = configError;

			// Pre-populate the registry to simulate existing tool
			(aggregator as any).toolRegistry.set('duplicate-tool', {
				tool: {
					description: 'Tool from server 1',
					parameters: { type: 'object', properties: {} },
				},
				clientName: 'server1',
				originalName: 'duplicate-tool',
				registeredName: 'duplicate-tool',
				timestamp: Date.now(),
			});

			// Test the conflict resolution method directly
			expect(() => {
				(aggregator as any)._resolveToolNameConflict('duplicate-tool', 'server2', {
					description: 'Tool from server 2',
					parameters: { type: 'object', properties: {} },
				});
			}).toThrow(/Tool name conflict/);
		});
	});

	describe('Tool Registry', () => {
		it('should maintain tool registry with metadata', async () => {
			const mockClient = createMockClient({
				'test-tool': {
					description: 'Test tool',
					parameters: { type: 'object', properties: {} },
				},
			});

			aggregator.registerClient('test-server', mockClient);
			await aggregator.getAllTools();

			const registry = aggregator.getToolRegistry();
			expect(registry.size).toBe(1);

			const entry = registry.get('test-tool');
			expect(entry).toBeDefined();
			expect(entry?.clientName).toBe('test-server');
			expect(entry?.originalName).toBe('test-tool');
			expect(entry?.registeredName).toBe('test-tool');
			expect(entry?.tool.description).toBe('Test tool');
		});

		it('should track conflicts in registry', async () => {
			const mockClient1 = createMockClient({
				'conflict-tool': {
					description: 'Tool 1',
					parameters: { type: 'object', properties: {} },
				},
			});

			const mockClient2 = createMockClient({
				'conflict-tool': {
					description: 'Tool 2',
					parameters: { type: 'object', properties: {} },
				},
			});

			aggregator.registerClient('server1', mockClient1);
			aggregator.registerClient('server2', mockClient2);

			await aggregator.getAllTools();

			const registry = aggregator.getToolRegistry();
			expect(registry.size).toBe(2);

			// Check that registry contains both tools with correct metadata
			const tool1 = registry.get('conflict-tool');
			const tool2 = registry.get('server2.conflict-tool');

			expect(tool1?.clientName).toBe('server1');
			expect(tool2?.clientName).toBe('server2');
			expect(tool1?.originalName).toBe('conflict-tool');
			expect(tool2?.originalName).toBe('conflict-tool');
		});
	});

	describe('Statistics', () => {
		it('should provide accurate statistics', async () => {
			const mockClient1 = createMockClient({
				tool1: {
					description: 'Tool 1',
					parameters: { type: 'object', properties: {} },
				},
			});

			const mockClient2 = createMockClient({
				tool2: {
					description: 'Tool 2',
					parameters: { type: 'object', properties: {} },
				},
			});

			aggregator.registerClient('server1', mockClient1);
			aggregator.registerClient('server2', mockClient2);

			await aggregator.getAllTools();

			const stats = aggregator.getStats();

			expect(stats.connectedServers).toBe(2);
			expect(stats.totalTools).toBe(2);
			expect(stats.conflicts).toBe(0);
			expect(stats.uptime).toBeGreaterThanOrEqual(0);
		});

		it('should track conflicts in statistics', async () => {
			const mockClient1 = createMockClient({
				'conflict-tool': {
					description: 'Tool 1',
					parameters: { type: 'object', properties: {} },
				},
			});

			const mockClient2 = createMockClient({
				'conflict-tool': {
					description: 'Tool 2',
					parameters: { type: 'object', properties: {} },
				},
			});

			aggregator.registerClient('server1', mockClient1);
			aggregator.registerClient('server2', mockClient2);

			await aggregator.getAllTools();

			const stats = aggregator.getStats();
			expect(stats.conflicts).toBe(1);
		});
	});

        describe('Tool Execution', () => {
                it('should route tool execution to correct client', async () => {
                        const executeMock = vi.fn().mockResolvedValue({ result: 'success' });
                        const mockClient = createMockClient(
                                {
					'test-tool': {
						description: 'Test tool',
						parameters: { type: 'object', properties: {} },
                                        },
                                },
                                executeMock
                        );

                        aggregator.registerClient('test-server', mockClient);

                        await aggregator.getAllTools();

                        const result = await aggregator.executeTool('test-tool', { arg: 'value' });

                        expect(executeMock).toHaveBeenCalledWith('test-tool', { arg: 'value' });
                        expect(result).toEqual({ result: 'success' });
                });

                it('should handle tool execution errors', async () => {
			const executeMock = vi.fn().mockRejectedValue(new Error('Execution failed'));
			const mockClient = createMockClient(
				{
					'failing-tool': {
						description: 'Failing tool',
						parameters: { type: 'object', properties: {} },
                                        },
                                },
                                executeMock
                        );

                        aggregator.registerClient('test-server', mockClient);

                        await aggregator.getAllTools();

                        await expect(aggregator.executeTool('failing-tool', {})).rejects.toThrow('Execution failed');
                });

                it('should pass original tool name when using aggregated aliases', async () => {
                        const executeMock1 = vi.fn().mockResolvedValue({ result: 'one' });
                        const executeMock2 = vi.fn().mockResolvedValue({ result: 'two' });

                        const mockClient1 = createMockClient(
                                {
                                        'shared-tool': {
                                                description: 'Shared tool 1',
                                                parameters: { type: 'object', properties: {} },
                                        },
                                },
                                executeMock1
                        );

                        const mockClient2 = createMockClient(
                                {
                                        'shared-tool': {
                                                description: 'Shared tool 2',
                                                parameters: { type: 'object', properties: {} },
                                        },
                                },
                                executeMock2
                        );

                        aggregator.registerClient('server1', mockClient1);
                        aggregator.registerClient('server2', mockClient2);

                        await aggregator.getAllTools();

                        await aggregator.executeTool('shared-tool', { origin: 1 });
                        await aggregator.executeTool('server2.shared-tool', { origin: 2 });

                        expect(executeMock1).toHaveBeenCalledWith('shared-tool', { origin: 1 });
                        expect(executeMock2).toHaveBeenCalledWith('shared-tool', { origin: 2 });
                });

                it('should rebuild tool mapping when cache is cleared', async () => {
                        const executeMock = vi.fn().mockResolvedValue({ result: 'refresh' });
                        const mockClient = createMockClient(
                                {
                                        'refresh-tool': {
                                                description: 'Refresh tool',
                                                parameters: { type: 'object', properties: {} },
                                        },
                                },
                                executeMock
                        );

                        aggregator.registerClient('refresh-server', mockClient);

                        await aggregator.getAllTools();

                        (aggregator as any).aggregatedToolMap.clear();

                        const result = await aggregator.executeTool('refresh-tool', { value: true });

                        expect(mockClient.getTools).toHaveBeenCalledTimes(2);
                        expect(executeMock).toHaveBeenCalledWith('refresh-tool', { value: true });
                        expect(result).toEqual({ result: 'refresh' });
                });
        });

	describe('Server Discovery', () => {
		it('should return empty config for discovery (not yet implemented)', async () => {
			const discovered = await aggregator.discoverServers();
			expect(discovered).toEqual({});
		});
	});
});

// Helper function to create mock MCP clients
function createMockClient(tools: ToolSet, executeMock?: any): any {
	return {
		getTools: vi.fn().mockResolvedValue(tools),
		callTool: executeMock || vi.fn(),
		listPrompts: vi.fn().mockResolvedValue([]),
		getPrompt: vi.fn(),
		listResources: vi.fn().mockResolvedValue([]),
		readResource: vi.fn(),
		getConnectionStatus: vi.fn().mockReturnValue(true),
		getClient: vi.fn().mockReturnValue({}),
		getServerInfo: vi.fn().mockReturnValue({
			spawned: false,
			pid: null,
			command: null,
			originalArgs: null,
			resolvedArgs: null,
			env: null,
			alias: null,
		}),
		getConnectedClient: vi.fn().mockResolvedValue({}),
		connect: vi.fn(),
		disconnect: vi.fn(),
	};
}
