import { MCPClient } from '../client.js';
import type { StdioServerConfig } from '../types.js';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock StdioClientTransport for controlled testing
vi.mock('@modelcontextprotocol/sdk/client/stdio.js', () => ({
	StdioClientTransport: vi.fn().mockImplementation(function(config: any) {
		const transport = new EventEmitter();
		// Mock process for transport
		(transport as any).process = new MockChildProcess();
		return transport;
	}),
}));

// Mock Client from MCP SDK
vi.mock('@modelcontextprotocol/sdk/client/index.js', () => ({
	Client: vi.fn().mockImplementation(() => ({
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		request: vi.fn(),
	})),
}));

// Mock child process for testing
class MockChildProcess extends EventEmitter {
	public pid: number | undefined = 12345;
	public killed: boolean = false;
	public exitCode: number | null = null;

	constructor() {
		super();
	}

	kill(signal?: string | number): boolean {
		if (signal === 0) {
			// Signal 0 checks if process exists
			if (this.killed || this.exitCode !== null) {
				throw new Error('ESRCH');
			}
			return true;
		}
		this.killed = true;
		return true;
	}

	// Simulate process exit
	simulateExit(code: number, signal?: string) {
		this.exitCode = code;
		this.emit('exit', code, signal);
	}

	// Simulate process error
	simulateError(error: Error) {
		this.emit('error', error);
	}

	// Simulate healthy process
	simulateHealthy() {
		this.killed = false;
		this.exitCode = null;
		this.pid = 12345;
	}

	// Simulate killed process
	simulateKilled() {
		this.killed = true;
		this.exitCode = 1;
	}
}

