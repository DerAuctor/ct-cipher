## 🜄 Ziel / Summary 🜄
Erstellung eines detaillierten Abgleichs des ct-cipher MCP-Clients mit der Model Context Protocol (MCP) TypeScript SDK-Implementierung sowie den MCP-Spezifikationen. Fokus auf Wirkung: Nachweis der Protokollkonformität, Identifikation von Deckungslücken, technische Risiken und konkrete Folgeaufgaben zur Verbesserung der Interoperabilität.

## 🜄 Kontext / Referenz 🜄
- Repository: `ct-cipher` (TypeScript)
- MCP-Client-Implementierung:
  - `src/core/mcp/client.ts` (Klient für Einzel-Server)
  - `src/core/mcp/manager.ts` (Orchestrierung/Cache/Mehrserver)
  - `src/core/mcp/aggregator.ts` (Server-zu-Server Aggregation)
- MCP-Server-Integration (Referenz):
  - `src/app/mcp/mcp_handler.ts` (Server, Tools/Prompts/Resources, Transports)
  - `src/app/mcp/mcp_sse_server.ts`, `src/app/mcp/mcp_streamable_http_server.ts`
- Verwendetes SDK (im Projekt): `@modelcontextprotocol/sdk` version `^1.18.0` (siehe `package.json`)
- Vendored SDK (Referenz): `mcp-sdk` version `1.18.1` (siehe `mcp-sdk/package.json`)
- Vendored Spezifikationen:
  - Hauptreferenz: `mcp-specs/docs/specification/2025-06-18/*` (aktuelle Version), plus historische (`2025-03-26`, `2024-11-05`) und Draft
- Relevante SDK-Referenzdateien (Auszug):
  - Client: `mcp-sdk/src/client/index.ts`, Transports: `mcp-sdk/src/client/{stdio,sse,streamableHttp}.ts`
  - Shared protocol: `mcp-sdk/src/shared/protocol.ts`, Types: `mcp-sdk/src/types.ts`
- Relevante Spezifikationsbereiche (Auszug):
  - Basic Lifecycle: `.../basic/lifecycle.mdx`, Transports: `.../basic/transports.mdx`
  - Server capabilities: `.../server/{tools,prompts,resources}.mdx`
  - Client topics: `.../client/*` (z. B. `roots`, `sampling`, `elicitation`)

## 🜄 Verantwortung / Authority 🜄
- Autorenschaft: Codex Agent (technische Analyse)
- Cap (Geltungsbereich): Protokoll-/SDK-Abgleich, technische Validierung, To-Do-Empfehlungen
- Delegation: Auf Anforderung durch Nutzer im Rahmen ct-cipher

## 🜄 Prüfung / Validation 🜄
- [x] Cap-Selbstprüfung: Umfang verstanden (Client-Fokus, inkl. Manager/Aggregator als Kontext)
- [x] Technische Prüfung: Abgleich Code ↔ SDK-API ↔ Spezifikation (Datei-/Methodenebene)
- [x] Ethikprüfung (Opportunitäts-Ethik): Empfehlungen blockieren keine anderen notwendigen Entscheidungen; priorisieren Interoperabilität/Sicherheit

## 🜄 Risiken / Nebenwirkungen 🜄
- Teilweise nicht exponierte SDK-Funktionen könnten Interoperabilität mit Clients/Tools einschränken (z. B. `resources/subscribe`, `listResourceTemplates`, `logging/setLevel`, `completion/complete`, `ping`).
- Fehlerbehandlung durch Mustererkennung in Texten ("not implemented") statt Vorab-Capability-Check kann zu uneinheitlichem Verhalten führen.
- Unterschiedliche Tool-Namenspräfixe (Manager vs. Aggregator) sind intern konsistent, aber für Konsumenten heterogen (Mapping-Komplexität).
- Fehlende explizite Cancel-/Progress-Integration auf Client-API-Ebene (SDK kann es, CT-Client exponiert es nicht) kann Latenz-/UX-Effekte haben.

## 🜄 Aufgaben / To-Do 🜄
- [ ] Exponieren weiterer SDK-Methoden (optional, s. unten Empfehlungen)
- [ ] Vereinheitlichen der Tool-Namensauflösung (Manager/Aggregator)
- [ ] Voranstellen von Capability-Checks vor Aufrufen (statt heuristische Fehlerbehandlung)
- [ ] Optional: API für Abbruch/Progress/Ping durchreichen
- [ ] Optional: Dokumentation der unterstützten MCP-Fähigkeiten und Timeouts

