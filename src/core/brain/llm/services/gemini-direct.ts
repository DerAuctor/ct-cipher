/**
 * Direct Gemini API Client - KISS approach
 * Simple and direct communication with Google's Code Assist API using OAuth2 credentials
 * Based on GewoonJaap's approach but simplified for Core_Team-cipher needs
 * 1:1 port from Anubis gemini_direct_client.py
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { fetch, Response } from 'undici';
import { ILLMService, LLMServiceConfig } from './types.js';
import { ToolSet } from '../../../mcp/types.js';
import { MCPManager } from '../../../mcp/manager.js';
import { UnifiedToolManager } from '../../tools/unified-tool-manager.js';
import { ContextManager } from '../messages/manager.js';
import { ImageData } from '../messages/types.js';
import { logger } from '../../../logger/index.js';

// Custom exception for rate limiting
export class GeminiRateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'GeminiRateLimitError';
    }
}

// Google Code Assist API Constants (correct endpoints from GewoonJaap)
const CODE_ASSIST_ENDPOINT = 'https://cloudcode-pa.googleapis.com';
const CODE_ASSIST_API_VERSION = 'v1internal';

// OAuth2 Configuration (from GewoonJaap's implementation)
const OAUTH_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || '681255809395-oo8ft2oprdrnp9e3aqf6av3hmdib135j.apps.googleusercontent.com';
const OAUTH_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || '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';
const OAUTH_REFRESH_URL = 'https://oauth2.googleapis.com/token';

// OAuth2 credentials file path
const OAUTH_CREDS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');

interface OAuth2Credentials {
    access_token: string;
    refresh_token: string;
    expiry_date: number;
}

class GeminiOAuth2Manager {
    private credentials: OAuth2Credentials | null = null;
    private access_token: string | null = null;
    private refresh_token: string | null = null;
    private expiry_date: number | null = null;

    loadCredentials(): boolean {
        try {
            if (!fs.existsSync(OAUTH_CREDS_PATH)) {
                logger.error('OAuth credentials file not found: %s', OAUTH_CREDS_PATH);
                return false;
            }

            const credentialsData = fs.readFileSync(OAUTH_CREDS_PATH, 'utf-8');
            this.credentials = JSON.parse(credentialsData) as OAuth2Credentials;

            this.access_token = this.credentials.access_token;
            this.refresh_token = this.credentials.refresh_token;
            this.expiry_date = this.credentials.expiry_date;

            logger.info('OAuth2 credentials loaded successfully');
            return true;

        } catch (error) {
            logger.error('Failed to load OAuth2 credentials: %s', error);
            return false;
        }
    }

    isTokenExpired(): boolean {
        if (!this.expiry_date) {
            return true;
        }
        // Add 5 minute buffer
        return Date.now() > (this.expiry_date - 300000);
    }

    async refreshAccessToken(): Promise<boolean> {
        if (!this.refresh_token) {
            logger.error('No refresh token available');
            return false;
        }

        // Debug: Log token status before refresh
        logger.debug('OAuth2 Token Refresh Debug Info:');
        logger.debug('- Token expires at: %s', new Date(this.expiry_date || 0).toISOString());
        logger.debug('- Current time: %s', new Date().toISOString());
        logger.debug('- Time until expiry: %d minutes', Math.round(((this.expiry_date || 0) - Date.now()) / 60000));
        logger.debug('- Refresh URL: %s', OAUTH_REFRESH_URL);
        logger.debug('- Client ID: %s', OAUTH_CLIENT_ID ? OAUTH_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET');

        try {
            const requestBody = new URLSearchParams({
                client_id: OAUTH_CLIENT_ID,
                client_secret: OAUTH_CLIENT_SECRET,
                refresh_token: this.refresh_token,
                grant_type: 'refresh_token',
            });

            logger.debug('Sending OAuth2 refresh request...');
            const response = await fetch(OAUTH_REFRESH_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: requestBody,
            });

            // Debug: Log response details
            logger.debug('OAuth2 refresh response received:');
            logger.debug('- Status: ' + response.status + ' ' + response.statusText);
            logger.debug('- Headers: %s', JSON.stringify(Object.fromEntries(response.headers.entries())));

            if (response.ok) {
                const tokenData = await response.json() as { access_token: string, expires_in?: number };
                this.access_token = tokenData.access_token;
                
                // Update expiry based on response or default to 1 hour
                const expiresIn = tokenData.expires_in || 3600;
                this.expiry_date = Date.now() + (expiresIn * 1000);

                logger.debug('Token refresh successful:');
                logger.debug('- New token length: %d characters', this.access_token.length);
                logger.debug('- New expiry: %s', new Date(this.expiry_date).toISOString());
                logger.debug('- Expires in: %d seconds', expiresIn);

                // Update credentials file
                if (this.credentials) {
                    this.credentials.access_token = this.access_token;
                    this.credentials.expiry_date = this.expiry_date;

                    try {
                        fs.writeFileSync(OAUTH_CREDS_PATH, JSON.stringify(this.credentials, null, 2));
                        logger.debug('Credentials file updated successfully');
                    } catch (writeError) {
                        logger.warn('Failed to update credentials file: %s', writeError);
                    }
                }

                logger.info('Access token refreshed successfully');
                return true;
            } else {
                const errorText = await response.text();
                logger.error('OAuth2 token refresh failed:');
                logger.error('- Status: ' + response.status + ' ' + response.statusText);
                
                // Try to parse error as JSON for better logging
                try {
                    const errorData = JSON.parse(errorText);
                    logger.error('- Error response: %s', JSON.stringify(errorData, null, 2));
                    if (errorData.error) {
                        logger.error('- Error: %s', errorData.error);
                    }
                    if (errorData.error_description) {
                        logger.error('- Error description: %s', errorData.error_description);
                    }
                } catch (parseError) {
                    logger.error('- Error response: %s', errorText);
                }
                
                // Additional debug for common OAuth2 errors
                if (response.status === 400) {
                    logger.error('Bad Request - possible invalid refresh_token or client credentials');
                    logger.error('Check if GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are correctly set');
                    try {
                        const errorData = JSON.parse(errorText);
                        if (errorData.error === 'invalid_client') {
                            logger.error('CRITICAL: OAuth client credentials are invalid or not found');
                            logger.error('Using Client ID: %s', OAUTH_CLIENT_ID ? OAUTH_CLIENT_ID.substring(0, 20) + '...' : 'NOT SET');
                            logger.error('Client Secret present: %s', OAUTH_CLIENT_SECRET ? 'YES' : 'NO');
                        }
                    } catch (e) {
                        // Ignore JSON parse error
                    }
                } else if (response.status === 401) {
                    logger.error('Unauthorized - refresh_token expired or client authentication failed');
                } else if (response.status === 403) {
                    logger.error('Forbidden - client not authorized for refresh_token grant');
                } else if (response.status >= 500) {
                    logger.error('Server Error - OAuth2 provider temporary issue');
                }
                
                return false;
            }

        } catch (error) {
            logger.error('OAuth2 token refresh network/parsing error: %s', error);
            logger.error('This may indicate network connectivity issues or malformed response');
            return false;
        }
    }

    async getValidToken(): Promise<string | null> {
        logger.debug('OAuth2 getValidToken() called');
        
        // Load credentials if not already loaded
        if (!this.access_token) {
            logger.debug('No access token in memory, attempting to load credentials');
            if (!this.loadCredentials()) {
                logger.error('Failed to load OAuth2 credentials from file');
                return null;
            }
            logger.debug('Credentials loaded from file successfully');
        }

        // Check token expiry status
        const isExpired = this.isTokenExpired();
        logger.debug('Token expiry check: %s', isExpired ? 'EXPIRED' : 'VALID');
        
        // Refresh token if expired
        if (isExpired) {
            logger.debug('Token expired, initiating refresh...');
            if (!(await this.refreshAccessToken())) {
                logger.error('Token refresh failed, OAuth2 authentication unavailable');
                return null;
            }
            logger.debug('Token refresh completed successfully');
        }

        logger.debug('Returning valid access token (length: %d)', this.access_token?.length || 0);
        return this.access_token;
    }
}

export class DirectGeminiAPIClient {
    private oauth_manager = new GeminiOAuth2Manager();
    private project_id: string | null = null;

    async discoverProjectId(): Promise<string> {
        if (this.project_id) {
            return this.project_id;
        }

        // Try environment variable first
        const envProject = process.env.GEMINI_PROJECT_ID;
        if (envProject) {
            this.project_id = envProject;
            return envProject;
        }

        // Use default project discovery
        const token = await this.oauth_manager.getValidToken();
        if (!token) {
            throw new Error('Failed to get valid OAuth2 token');
        }

        try {
            const loadData = {
                cloudaicompanionProject: 'default-project',
                metadata: { duetProject: 'default-project' },
            };

            const response = await fetch(
                `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:loadCodeAssist`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(loadData),
                }
            );

            if (response.ok) {
                const data = await response.json() as { cloudaicompanionProject?: string };
                const projectId = data.cloudaicompanionProject;
                if (projectId) {
                    this.project_id = projectId;
                    return projectId;
                }
            }

            // Fallback to default
            this.project_id = 'default-project';
            return 'default-project';

        } catch (error) {
            logger.warn('Project discovery failed, using default: %s', error);
            this.project_id = 'default-project';
            return 'default-project';
        }
    }

    private messagesToContents(messages: Array<{ role: string; content: string }>, systemPrompt?: string): Array<{ role: string; parts: Array<{ text: string }> }> {
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

        // Add system prompt as first user message if provided
        if (systemPrompt) {
            contents.push({
                role: 'user',
                parts: [{ text: systemPrompt }]
            });
        }

        // Convert conversation history
        for (const message of messages) {
            if (message.role === 'system') {
                // Add system messages as user messages (Gemini doesn't have system role)
                contents.push({
                    role: 'user',
                    parts: [{ text: `System: ${message.content}` }]
                });
            } else if (message.role === 'user') {
                contents.push({
                    role: 'user',
                    parts: [{ text: message.content }]
                });
            } else if (message.role === 'assistant') {
                contents.push({
                    role: 'model',
                    parts: [{ text: message.content }]
                });
            }
        }

        return contents;
    }

    async generateCompletion(model: string, messages: Array<{ role: string; content: string }>, systemPrompt?: string, options: any = {}): Promise<string> {
        const token = await this.oauth_manager.getValidToken();
        if (!token) {
            throw new Error('Failed to get valid OAuth2 token');
        }

        const projectId = await this.discoverProjectId();
        const contents = this.messagesToContents(messages, systemPrompt);

        const requestData = {
            model,
            project: projectId,
            request: {
                contents,
                generationConfig: {
                    temperature: options.temperature || 0.7,
                    maxOutputTokens: options.maxTokens || 8192,
                },
            },
        };

        try {
            const response = await this.makeStreamingRequest(requestData, token);
            return await this.processStreamingResponse(response);
        } catch (error) {
            logger.error('API call failed: %s', error);
            throw error;
        }
    }

    private async makeStreamingRequest(requestData: any, token: string): Promise<Response> {
        try {
            let response = await fetch(
                `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestData),
                }
            );

            if (response.status === 401) {
                // Token expired, refresh and retry
                logger.info('Token expired, refreshing...');
                if (await this.oauth_manager.refreshAccessToken()) {
                    const newToken = await this.oauth_manager.getValidToken();
                    response = await fetch(
                        `${CODE_ASSIST_ENDPOINT}/${CODE_ASSIST_API_VERSION}:streamGenerateContent`,
                        {
                            method: 'POST',
                            headers: {
                                'Authorization': `Bearer ${newToken}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify(requestData),
                        }
                    );
                } else {
                    throw new Error('Token refresh failed');
                }
            }

            if (!response.ok) {
                const errorText = await response.text();

                // Special handling for rate limiting (429)
                if (response.status === 429) {
                    logger.warn('Gemini API rate limit exceeded (429): %s', errorText);
                    const retryAfter = response.headers.get('Retry-After') || '60';
                    const retrySeconds = parseInt(retryAfter, 10) || 60;

                    throw new GeminiRateLimitError(
                        `Rate limit exceeded. Retry after ${retrySeconds}s: ${errorText}`
                    );
                }

                throw new Error(`API request failed: ${response.status} - ${errorText}`);
            }

            return response;

        } catch (error) {
            logger.error('Request failed: %s', error);
            throw error;
        }
    }

    private async processStreamingResponse(response: Response): Promise<string> {
        logger.info('Processing streaming response from Gemini API...');

        let completeContent = '';
        let chunkCount = 0;

        // Check content type to determine parsing method
        const contentType = response.headers.get('content-type') || '';

        if (contentType.includes('text/event-stream') || contentType.includes('application/x-ndjson')) {
            // Handle Server-Sent Events or newline-delimited JSON
            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error('Response body is not readable');
            }

            const decoder = new TextDecoder();
            let buffer = '';

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || ''; // Keep incomplete line in buffer

                    for (const line of lines) {
                        if (line.trim()) {
                            const contentChunk = this.parseStreamingChunk(line.trim());
                            if (contentChunk) {
                                completeContent += contentChunk;
                                chunkCount++;
                            }
                        }
                    }
                }
            } finally {
                reader.releaseLock();
            }
        } else {
            // Handle regular JSON response (may still be streaming)
            try {
                const responseText = await response.text();
                logger.info(`Raw response text length: ${responseText.length}`);

                // Try to parse as JSON
                try {
                    const data = JSON.parse(responseText);
                    completeContent = this.extractContentFromJson(data);
                } catch (jsonError) {
                    // If JSON parsing fails, try processing as multiple JSON objects
                    completeContent = this.parseMultipleJsonObjects(responseText);
                }

            } catch (error) {
                logger.error('Failed to process response: %s', error);
                throw error;
            }
        }

        logger.info(
            `Streaming complete - total content length: ${completeContent.length}, chunks: ${chunkCount}`
        );

        if (!completeContent) {
            throw new Error('No content received from streaming response');
        }

        return completeContent;
    }

    private parseStreamingChunk(chunkStr: string): string {
        try {
            // Remove SSE prefixes if present
            if (chunkStr.startsWith('data: ')) {
                chunkStr = chunkStr.substring(6);
            }

            if (chunkStr === '[DONE]' || !chunkStr) {
                return '';
            }

            const data = JSON.parse(chunkStr);
            return this.extractContentFromJson(data);

        } catch (error) {
            logger.warn('Failed to parse chunk as JSON: %s...', chunkStr.substring(0, 100));
            return '';
        }
    }

    private parseMultipleJsonObjects(text: string): string {
        let completeContent = '';

        // Split by newlines and try to parse each line as JSON
        for (const line of text.split('\n')) {
            const trimmedLine = line.trim();
            if (trimmedLine) {
                try {
                    const data = JSON.parse(trimmedLine);
                    const content = this.extractContentFromJson(data);
                    if (content) {
                        completeContent += content;
                    }
                } catch (error) {
                    continue;
                }
            }
        }

        return completeContent;
    }

    private extractContentFromJson(data: any): string {
        try {
            // Handle different response structures
            if (Array.isArray(data)) {
                // Handle list response (multiple chunks)
                let content = '';
                for (const chunk of data) {
                    const chunkContent = this.extractContentFromJson(chunk);
                    if (chunkContent) {
                        content += chunkContent;
                    }
                }
                return content;
            } else if (typeof data === 'object' && data !== null) {
                // Handle various JSON structures
                if (data.response && data.response.candidates) {
                    // Standard structure
                    const candidates = data.response.candidates;
                    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
                        return candidates[0].content.parts[0].text || '';
                    }
                } else if (data.candidates) {
                    // Direct candidates structure
                    const candidates = data.candidates;
                    if (candidates.length > 0 && candidates[0].content && candidates[0].content.parts) {
                        return candidates[0].content.parts[0].text || '';
                    }
                } else if (data.content && data.content.parts) {
                    // Direct content structure
                    return data.content.parts[0].text || '';
                } else if (data.text) {
                    // Direct text
                    return data.text;
                }

                // Fallback: recursively search for text
                return this.extractTextRecursively(data);
            }

        } catch (error) {
            logger.warn('Error extracting content from JSON: %s', error);
        }

        return '';
    }

    private extractTextRecursively(obj: any): string {
        if (typeof obj === 'object' && obj !== null) {
            if ('text' in obj) {
                return obj.text;
            }
            if (Array.isArray(obj)) {
                for (const item of obj) {
                    const result = this.extractTextRecursively(item);
                    if (result) {
                        return result;
                    }
                }
            } else {
                for (const value of Object.values(obj)) {
                    const result = this.extractTextRecursively(value);
                    if (result) {
                        return result;
                    }
                }
            }
        }
        return '';
    }
}

export class GeminiDirectService implements ILLMService {
    private client = new DirectGeminiAPIClient();
    private model: string;
    private mcpManager: MCPManager;
    private contextManager: ContextManager;
    private maxIterations: number;
    private unifiedToolManager: UnifiedToolManager | undefined;

    constructor(
        model: string,
        mcpManager: MCPManager,
        contextManager: ContextManager,
        maxIterations: number = 50,
        unifiedToolManager?: UnifiedToolManager
    ) {
        this.model = model;
        this.mcpManager = mcpManager;
        this.contextManager = contextManager;
        this.maxIterations = maxIterations;
        this.unifiedToolManager = unifiedToolManager;
    }

    async generate(userInput: string, imageData?: ImageData, stream?: boolean): Promise<string> {
        try {
            logger.debug('[GeminiDirectService] Generating response', {
                inputLength: userInput.length,
                hasImageData: !!imageData,
                stream,
            });

            // Get conversation history
            const conversationHistory = await this.contextManager.getRawMessagesAsync();
            
            // Convert InternalMessage to simple message format
            const messages = conversationHistory.map(msg => ({
                role: msg.role,
                content: typeof msg.content === 'string' ? msg.content : 
                        Array.isArray(msg.content) ? msg.content.map(seg => seg.type === 'text' ? seg.text : '[image]').join('') :
                        msg.content || ''
            }));
            
            // Add current user input to history
            messages.push({ role: 'user', content: userInput });

            const content = await this.client.generateCompletion(
                this.model,
                messages,
                undefined, // system prompt handled by context manager
                {
                    temperature: 0.7,
                    maxTokens: 8192,
                }
            );

            // Update conversation history with response
            await this.contextManager.addUserMessage(userInput, imageData);
            await this.contextManager.addAssistantMessage(content);

            return content;
        } catch (error) {
            logger.error('[GeminiDirectService] Failed to generate response:', error);
            throw new Error(`Gemini Direct API call failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async directGenerate(userInput: string, systemPrompt?: string): Promise<string> {
        try {
            logger.debug('[GeminiDirectService] Direct generate call (bypassing conversation context)', {
                inputLength: userInput.length,
                hasSystemPrompt: !!systemPrompt,
            });

            const messages = [{ role: 'user', content: userInput }];

            const content = await this.client.generateCompletion(
                this.model,
                messages,
                systemPrompt,
                {
                    temperature: 0.7,
                    maxTokens: 8192,
                }
            );

            return content;
        } catch (error) {
            logger.error('[GeminiDirectService] Direct generate failed:', error);
            throw new Error(`Gemini Direct API call failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async getAllTools(): Promise<ToolSet> {
        const mcpTools = await this.mcpManager.getAllTools();
        const internalTools = this.unifiedToolManager?.getToolsForProvider('gemini-direct') || [];
        
        return {
            ...mcpTools,
            ...((internalTools as any) || {}),
        } as ToolSet;
    }

    getConfig(): LLMServiceConfig {
        return {
            provider: 'gemini-direct',
            model: this.model,
        };
    }
}

// Factory function for easier integration
export function createGeminiDirectService(
    model: string,
    mcpManager: MCPManager,
    contextManager: ContextManager,
    maxIterations: number = 50,
    unifiedToolManager?: UnifiedToolManager
): GeminiDirectService {
    return new GeminiDirectService(model, mcpManager, contextManager, maxIterations, unifiedToolManager);
}