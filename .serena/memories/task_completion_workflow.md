# Task Completion Workflow for Cipher

## When Task is Completed - Required Steps

### 1. Code Quality Checks
```bash
pnpm run typecheck    # Must pass TypeScript checks
pnpm run lint         # Must pass linting
pnpm run format:check # Must pass formatting check
```

### 2. Testing Requirements
```bash
pnpm run test:ci      # Unit tests must pass
# Integration tests only if SKIP_INTEGRATION_TESTS=false
```

### 3. Build Verification
```bash
pnpm run build:no-ui  # Verify build succeeds
```

### 4. Git Workflow
- **DO NOT commit automatically**
- Check `git status` for modified files
- User must explicitly request commits
- Use conventional commit messages

### 5. Documentation Updates
- Update relevant documentation if APIs changed
- Update CHANGELOG.md for significant changes
- Ensure README.md reflects current state

## Pre-commit Hook
The project uses `pnpm run precommit` which runs:
1. Linting with auto-fix
2. Type checking
3. Format checking  
4. Unit tests
5. Full build

## Integration Testing
- Set `SKIP_INTEGRATION_TESTS=false` to enable
- Set `INTEGRATION_TESTS_ONLY=true` for integration only
- Requires proper environment setup

## Release Process
- Use `pnpm run prepublishOnly` before publishing
- Ensure all checks pass
- Update version in package.json