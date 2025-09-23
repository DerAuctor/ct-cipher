# Codestral Embedding Integration

**Mandatory Provider Note:** Codestral-embed is the mandatory embedding provider for all embedding tasks in the ct-cipher project.

Core_Team-cipher now supports Codestral embeddings through the Mistral API, providing high-quality embeddings optimized for code and technical content.

## Overview

Codestral embeddings are specialized for code and technical content, offering 3072 dimensions for detailed semantic representation. This integration uses the official Mistral API to provide excellent performance for software development tasks.

## Configuration

### Basic Configuration

Add the following to your `memAgent/cipher.yml` file:

```yaml
embedding:
  type: codestral
  model: codestral-embed
  apiKey: ${MISTRAL_API_KEY}
  baseUrl: https://api.mistral.ai
  dimensions: 3072
  timeout: 30000
  maxRetries: 3
```

### Environment Variables

Set the following environment variable in your `.env` file:

```bash
# Codestral/Mistral (Recommended)
MISTRAL_API_KEY=your-mistral-api-key
```

## Features

- **High-quality embeddings**: Optimized for code and technical content
- **3072 dimensions**: For detailed semantic representation
- **Direct integration**: With Mistral API
- **Excellent performance**: For software development tasks

## Supported Models

- `codestral-embed` - Specialized for code and technical content (3072 dimensions)

## Troubleshooting

### Common Issues

**API Key Issues**
```
Error: Authentication failed
```
**Solution:** Verify your API key is correct and has embedding permissions.

**Network Issues**
```
Error: Connection refused
```
**Solution:** Ensure network connectivity to `https://api.mistral.ai`.

### Performance Tips

1. **Choose appropriate timeout**: Set `timeout` based on your network conditions
2. **Set retry limits**: Adjust `maxRetries` for better reliability
3. **Monitor usage**: Keep track of your API usage to avoid rate limits

## Related Documentation

- [Embedding Configuration](./embedding-configuration.md) - Advanced embedding setup
- [Configuration](./configuration.md) - Main configuration guide
- [LLM Providers](./llm-providers.md) - LLM configuration
