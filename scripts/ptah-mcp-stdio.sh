#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${PROJECT_ROOT}"

export MCP_ONLY_CONTACT_CT_KNOWLEDGE_MANAGEMENT=true

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to run Ptah (ct-cipher) in MCP stdio mode" >&2
  exit 1
fi

exec pnpm exec cipher --mode mcp --mcp-transport-type stdio "$@"
