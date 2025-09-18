import { describe, it, beforeAll, afterAll, expect, vi } from 'vitest';
import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js';
import { ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { MCPClient } from '../client.js';
import http from 'http';
import { McpStreamableHttpServer } from '../../../app/mcp/mcp_streamable_http_server.js';
import type { StreamableHttpServerConfig } from '../types.js';

const PORT = 6010; // adjust if needed
let httpServer: McpStreamableHttpServer | undefined;
let server: McpServer | undefined;

describe('MCP Client - Streamable HTTP integration', () => {
  beforeAll(async () => {
    // Mock internal logger alias to avoid path alias resolution issues in test env
    vi.mock('@core/logger/index.js', () => ({
      logger: {
        info: () => {},
        error: () => {},
        debug: () => {},
        warn: () => {},
        redirectToFile: () => {},
      },
    }));
    server = new McpServer(
      { name: 'it-server', version: '1.0.0' },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [] }));

    httpServer = new McpStreamableHttpServer(PORT, '127.0.0.1');
    await httpServer.start(server);
  }, 20000);

  afterAll(async () => {
    if (httpServer) await httpServer.stop();
  });

  it('connects, lists tools, and terminates the session', async () => {
    const client = new MCPClient();

    const config: StreamableHttpServerConfig = {
      type: 'streamable-http',
      url: `http://127.0.0.1:${PORT}/mcp`,
      headers: {},
      enabled: true,
      timeout: 20000,
      connectionMode: 'strict',
      routingEnabled: true,
    };

    const connected = await client.connect(config, 'it-server');
    expect(connected).toBeTruthy();

    const tools = await client.getTools();
    expect(typeof tools).toBe('object');

    await client.terminateSession();
    expect(client.getConnectionStatus()).toBe(false);
  }, 30000);
});
