# MCP Integration

Model Context Protocol (MCP) integration allows Core_Team-cipher to work seamlessly with MCP-compatible clients like Claude Desktop, Cursor, Windsurf, and other AI coding assistants.

## Overview

Core_Team-cipher can run as an MCP server, exposing its memory and reasoning capabilities to any MCP client. This enables persistent memory across different AI tools and coding environments.

## Quick Setup

### Basic MCP Configuration

To use Core_Team-cipher as an MCP server in your MCP client:

```json
{
	"mcpServers": {
		"cipher": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "your_openai_api_key",
				"ANTHROPIC_API_KEY": "your_anthropic_api_key"
			}
		}
	}
}
```

### Environment Variables for MCP

When running in MCP mode, **export all environment variables** as Core_Team-cipher won't read from `.env` file:

```bash
export OPENAI_API_KEY="sk-your-openai-key"
export ANTHROPIC_API_KEY="sk-ant-your-anthropic-key"
export VECTOR_STORE_TYPE="qdrant"
export VECTOR_STORE_URL="your-qdrant-endpoint"
export VECTOR_STORE_API_KEY="your-qdrant-api-key"
```

## Transport Types

Core_Team-cipher supports multiple MCP transport protocols:

### STDIO Transport (Default)

Standard input/output transport - most widely supported:

```json
{
	"mcpServers": {
		"cipher": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key"
			}
		}
	}
}
```

### SSE Transport (Server-Sent Events)

Real-time transport over HTTP. Endpoint: `/sse`.

```bash
# Start Core_Team-cipher with SSE transport
cipher --mode mcp --mcp-transport-type sse --mcp-port 4000
```

```json
{
  "mcpServers": {
    "cipher-sse": {
      "url": "http://localhost:4000/sse"
    }
  }
}
```

### Streamable-HTTP Transport

HTTP request/response with streaming. Endpoint base: `/mcp`.

```bash
# Start Core_Team-cipher with streamable-HTTP transport
cipher --mode mcp --mcp-transport-type streamable-http --mcp-port 4000
```

```json
{
  "mcpServers": {
    "cipher-http": {
      "url": "http://localhost:4000/mcp"
    }
  }
}
```

Note: Clients must send the correct Accept headers per spec. Examples:
- GET `/mcp`: `Accept: text/event-stream`
- POST `/mcp`: `Accept: application/json, text/event-stream` and `Content-Type: application/json`

## MCP Server Modes

Core_Team-cipher offers two distinct MCP server modes controlled by the `MCP_SERVER_MODE` environment variable.

### Default Mode

Exposes only the `ask_cipher` tool - simple and focused:

```json
{
	"mcpServers": {
		"cipher-default": {
			"type": "stdio",
			"command": "cipher", 
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"MCP_SERVER_MODE": "default"
			}
		}
	}
}
```

**Available Tools:**
- `ask_cipher` - Main conversational interface to Core_Team-cipher

### Aggregator Mode

Exposes **all available tools** including memory tools and connected MCP server tools:

```json
{
	"mcpServers": {
		"cipher-aggregator": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"], 
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"MCP_SERVER_MODE": "aggregator",
				"AGGREGATOR_CONFLICT_RESOLUTION": "prefix",
				"AGGREGATOR_TIMEOUT": "60000"
			}
		}
	}
}
```

**Available Tools:**
- All built-in Core_Team-cipher tools:
  - `ask_cipher` - Main conversational interface
  - `cipher_memory_search` - Search stored memories
  - `cipher_extract_and_operate_memory` - Extract and store memories
  - `cipher_store_reasoning_memory` - Store reasoning patterns
  - `cipher_search_reasoning_patterns` - Search reasoning history
- Plus all tools from connected MCP servers (defined in `cipher.yml`)

## Aggregator Configuration

### Environment Variables

| Variable | Description | Options | Default |
|----------|-------------|---------|---------|
| `MCP_SERVER_MODE` | Server mode | `default`, `aggregator` | `default` |
| `USE_ASK_CIPHER` | Enable/disable ask_cipher tool (only LLM-requiring tool) | `true`, `false` | `false` |
| `MCP_ONLY_CONTACT_CT_KNOWLEDGE_MANAGEMENT` | Only expose contact_ct_knowledge_management tool | `true`, `false` | `false` |
| `AGGREGATOR_CONFLICT_RESOLUTION` | Handle tool name conflicts | `prefix`, `first-wins`, `error` | `prefix` |
| `AGGREGATOR_TIMEOUT` | Tool execution timeout (ms) | Number | `60000` |

**Note:** When `USE_ASK_CIPHER=false`, the `ask_cipher` tool is disabled. When `MCP_ONLY_CONTACT_CT_KNOWLEDGE_MANAGEMENT=true`, only the `contact_ct_knowledge_management` tool is exposed, which is the only tool requiring LLM functionality. However, API keys are still required for embedding models used by memory and reasoning tools (`cipher_memory_search`, `cipher_extract_and_operate_memory`, etc.).