describe('Stdio Connection Integration Tests', () => {
	let client: MCPClient;
	let mockLogger: any;
	let mockProcess: MockChildProcess;

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();
		
		// Create mock logger
		mockLogger = {
			info: vi.fn(),
			warn: vi.fn(),
			error: vi.fn(),
			debug: vi.fn(),
		};

		// Create MCPClient instance
		client = new MCPClient();
		client.setQuietMode(true);
		(client as any).logger = mockLogger;

		// Get reference to mock process
		mockProcess = new MockChildProcess();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe('Successful stdio connections', () => {
		it('should successfully connect to stdio server with logging', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'node',
				args: ['test-server.js'],
				timeout: 30000,
			};

			// Mock successful connection
			const mockConnect = vi.fn().mockResolvedValue(undefined);
			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: mockConnect,
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			const result = await client.connect(config, 'test-server');

			// Verify connection was attempted
			expect(result).toBeDefined();
			expect(mockConnect).toHaveBeenCalledTimes(1);
			
			// Verify logging for successful connection
			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('Successfully connected to test-server'),
				expect.objectContaining({
					serverName: 'test-server',
					timeout: expect.any(Number),
				})
			);
		});

		it('should use adaptive timeouts for different server types', async () => {
			const testCases = [
				{ name: 'time-server', command: 'time', expectedCategory: 'fast' },
				{ name: 'standard-server', command: 'node', expectedCategory: 'standard' },
				{ name: 'langchain-server', command: 'langchain', expectedCategory: 'heavy' },
			];

			for (const testCase of testCases) {
				const config: StdioServerConfig = {
					type: 'stdio',
					command: testCase.command,
					args: ['server.js'],
				};

				// Mock successful connection
				vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
					.mockImplementation(() => ({
						connect: vi.fn().mockResolvedValue(undefined),
						disconnect: vi.fn().mockResolvedValue(undefined),
						request: vi.fn(),
					}));

				await client.connect(config, testCase.name);

				// Verify adaptive timeout logging
				expect(mockLogger.debug).toHaveBeenCalledWith(
					expect.stringContaining(`Using ${testCase.expectedCategory} timeout`),
					expect.objectContaining({
						serverName: testCase.name,
						command: testCase.command,
						category: testCase.expectedCategory,
					})
				);
			}
		});
	});

	describe('Process error handling', () => {
		it('should handle process spawn errors', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'nonexistent-command',
				args: [],
			};

			// Mock spawn failure
			const spawnError = new Error('spawn nonexistent-command ENOENT');
			(spawnError as any).code = 'ENOENT';
			
			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: vi.fn().mockRejectedValue(spawnError),
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			await expect(client.connect(config, 'invalid-server')).rejects.toThrow();

			// Verify error categorization
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('Connection failed'),
				expect.objectContaining({
					serverName: 'invalid-server',
					command: 'nonexistent-command',
					errorType: 'COMMAND_NOT_FOUND',
					suggestion: expect.stringContaining('Command \'nonexistent-command\' not found'),
				})
			);
		});

		it('should handle process exit events', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'node',
				args: ['failing-server.js'],
			};

			// Setup transport with process that will exit
			let transportProcess: MockChildProcess;
			vi.mocked(require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport)
				.mockImplementation(() => {
					const transport = new EventEmitter();
					transportProcess = new MockChildProcess();
					(transport as any).process = transportProcess;
					return transport;
				});

			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: vi.fn().mockResolvedValue(undefined),
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			await client.connect(config, 'failing-server');

			// Simulate process exit
			transportProcess!.simulateExit(1, null);

			// Verify exit logging
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Process exited'),
				expect.objectContaining({
					serverName: 'failing-server',
					exitCode: 1,
				})
			);
		});
	});

	describe('Connection health checks', () => {
		it('should detect healthy stdio connections', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'node',
				args: ['healthy-server.js'],
			};

			// Setup healthy transport
			let transportProcess: MockChildProcess;
			vi.mocked(require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport)
				.mockImplementation(() => {
					const transport = new EventEmitter();
					transportProcess = new MockChildProcess();
					transportProcess.simulateHealthy();
					(transport as any).process = transportProcess;
					return transport;
				});

			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: vi.fn().mockResolvedValue(undefined),
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			await client.connect(config, 'healthy-server');

			// Test health check
			const isHealthy = client.getConnectionStatus();
			expect(isHealthy).toBe(true);

			// Verify health check logging
			expect(mockLogger.debug).toHaveBeenCalledWith(
				expect.stringContaining('Process health check passed'),
				expect.objectContaining({
					serverName: 'healthy-server',
					pid: 12345,
				})
			);
		});

		it('should detect killed stdio processes', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'node',
				args: ['server.js'],
			};

			// Setup transport that will be killed
			let transportProcess: MockChildProcess;
			vi.mocked(require('@modelcontextprotocol/sdk/client/stdio.js').StdioClientTransport)
				.mockImplementation(() => {
					const transport = new EventEmitter();
					transportProcess = new MockChildProcess();
					(transport as any).process = transportProcess;
					return transport;
				});

			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: vi.fn().mockResolvedValue(undefined),
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			await client.connect(config, 'killed-server');

			// Simulate killed process
			transportProcess!.simulateKilled();

			// Test health check
			const isHealthy = client.getConnectionStatus();
			expect(isHealthy).toBe(false);

			// Verify health check detects killed process
			expect(mockLogger.warn).toHaveBeenCalledWith(
				expect.stringContaining('Process killed'),
				expect.objectContaining({
					serverName: 'killed-server',
					killed: true,
				})
			);
		});
	});

	describe('Retry mechanism', () => {
		it('should retry stdio connections with exponential backoff', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'node',
				args: ['unstable-server.js'],
			};

			let connectAttempts = 0;
			const mockConnect = vi.fn().mockImplementation(() => {
				connectAttempts++;
				if (connectAttempts < 3) {
					return Promise.reject(new Error('Connection timeout'));
				}
				return Promise.resolve();
			});

			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: mockConnect,
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			const result = await client.connect(config, 'unstable-server');
			expect(result).toBeDefined();
			expect(connectAttempts).toBe(3);

			// Verify retry logging
			expect(mockLogger.info).toHaveBeenCalledWith(
				expect.stringContaining('Retrying connection'),
				expect.objectContaining({
					serverName: 'unstable-server',
					attempt: 2,
					serverCategory: 'standard',
				})
			);
		});

		it('should not retry for non-retryable errors', async () => {
			const config: StdioServerConfig = {
				type: 'stdio',
				command: 'nonexistent',
				args: [],
			};

			const fatalError = new Error('spawn nonexistent ENOENT');
			const mockConnect = vi.fn().mockRejectedValue(fatalError);

			vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
				.mockImplementation(() => ({
					connect: mockConnect,
					disconnect: vi.fn().mockResolvedValue(undefined),
					request: vi.fn(),
				}));

			await expect(client.connect(config, 'fatal-server')).rejects.toThrow();

			// Should only attempt once for fatal errors
			expect(mockConnect).toHaveBeenCalledTimes(1);

			// Verify non-retryable error logging
			expect(mockLogger.error).toHaveBeenCalledWith(
				expect.stringContaining('Non-retryable error'),
				expect.objectContaining({
					serverName: 'fatal-server',
					errorType: 'FATAL',
				})
			);
		});
	});

	describe('Timeout behavior', () => {
		it('should apply different timeouts based on server category', async () => {
			const testCases = [
				{ name: 'time-server', command: 'time', expectedTimeout: 10000 },
				{ name: 'standard-server', command: 'node', expectedTimeout: 30000 },
				{ name: 'langchain-server', command: 'langchain', expectedTimeout: 60000 },
			];

			for (const testCase of testCases) {
				vi.clearAllMocks();

				const config: StdioServerConfig = {
					type: 'stdio',
					command: testCase.command,
					args: ['server.js'],
				};

				vi.mocked(require('@modelcontextprotocol/sdk/client/index.js').Client)
					.mockImplementation(() => ({
						connect: vi.fn().mockResolvedValue(undefined),
						disconnect: vi.fn().mockResolvedValue(undefined),
						request: vi.fn(),
					}));

				await client.connect(config, testCase.name);

				// Verify timeout was logged with correct value
				expect(mockLogger.debug).toHaveBeenCalledWith(
					expect.stringContaining('timeout'),
					expect.objectContaining({
						timeout: testCase.expectedTimeout,
					})
				);
			}
		});
	});
});