# PostgreSQL Integration

Core_Team-cipher now supports PostgreSQL as a backend for persistent, reliable storage of chat history and session data.

## Overview

The PostgreSQL integration provides enterprise-grade reliability with ACID compliance, strong consistency, and high-performance storage for Core_Team-cipher's chat history and session data.

## Configuration

### Connection URL Method (Recommended)

The simplest way to configure PostgreSQL:

```bash
# .env
CIPHER_PG_URL="postgresql://username:password@localhost:5432/cipher_db"
```

**URL Format:**
```
postgresql://[username[:password]@][host[:port]][/database][?param=value&...]
```

**Examples:**
```bash
# Local PostgreSQL
CIPHER_PG_URL="postgresql://postgres:password@localhost:5432/cipher_db"

# Cloud PostgreSQL (Heroku style)
CIPHER_PG_URL="postgresql://user:pass@hostname:5432/database?sslmode=require"

# Local PostgreSQL with SSL
CIPHER_PG_URL="postgresql://user:pass@localhost:5432/cipher_db?sslmode=prefer"
```

### Individual Parameters Method

Alternative configuration using separate environment variables:

```bash
# .env
STORAGE_DATABASE_HOST="localhost"
STORAGE_DATABASE_PORT="5432"
STORAGE_DATABASE_NAME="cipher_db"
STORAGE_DATABASE_USER="username"
STORAGE_DATABASE_PASSWORD="password"
STORAGE_DATABASE_SSL="false"
```

## Database Setup

### Create PostgreSQL Database

```sql
-- Connect to PostgreSQL as superuser
CREATE DATABASE cipher_db;
CREATE USER cipher_user WITH PASSWORD 'secure_password';
GRANT ALL PRIVILEGES ON DATABASE cipher_db TO cipher_user;
```

### Grant Schema Permissions

```sql
-- Connect to cipher_db
GRANT USAGE, CREATE ON SCHEMA public TO cipher_user;
GRANT ALL ON ALL TABLES IN SCHEMA public TO cipher_user;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO cipher_user;
```

### Automatic Schema Creation

Core_Team-cipher will automatically create the necessary tables and indexes on first run:
- `cipher_store` - Key-value storage for sessions and configuration
- `cipher_lists` - List storage for ordered data
- `cipher_list_metadata` - Metadata for list operations
- Indexes for optimal query performance

## Cloud PostgreSQL Services

### Heroku Postgres
```bash
CIPHER_PG_URL=$DATABASE_URL  # Heroku provides this automatically
```

### Supabase
```bash
CIPHER_PG_URL="postgresql://postgres:[PASSWORD]@db.[PROJECT].supabase.co:5432/postgres"
```

### AWS RDS
```bash
CIPHER_PG_URL="postgresql://username:password@your-rds-instance.amazonaws.com:5432/cipher_db"
```

### Google Cloud SQL
```bash
CIPHER_PG_URL="postgresql://username:password@your-instance-ip:5432/cipher_db"
```

## Error Handling and Recovery

The PostgreSQL backend includes comprehensive error handling with automatic recovery mechanisms:

### Connection Error Handling
- Connection timeouts are automatically retried
- Network errors trigger reconnection attempts
- Authentication failures are logged for manual resolution

### Pool-Level Error Handling
- Pool errors are monitored and logged
- Connection recovery is attempted automatically
- Authentication errors require manual intervention

### Client-Level Error Handling
- Client errors are handled gracefully
- Failed connections are removed from the pool
- Operations are retried with new connections

## Performance Optimization

### Connection Pooling
```bash
# .env - Connection pooling
CIPHER_PG_URL="postgresql://user:pass@localhost:5432/cipher_db?max_connections=10"
```

### Database Indexes
Core_Team-cipher automatically creates indexes for optimal performance:
- Index on `cipher_store(updated_at)` for time-based queries
- Index on `cipher_lists(key)` for list operations
- Index on `cipher_lists(created_at)` for time-based list queries

## Troubleshooting

### Common Issues

**Connection Refused**
```
Error: connect ECONNREFUSED
```
**Solution:** Verify PostgreSQL is running and accessible.

**Authentication Failed**
```
Error: password authentication failed
```
**Solution:** Check username and password credentials.

**Database Does Not Exist**
```
Error: database "cipher_db" does not exist
```
**Solution:** Create the database and grant appropriate permissions.

### SSL Configuration

For managed database services with self-signed certificates:
```bash
CIPHER_PG_URL="postgresql://user:pass@hostname:5432/database?sslmode=require"
```

## Related Documentation

- [Chat History](./chat-history.md) - Session storage and management
- [Configuration](./configuration.md) - Main configuration guide
- [Vector Stores](./vector-stores.md) - Vector database setup