### Conflict Resolution Strategies

**prefix** (Recommended):
```
# Tools are prefixed with server name
filesystem__read_file  # from filesystem server
memory__search         # from memory server
```

**first-wins**:
```
# First server with tool name wins
read_file             # from whichever server registered first
```

**error**:
```
# Throws error if tool names conflict
Error: Tool name conflict detected
```

## Advanced MCP Features (Milestone 2)

Core_Team-cipher supports advanced MCP protocol features for enhanced interoperability and robustness.

### Optional SDK Methods

The following optional MCP methods are fully implemented:

- **`ping()`**: Bidirectional ping for health checks between client and server
- **`setLoggingLevel(level)`**: Client can set the server's logging level dynamically
- **`complete(ref, argument)`**: Client can request completions from the server
- **`subscribeResource(uri)` / `unsubscribeResource(uri)`**: Manage resource subscriptions
- **`listResourceTemplates()`**: List available resource templates
- **`listRoots()`**: Server can list client roots
- **`createMessage(samplingRequest)`**: Server can request message creation from client
- **`elicitInput(elicitationRequest)`**: Server can elicit input from client

### Cancellation and Progress Support

All MCP requests support advanced cancellation and progress features:

- **AbortSignal**: Pass an AbortSignal to cancel requests mid-execution
- **Progress Callbacks**: Receive `onprogress` notifications during long operations
- **Timeout Management**: Configure timeouts with `timeout`, `resetTimeoutOnProgress`, and `maxTotalTimeout`

Example usage:
```typescript
await client.callTool({ name: 'tool_name', arguments: args }, {
  signal: abortController.signal,
  onprogress: (progress) => console.log('Progress:', progress),
  timeout: 30000,
  resetTimeoutOnProgress: true,
  maxTotalTimeout: 120000
});
```

### Preventive Capability Checks

Robust capability validation prevents invalid requests:

- **`assertCapabilityForMethod(method)`**: Client checks server capabilities before requests
- **`assertCapabilityForMethod(method)`**: Server checks client capabilities
- **`assertRequestHandlerCapability(method)`**: Local capability validation
- **`enforceStrictCapabilities`**: Optional strict enforcement (default: false for backward compatibility)

These checks ensure reliable communication and better error handling.

### RequestOptions Integration

All SDK methods now accept `RequestOptions` for consistent behavior:
- Cancellation support
- Progress notifications
- Timeout configuration
- Proper error handling for aborted requests

This provides a unified API for advanced request management across the MCP ecosystem.

## Gemini Schema Converter Limitations

Core_Team-cipher uses a Gemini Schema Converter to transform JSON Schema Draft-07 parameters to Gemini API compatible format. This converter has several limitations and transformations:

### Unsupported JSON Schema Properties

The following JSON Schema properties are completely removed as they are not supported by the Gemini API:

- **Meta-schema properties**: `$schema`, `$id`, `$ref`, `$comment`
- **Validation keywords**: `exclusiveMinimum`, `exclusiveMaximum`, `const`, `propertyNames`
- **Array validation**: `additionalItems`, `contains`
- **Object validation**: `patternProperties`, `dependencies`
- **Conditional validation**: `if`, `then`, `else`
- **Schema composition**: `allOf`, `anyOf`, `oneOf`, `not`

### Schema Transformations

**Type Arrays**: Array type definitions like `["string", "null"]` are simplified to the first non-null type (e.g., `"string"`).

**Items Arrays**: Multiple item schemas in arrays are simplified to use only the first schema definition.

**additionalProperties**: 
- Boolean values are preserved as-is
- Object schemas are recursively processed
- Other values default to `true`

### Processing Limits

- **Recursion Depth**: Maximum nesting depth of 10 levels to prevent infinite recursion
- **Error Handling**: Conversion failures fall back to original OpenAI-compatible format with warnings logged

### Recommendations

- Use simple, flat schema structures when possible
- Avoid complex validation keywords not listed above
- Test tool schemas with Gemini provider to ensure compatibility
- Monitor logs for conversion warnings during development

## IDE Configurations

### Claude Desktop

Add to your Claude Desktop MCP configuration:

**macOS:** `~/Library/Application\ Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
	"mcpServers": {
		"cipher": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-openai-key",
				"ANTHROPIC_API_KEY": "sk-ant-your-anthropic-key",
				"VECTOR_STORE_TYPE": "qdrant",
				"VECTOR_STORE_URL": "your-qdrant-endpoint",
				"VECTOR_STORE_API_KEY": "your-qdrant-key"
			}
		}
	}
}
```

### Cursor