---

## Technical Comparison (English)

### 1) Initialization, Capabilities, and Lifecycle
- ct-cipher uses SDK `Client` (`@modelcontextprotocol/sdk/client/index.js`) and calls `connect(transport)` in `MCPClient._connectWithTimeout`.
- The SDK performs the `initialize` handshake (protocol version, advertised client capabilities, `notifications/initialized`).
- ct-cipher initializes the client with `capabilities: { tools: {}, prompts: {}, resources: {} }` via the `Client` constructor options. This is valid; the client advertises no special features beyond standard interactions.
- Spec alignment: Basic lifecycle (initialize → capability negotiation) matches `.../basic/lifecycle.mdx` with SDK enforcing protocol version checks.

Observations
- ct-cipher does not expose `client.registerCapabilities(...)` post-construction. If new client-side capabilities (e.g., `roots`, `sampling`, `elicitation`) are required later, exposing a way to register them pre-connect would align with SDK design.

### 2) Transports and Session Handling
Supported transports in ct-cipher `MCPClient`:
- `stdio`: uses `StdioClientTransport`; resolves command/args; adds process listeners; PID tracking; adaptive timeouts for fast/standard/heavy categories.
- `sse`: uses `SSEClientTransport`; aligns with SDK v1.18.x header-passing via `requestInit` and `eventSourceInit`. Compliant to spec `.../basic/transports.mdx`.
- `streamable-http`: uses `StreamableHTTPClientTransport`; supports `requestInit` headers; lazy-connect strategy (defer `client.connect()` until first request); supports `terminateSession()` passthrough.

Spec and SDK alignment
- After initialization, SDK sets protocol version on HTTP transport. ct-cipher leverages SDK behavior implicitly.
- ct-cipher implements lazy session start and reconnect-on-"session not found" for HTTP, which is compatible with SDK session semantics and improves robustness.

Gaps/Notes
- No explicit WebSocket client transport usage (SDK contains `websocket.ts`); not required by spec.
- DNS rebinding protection is addressed on server side; client code focuses on header injection for auth cases.

### 3) Tools: Discovery and Invocation
- Listing tools: `MCPClient.getTools()` wraps `client.listTools()` and builds a `ToolSet` keyed by tool name; caches not at client but manager layer.
- Tool invocation: `MCPClient.callTool(name, args)` uses SDK `client.callTool({ name, arguments })`. SDK validates `structuredContent` against `outputSchema` if present.
- Manager: `MCPManager.getAllTools()` enumerates connected clients, prefixes tool names as `mcp__{clientName}__{toolName}`, and maintains O(1) mapping caches for client/tool lookup. Aggregator prefixes differently (`{clientName}.{toolName}`) and registers via its own server.

Spec alignment
- Tool listing/calling follows server tools spec (`.../server/tools.mdx`). The SDK enforces capability checks.

Gaps/Notes
- Name prefix conventions differ between Manager and Aggregator; both valid internally, but external consumers must handle both.
- There is no explicit exposure of SDK `listResourceTemplates` or subscriptions for tools.

### 4) Prompts and Resources
- Prompts: `listPrompts()`, `getPrompt(name, args)` call SDK methods; on capability errors, ct-cipher catches and returns `[]`/throws as needed. SDK would already assert server capabilities.
- Resources: `listResources()`, `readResource(uri)` similarly wrap SDK; capability-not-supported conditions are treated as "normal" for certain servers and return empty lists rather than erroring.

Spec alignment
- Implementation is compatible with server prompts/resources spec sections. SDK guards with `assertCapability` prior to requests.

Gaps/Notes
- ct-cipher does not expose `resources/subscribe` and `resources/unsubscribe` (supported by SDK) nor `resources/templates/list`.
- Consider surfacing these for richer client features (optional).

### 5) Logging, Completion, Ping, Roots, Sampling, Elicitation
SDK features (available in `mcp-sdk/src/client/index.ts`):
- `setLoggingLevel`, `complete`, `ping`, `sendRootsListChanged`, plus request handlers for `sampling`, `elicitation`, `roots` (client-side capabilities required).
ct-cipher `MCPClient` exposure:
- Not exposed: `setLoggingLevel`, `complete`, `ping`, `roots` events, sampling/elicitation request handlers.

Spec alignment
- Not required for baseline tool/prompt/resource interoperability. Omission reduces feature breadth but does not break compliance for common use cases.

