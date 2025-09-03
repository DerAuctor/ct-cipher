# Suggested Commands for Cipher Development

## Essential Development Commands

### Build & Development
```bash
pnpm run build        # Full build including UI
pnpm run build:no-ui  # Build without UI
pnpm run dev          # TypeScript watch mode
pnpm run start        # Start built application
```

### Code Quality
```bash
pnpm run typecheck    # TypeScript type checking
pnpm run lint         # ESLint check
pnpm run lint:fix     # Fix linting issues
pnpm run format       # Format with Prettier
pnpm run format:check # Check formatting
```

### Testing
```bash
pnpm run test         # Run all tests
pnpm run test:unit    # Unit tests only
pnpm run test:integration  # Integration tests
pnpm run test:ci      # CI-friendly test run
```

### Pre-commit Workflow
```bash
pnpm run precommit    # Full check: lint + typecheck + format + test + build
```

### Application Modes
```bash
cipher                # Interactive CLI mode
cipher --mode api     # API server mode
cipher --mode mcp     # MCP server mode  
cipher --mode ui      # Web UI mode
```

## System Commands
```bash
git status           # Check repository status
git log --oneline    # View recent commits
ls -la               # List files with details
find . -name "*.ts"  # Find TypeScript files
grep -r "pattern"    # Search in files
```