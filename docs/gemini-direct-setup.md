# Gemini Direct OAuth2 Setup Guide

This guide provides step-by-step instructions for setting up Gemini Direct OAuth2 authentication with Core_Team-cipher.

## Overview

Gemini Direct uses OAuth2 authentication to access Google's Gemini models without requiring API keys. This provides:

- **No API key management** - Authentication through Google OAuth2
- **Higher rate limits** - Direct access to Google's infrastructure  
- **Latest models** - Access to Google's most recent Gemini releases

## Prerequisites

- Google Cloud Console account
- Node.js >=20.0.0 and pnpm >=9.14.0
- Core_Team-cipher installed globally or locally

## Step 1: Google Cloud Console Setup

### 1.1 Create OAuth2 Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Navigate to **APIs & Services > Credentials**
4. Click **+ CREATE CREDENTIALS** → **OAuth client ID**
5. Select **Desktop application** as the application type
6. Name your OAuth client (e.g., "Core_Team-cipher Gemini Direct")
7. Click **Create**

### 1.2 Download Credentials

1. Click the download icon next to your created OAuth client
2. Save the JSON file securely
3. Extract `client_id` and `client_secret` from the file

## Step 2: Environment Configuration

### 2.1 Set Environment Variables

Create or update your `.env` file:

```bash
# Gemini Direct OAuth2 Credentials
GOOGLE_OAUTH_CLIENT_ID=your-google-oauth-client-id.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=your-google-oauth-client-secret
```

### 2.2 Core_Team-cipher Configuration

Update your `memAgent/cipher.yml`:

```yaml
llm:
  provider: gemini-direct
  model: gemini-2.5-flash
  # No apiKey required - uses OAuth2
```

## Step 3: OAuth2 Authentication Flow

### 3.1 Initial Authentication

When you first use Core_Team-cipher with Gemini Direct, you'll need to complete the OAuth2 flow:

1. **Start Core_Team-cipher**: Run `cipher` in interactive mode
2. **Authentication prompt**: Core_Team-cipher will prompt for OAuth2 authentication
3. **Browser redirect**: Follow the Google OAuth2 flow in your browser
4. **Grant permissions**: Allow Core_Team-cipher access to Google services
5. **Return to CLI**: Complete authentication in your terminal

### 3.2 Credential Storage

Upon successful authentication, credentials are stored in:
```
~/.gemini/oauth_creds.json
```

This file contains:
```json
{
  "access_token": "ya29.a0...",
  "refresh_token": "1//04...", 
  "expiry_date": 1704067200000
}
```

## Step 4: Verification

### 4.1 Test Connection

```bash
cipher "Hello, test Gemini Direct connection"
```

### 4.2 Check Logs

If issues occur, check logs for OAuth2 status:
- Token expiry information
- Refresh token operations  
- Authentication errors

## Troubleshooting

### Common Issues

#### "invalid_client" Error

**Symptoms:**
```
OAuth2 token refresh failed: 400 Bad Request
Error: invalid_client
```

**Solutions:**
1. **Verify credentials**: Ensure `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` are correct
2. **Check environment**: Confirm environment variables are loaded properly
3. **Recreate OAuth client**: Delete and recreate OAuth2 credentials in Google Cloud Console
4. **Clear stored credentials**: Remove `~/.gemini/oauth_creds.json` and re-authenticate

#### Token Refresh Issues

**Symptoms:**
```
Token refresh failed, OAuth2 authentication unavailable
```

**Solutions:**
1. **Re-authenticate**: Delete `~/.gemini/oauth_creds.json` and run Core_Team-cipher again
2. **Check token expiry**: Verify token timestamps in logs
3. **Network connectivity**: Ensure access to `oauth2.googleapis.com`

#### Authentication Flow Problems

**Symptoms:**
- Browser doesn't open for OAuth2 flow
- "Failed to load OAuth2 credentials from file"

**Solutions:**
1. **Manual credential creation**: Create `~/.gemini/oauth_creds.json` manually
2. **Directory permissions**: Ensure `~/.gemini/` directory exists and is writable
3. **Alternative authentication**: Consider using traditional Gemini API key as fallback

### Debug Mode

Enable debug logging in your `.env`:
```bash
CIPHER_LOG_LEVEL=debug
```

This provides detailed OAuth2 flow information:
- Token status and expiry times
- Refresh attempts and responses
- Credential file operations

### Error Codes Reference

| Error Code | Description | Solution |
|------------|-------------|----------|
| `invalid_client` | OAuth2 credentials are invalid | Verify `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET` |
| `invalid_grant` | Refresh token expired | Re-authenticate by deleting stored credentials |
| `unauthorized_client` | Client not authorized for this grant type | Check OAuth2 client configuration in Google Cloud Console |
| `access_denied` | User denied OAuth2 permissions | Grant necessary permissions during authentication flow |

## Security Best Practices

### 1. Environment Variable Security
- Never commit `.env` files to version control
- Use secure environment variable management in production
- Regularly rotate OAuth2 credentials

### 2. Credential File Protection
- Ensure `~/.gemini/oauth_creds.json` has appropriate file permissions (600)
- Regular backup and secure storage of OAuth2 configuration
- Monitor for unauthorized access to credential files

### 3. OAuth2 Scope Management
- Only grant minimum required permissions
- Regularly audit OAuth2 application permissions in Google account settings
- Remove unused OAuth2 applications

## Advanced Configuration

### Custom Credential Path

Override the default credential file location:
```bash
export OAUTH_CREDS_PATH="/custom/path/to/oauth_creds.json"
```

### Project ID Configuration

Set a specific Google Cloud Project ID:
```bash
export GEMINI_PROJECT_ID="your-project-id"
```

### Rate Limit Optimization

Gemini Direct provides higher rate limits compared to API key usage. Monitor usage in Google Cloud Console under "APIs & Services > Quotas".

## Related Documentation

- [LLM Providers](./llm-providers.md) - Overview of all supported providers
- [Configuration](./configuration.md) - Main Core_Team-cipher configuration guide
- [CLI Reference](./cli-reference.md) - Complete command-line interface documentation

## Support

For additional support:
- Check Core_Team-cipher logs with `CIPHER_LOG_LEVEL=debug`
- Review [Google OAuth2 documentation](https://developers.google.com/identity/protocols/oauth2)
- Join [Core_Team-cipher Discord community](https://discord.com/invite/UMRrpNjh5W)