Add to Cursor's MCP configuration. Cursor URL entries are treated as SSE:

```json
{
  "mcpServers": {
    "cipher-sse": { "url": "http://localhost:4000/sse" }
  }
}
```

### Windsurf

Similar to Claude Desktop configuration:

```json
{
	"mcpServers": {
		"cipher-memory": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-openai-key",
				"USE_WORKSPACE_MEMORY": "true"
			}
		}
	}
}
```

### Claude Code

For Claude Code integration:

```json
{
	"mcpServers": {
		"cipher": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-openai-key",
				"MCP_SERVER_MODE": "aggregator"
			}
		}
	}
}
```

## Advanced Configurations

### Workspace Memory Integration

Enable team-aware memory for collaborative environments:

```json
{
	"mcpServers": {
		"cipher-workspace": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-openai-key",
				"USE_WORKSPACE_MEMORY": "true",
				"WORKSPACE_VECTOR_STORE_COLLECTION": "team_project",
				"DISABLE_DEFAULT_MEMORY": "false"
			}
		}
	}
}
```

### Multiple Core_Team-cipher Instances

Run different Core_Team-cipher configurations for different projects:

```json
{
	"mcpServers": {
		"cipher-frontend": {
			"type": "stdio", 
			"command": "cipher",
			"args": ["--mode", "mcp", "--agent", "/path/to/frontend-config.yml"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"VECTOR_STORE_COLLECTION": "frontend_memory"
			}
		},
		"cipher-backend": {
			"type": "stdio",
			"command": "cipher", 
			"args": ["--mode", "mcp", "--agent", "/path/to/backend-config.yml"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"VECTOR_STORE_COLLECTION": "backend_memory"
			}
		}
	}
}
```

### Custom Tool Timeout

For long-running operations:

```json
{
	"mcpServers": {
		"cipher-heavy": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp", "--timeout", "300000"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"AGGREGATOR_TIMEOUT": "300000"
			}
		}
	}
}
```

## MCP Aggregator Hub Example

Check out the [MCP Aggregator Hub example](../examples/04-mcp-aggregator-hub/) that demonstrates:

- Exposing filesystem tools alongside memory tools
- Conflict resolution in action
- Tool prefixing and namespacing
- Integration with multiple MCP servers

## Troubleshooting

### Common Issues

**Tool Not Available:**
```json
{
  "error": "Tool 'cipher_memory_search' not found"
}
```
**Solution:** Set `MCP_SERVER_MODE=aggregator` to expose memory tools.

**Connection Refused:**
```json
{
  "error": "Failed to connect to Core_Team-cipher MCP server"
}
```
**Solutions:**
- Ensure Core_Team-cipher is installed: `npm install -g @byterover/cipher`
- Check environment variables are exported
- Verify the command path in MCP config

**Environment Variable Issues:**
```bash
Error: OPENAI_API_KEY not found
```
**Solution:** Export variables before starting MCP client:
```bash
export OPENAI_API_KEY="sk-your-key"
# Then start your MCP client
```

**Tool Name Conflicts:**
```json
{
  "error": "Tool name conflict: read_file"
}
```
**Solution:** Set `AGGREGATOR_CONFLICT_RESOLUTION=prefix` or use `first-wins`.

### Debug Mode

Enable debug logging:

```json
{
	"mcpServers": {
		"cipher-debug": {
			"type": "stdio",
			"command": "cipher",
			"args": ["--mode", "mcp"],
			"env": {
				"OPENAI_API_KEY": "sk-your-key",
				"DEBUG": "cipher:*",
				"MCP_LOG_LEVEL": "debug"
			}
		}
	}
}
```

### Testing MCP Connection

Test your MCP setup:

```bash
# Start Core_Team-cipher MCP server manually
export OPENAI_API_KEY="sk-your-key"
cipher --mode mcp

# Test with MCP client tools
npx @modelcontextprotocol/inspector cipher --mode mcp
```

## Known Servers (XInfty)

- SSE endpoints (internal):
  - http://192.168.2.222:12008/metamcp/ct_dev-PMO/sse
  - http://192.168.2.222:12008/metamcp/ct_dev-PMO_code/sse
  - http://192.168.2.222:12008/metamcp/ct_dev-PMO_specs_docs_examples/sse
  - http://192.168.2.222:12008/metamcp/ct_dev-PMO_event_mgmnt/sse
  - http://192.168.2.222:12008/metamcp/ct_dev-PMO_code_mgmnt/sse

Note: endpoints may require authentication depending on deployment.

## Related Documentation

- [CLI Reference](./cli-reference.md) - Command-line options and usage
- [Configuration](./configuration.md) - Main configuration guide
- [Examples](./examples.md) - Real-world integration examples
- [Workspace Memory](./workspace-memory.md) - Team memory features