# Session Auto-Creation

Core_Team-cipher now supports automatic session creation, eliminating the "Session default not found" errors and providing a seamless user experience.

## Overview

The session auto-creation feature automatically creates sessions when none exist, ensuring that users can immediately start interacting with Core_Team-cipher without manual session management.

## How It Works

When Core_Team-cipher starts and no sessions are found in the storage backend:

1. A new default session is automatically created
2. The session is stored in the configured storage backend (PostgreSQL, SQLite, or in-memory)
3. The session is immediately available for use

## Benefits

- **Seamless Experience**: No manual session creation required
- **Error Elimination**: Eliminates "Session default not found" errors
- **Automatic Persistence**: Sessions are automatically saved to the storage backend
- **Race Condition Handling**: Concurrent requests are handled properly

## Configuration

No additional configuration is required. The feature works automatically with all storage backends:

- PostgreSQL (recommended for production)
- SQLite (good for single-user setups)
- In-Memory (development/testing only)

## Testing

A comprehensive test suite is included to verify the session auto-creation functionality:

```bash
# Run the session auto-creation tests
node test_session_auto_creation.js
```

The test suite verifies:
- Database connection
- Default session auto-creation
- Session persistence in storage backend
- Session history functionality
- Elimination of session errors

## Troubleshooting

### Common Issues

**Database Connection Failed**
```
Error: connect ECONNREFUSED
```
**Solution:** Verify database configuration and connectivity.

**Session Not Persisted**
```
Error: Session not found in database
```
**Solution:** Check database permissions and table creation.

### Debugging

Enable debug logging to troubleshoot session issues:

```bash
# .env
CIPHER_LOG_LEVEL=debug
```

## Related Documentation

- [Chat History](./chat-history.md) - Session storage and management
- [Configuration](./configuration.md) - Main configuration guide
- [CLI Reference](./cli-reference.md) - Command-line usage