# Core_Team-cipher (ct-cipher) Changelog
## [0.3.2] - 2025-09-25

### 🚀 Features
- Updated MCP SDK to version 1.18.1 for improved compatibility and security
- Implemented Transport Constructor fixes to prevent header conflicts
- Added unit and integration tests for transport components
- **Milestone 2**: Implemented complete optional SDK methods including:
  - Bidirectional ping functionality (ping())
  - Server logging level control (setLoggingLevel())
  - Client completion requests (complete())
  - Resource subscription management (subscribeResource/unsubscribeResource)
  - Resource template listing (listResourceTemplates)
  - Client roots listing (listRoots)
  - Message creation requests (createMessage)
  - Input elicitation requests (elicitInput)
- **Milestone 2**: Added comprehensive Cancellation/Progress Support:
  - AbortSignal integration for request cancellation
  - Progress notification callbacks (onprogress)
  - Timeout management with resetTimeoutOnProgress
  - Absolute timeout limits (maxTotalTimeout)
- **Milestone 2**: Introduced preventive Capability-Checks:
  - assertCapabilityForMethod() in client/server classes
  - assertRequestHandlerCapability() for local validation
  - enforceStrictCapabilities option for strict enforcement
  - RequestOptions integration across all SDK methods

### 📝 Documentation
### 🧹 Maintenance
- Cleaned up test/debug/deprecated files after milestone 1 completion
- Cleaned up test/debug/deprecated files after milestone 2 completion
- Archived test/debug files after milestone 2 completion
- Updated milestone documentation for MCP SDK alignment completion
- Created Milestone 2 completion report with full feature documentation



## [0.3.1] - 2025-09-01

### 🚀 Features
- Renamed project from Cipher to Core_Team-cipher (ct-cipher) for better team identification
- Implemented Codestral embedding backend with MistralAI SDK
- Implemented PostgreSQL storage backend integration
- Implemented session auto-creation to eliminate "Session not found" errors
- Enhanced OAuth2 error handling and logging in GeminiOAuth2Manager
- Implemented connection recovery with exponential backoff for PostgreSQL
- Enhanced PostgreSQL connection health checking
- Implemented graceful PostgreSQL connection state management
- Added PostgreSQL connection cleanup and resource management
- Added PostgreSQL pool error event handlers

### 📝 Documentation Updates
- Updated README.md to reflect Core_Team-cipher naming
- Updated all documentation files in docs/ directory to use Core_Team-cipher instead of Cipher
- Created new documentation for Codestral embedding integration
- Created new documentation for PostgreSQL integration
- Created new documentation for session auto-creation
- Updated configuration examples to use ct-cipher naming
- Updated package.json with new name and keywords
- Updated Docker configuration to reflect new project name

### 🐛 Bug Fixes
- Fixed embedding system and updated API port configuration
- Fixed Web UI server path resolution for compiled version
- Fixed "Session default not found" errors with automatic session creation
- Enhanced PostgreSQL error handling and recovery mechanisms
- Improved OAuth2 error handling and logging

### 🔧 Technical Improvements
- Enhanced error categorization with connection, authentication, and network error detection
- Added comprehensive health check mechanism for PostgreSQL connections
- Implemented proper cleanup of event listeners, connections, and resources
- Added automatic connection recovery mechanism with exponential backoff
- Improved logging throughout the PostgreSQL backend for better visibility

## Previous Versions

### [0.3.0] - 2025-01-27

### 🚀 Features
- Provided Full Supports for SSE and Streamable-HTTP Transports and Refactored README [#193](https://github.com/campfirein/cipher/pull/193)
- Optimize PayLoad and Introduce New WorkSpace Environment Variables [#195](https://github.com/campfirein/cipher/pull/195)
- Added ChromaDB Backend. [#197](https://github.com/campfirein/cipher/pull/197)
- Adjusted Default values for Vector Stores and Adjust Docs [#225](https://github.com/campfirein/cipher/pull/200)
- Added Pinecone Backend. [#202](https://github.com/campfirein/cipher/pull/202)
- Added ChromaDB Pgvector Backend. [#205](https://github.com/campfirein/cipher/pull/205)
- Added FAISS Backend. [#217](https://github.com/campfirein/cipher/pull/217)
- Added Redis Backend. [#218](https://github.com/campfirein/cipher/pull/218)
- Added Weaviate Backend. [#225](https://github.com/campfirein/cipher/pull/225)

### 🐛 Bug Fixes
- Fixed AWS LLM provider not recognized at startup. [#212](https://github.com/campfirein/cipher/pull/212)
- Fixed Streamable-HTTP MCP transport + Tool Panel payloads. [#214](https://github.com/campfirein/cipher/pull/214)

### 📝 Documentation
- Refactored README and provided full docs in [docs](./docs/)  [#193](https://github.com/campfirein/cipher/pull/193)

### [0.2.2] - 2025-08-08

### 🚀 Features
- Provided Full Supports for SSE and Streamable-HTTP Transports and Refactored README [#193](https://github.com/campfirein/cipher/pull/193)
- Optimize PayLoad and Introduce New WorkSpace Environment Variables [#195](https://github.com/campfirein/cipher/pull/195)
- Added ChromaDB Backend. [#197](https://github.com/campfirein/cipher/pull/197)
- Adjusted Default values for Vector Stores and Adjust Docs [#225](https://github.com/campfirein/cipher/pull/200)
- Added Pinecone Backend. [#202](https://github.com/campfirein/cipher/pull/202)
- Added ChromaDB Pgvector Backend. [#205](https://github.com/campfirein/cipher/pull/205)
- Added FAISS Backend. [#217](https://github.com/campfirein/cipher/pull/217)
- Added Redis Backend. [#218](https://github.com/campfirein/cipher/pull/218)
- Added Weaviate Backend. [#225](https://github.com/campfirein/cipher/pull/225)

### 🐛 Bug Fixes
- Fixed AWS LLM provider not recognized at startup. [#212](https://github.com/campfirein/cipher/pull/212)
- Fixed Streamable-HTTP MCP transport + Tool Panel payloads. [#214](https://github.com/campfirein/cipher/pull/214)

### 📝 Documentation
- Refactored README and provided full docs in [docs](./docs/)  [#193](https://github.com/campfirein/cipher/pull/193)