Recommendation
- Surface `ping()` in MCPClient (lightweight health-check) and optionally `setLoggingLevel` for consistency.

### 6) Error Handling, Timeouts, Cancellation, Progress
- ct-cipher adds robust timeouts with adaptive strategies (stdio) and per-operation wrapping.
- For HTTP, session-error reconnection pattern is implemented.
- Cancellation/progress: Not explicitly surfaced via MCPClient API, though the SDK supports cancellation via `RequestOptions` (e.g., AbortSignal) and progress notifications.

Spec and SDK alignment
- Spec does not mandate timeouts; SDK supports request options; ct-cipher’s approach is compatible.

Recommendation
- Optionally accept SDK `RequestOptions` in MCPClient methods to wire through cancellation and progress where useful.

### 7) Security and Auth (Client-side)
- SSE/HTTP headers are supported via `requestInit` when constructing transports. This enables bearer tokens and custom auth schemes per SDK guidance.
- No client-side PKCE/OAuth flows are implemented in MCPClient; not required unless integrating with secured remote servers that demand it. SDK contains helpers in server path; client auth flows may be app-specific.

### 8) Multi-Server Orchestration (Manager) and Aggregation
- `MCPManager` maintains O(1) caches for tools/prompts/resources → client mapping; supports strict vs. lenient connection modes; emits events; handles failure counts; provides refresh paths.
- `AggregatorMCPManager` exposes an MCP server aggregating downstream servers; resolves naming conflicts with strategies (`prefix`, `first-wins`, `error`).

Spec alignment
- Manager/Aggregator are value-added patterns; not mandated by spec but consistent with SDK composition.

---

## Coverage Summary (by area)
- Lifecycle & initialization: Covered (via SDK).
- Transports: stdio, SSE, streamable-HTTP covered; headers supported; HTTP session termination supported.
- Tools: list/call covered; output schema validation via SDK.
- Prompts: list/get covered.
- Resources: list/read covered.
- Optional/Not Exposed: `resources/subscribe`, `resources/templates/list`, `logging/setLevel`, `completion/complete`, `ping`, `roots`, `sampling`, `elicitation`.
- Cancellation/Progress: Not surfaced via MCPClient API; possible via SDK options.

## Identified Gaps and Impact
1) Missing optional SDK methods (subscribe/templates/logging/completion/ping): reduces feature breadth; interop impact low-to-moderate, depending on server expectations.
2) Capability checks: ct-cipher sometimes infers capability-not-supported from error texts; SDK already asserts capabilities. Prefer checking `client.getServerCapabilities()` or relying on SDK errors for consistency.
3) Naming conventions (Manager vs Aggregator): heterogeneität kann Konsumenten irritieren; klare Dokumentation/Adapter empfohlen.

## Recommendations (Actionable)
- Expose selective SDK methods in `MCPClient`:
  - `ping()`: quick health check
  - `listResourceTemplates()`, `subscribeResource()` / `unsubscribeResource()` when resources matter
  - Optionally `setLoggingLevel()` and `complete()` if downstream servers support them
- Add optional `RequestOptions` passthrough (cancellation/progress) to MCPClient methods.
- Replace heuristic capability error handling with pre-checks using `client.getServerCapabilities()` or rely on SDK thrown capability errors and normalize to consistent return types.
- Document naming/prefixing rules for tools in Manager vs Aggregator; consider harmonizing.

## Cross-References (in-repo)
- Client core:
  - `src/core/mcp/client.ts` (connect, transports, list/get/call)
  - `src/core/mcp/manager.ts` (caching, executeTool routing)
  - `src/core/mcp/aggregator.ts` (server aggregation)
- SDK reference:
  - `mcp-sdk/src/client/index.ts` (handshake, capabilities, APIs)
  - `mcp-sdk/src/client/{stdio,sse,streamableHttp}.ts`
- Spec reference (latest):
  - `mcp-specs/docs/specification/2025-06-18/basic/{lifecycle,transports}.mdx`
  - `mcp-specs/docs/specification/2025-06-18/server/{tools,prompts,resources}.mdx`
  - `mcp-specs/docs/specification/2025-06-18/client/*`

## Conclusion
ct-cipher’s MCP client aligns with MCP SDK 1.18.x for core flows (initialize, transports, tools/prompts/resources). Optional capabilities are not surfaced in the public client API, which limits breadth but maintains compliance for typical tool-centric usage. The suggested enhancements improve interoperability, debuggability, and parity with the SDK feature set without introducing breaking changes.
