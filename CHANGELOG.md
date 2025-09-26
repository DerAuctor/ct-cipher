# Changelog
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
