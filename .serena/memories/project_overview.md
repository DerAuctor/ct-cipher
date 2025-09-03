# Cipher Project Overview

## Purpose
Cipher is a memory-powered AI agent framework with real-time WebSocket communication, MCP integration, and composable patterns. It provides a memory layer specifically designed for coding agents, compatible with multiple IDEs through MCP.

## Tech Stack
- **Runtime**: Node.js >=20.0.0, pnpm >=9.14.0
- **Language**: TypeScript with ESM modules
- **Build**: tsup for bundling
- **Testing**: Vitest
- **Linting**: ESLint with TypeScript plugins
- **Formatting**: Prettier
- **Git Hooks**: Husky

## Key Features
- MCP integration with IDEs (Cursor, Claude Desktop, VS Code, etc.)
- Auto-generate AI coding memories
- Dual Memory Layer (System 1 & System 2)
- Real-time team memory sharing
- Multiple LLM provider support (OpenAI, Anthropic, Gemini, etc.)
- Vector store integration (Qdrant, Milvus, in-memory)

## Architecture
- Core framework in `src/core/`
- CLI application in `src/app/`
- Web UI built with separate build process
- MCP server capabilities
- OAuth2 authentication for Gemini Direct