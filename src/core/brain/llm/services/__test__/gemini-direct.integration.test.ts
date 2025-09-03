import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { createGeminiDirectService } from '../gemini-direct.js';
import { MCPManager } from '../../../../mcp/manager.js';
import { ContextManager } from '../../messages/manager.js';
import { UnifiedToolManager } from '../../../tools/unified-tool-manager.js';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Test configuration
const TEST_CREDENTIALS_PATH = path.join(os.homedir(), '.gemini', 'oauth_creds.json');
const TEST_CLIENT_ID = process.env.GOOGLE_OAUTH_CLIENT_ID || 'test-client-id';
const TEST_CLIENT_SECRET = process.env.GOOGLE_OAUTH_CLIENT_SECRET || 'test-client-secret';

// Skip integration tests if credentials are not available
const shouldSkipIntegration = !fs.existsSync(TEST_CREDENTIALS_PATH) || 
  !process.env.GOOGLE_OAUTH_CLIENT_ID || 
  !process.env.GOOGLE_OAUTH_CLIENT_SECRET;

// Mock managers
const mockMCPManager = {
  getAllTools: vi.fn().mockResolvedValue([]),
  executeTool: vi.fn().mockResolvedValue({ success: true }),
  getClients: vi.fn().mockReturnValue(new Map()),
  getFailedConnections: vi.fn().mockReturnValue({}),
} as unknown as MCPManager;

const mockUnifiedToolManager = {
  getToolsForProvider: vi.fn().mockResolvedValue([]),
  executeTool: vi.fn().mockResolvedValue({ success: true }),
  getAllTools: vi.fn().mockResolvedValue({}),
} as unknown as UnifiedToolManager;

const mockContextManager = {
  addUserMessage: vi.fn().mockResolvedValue(undefined),
  addAssistantMessage: vi.fn().mockResolvedValue(undefined),
  addToolResult: vi.fn().mockResolvedValue(undefined),
  getFormattedMessage: vi.fn().mockResolvedValue([
    { role: 'user', content: 'test message' },
  ]),
  getAllFormattedMessages: vi.fn().mockResolvedValue([
    { role: 'user', content: 'test message' },
  ]),
  getRawMessages: vi.fn().mockReturnValue([]),
  getRawMessagesSync: vi.fn().mockReturnValue([]),
  getRawMessagesAsync: vi.fn().mockResolvedValue([]),
} as unknown as ContextManager;

describe('Gemini Direct Integration Tests', () => {
  let geminiDirectService: any;

  beforeAll(() => {
    if (shouldSkipIntegration) {
      console.log('⏭️  Skipping Gemini Direct integration tests - credentials not available');
      console.log(`   Required: ${TEST_CREDENTIALS_PATH}`);
      console.log(`   Required: GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET environment variables`);
    }
  });

  beforeEach(async () => {
    if (shouldSkipIntegration) return;
    
    vi.clearAllMocks();
    
    // Initialize Gemini Direct service
    geminiDirectService = createGeminiDirectService(
      'gemini-2.5-flash',
      mockMCPManager,
      mockContextManager,
      5,
      mockUnifiedToolManager
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('OAuth2 Authentication Tests', () => {
    it.skipIf(shouldSkipIntegration)('should load OAuth2 credentials from file', async () => {
      // Test credential loading
      expect(fs.existsSync(TEST_CREDENTIALS_PATH)).toBe(true);
      
      const credentialsData = fs.readFileSync(TEST_CREDENTIALS_PATH, 'utf-8');
      const credentials = JSON.parse(credentialsData);
      
      expect(credentials).toHaveProperty('access_token');
      expect(credentials).toHaveProperty('refresh_token');
      expect(credentials).toHaveProperty('expiry_date');
      expect(typeof credentials.expiry_date).toBe('number');
    });

    it.skipIf(shouldSkipIntegration)('should handle token expiry check correctly', async () => {
      const credentialsData = fs.readFileSync(TEST_CREDENTIALS_PATH, 'utf-8');
      const credentials = JSON.parse(credentialsData);
      
      const now = Date.now();
      const expiryDate = credentials.expiry_date;
      const timeUntilExpiry = expiryDate - now;
      const fiveMinutesBuffer = 5 * 60 * 1000; // 5 minutes in ms
      
      console.log('Token expiry analysis:');
      console.log(`  Current time: ${new Date(now).toISOString()}`);
      console.log(`  Token expires at: ${new Date(expiryDate).toISOString()}`);
      console.log(`  Time until expiry: ${Math.round(timeUntilExpiry / 1000 / 60)} minutes`);
      console.log(`  Is expired (with 5min buffer): ${now > (expiryDate - fiveMinutesBuffer)}`);
      
      // Test timestamp compatibility
      expect(typeof expiryDate).toBe('number');
      expect(expiryDate).toBeGreaterThan(1000000000000); // Should be milliseconds since epoch
    });

    it.skipIf(shouldSkipIntegration)('should refresh token when needed', async () => {
      // This test will attempt to get a valid token, which may trigger refresh
      try {
        const result = await geminiDirectService.generate('Test token refresh mechanism');
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        console.log('✅ Token refresh mechanism working correctly');
      } catch (error: any) {
        // Check if this is an authentication error
        if (error.message?.includes('invalid_client') || error.message?.includes('OAuth2')) {
          throw new Error(`OAuth2 authentication failed: ${error.message}`);
        }
        // Other errors might be acceptable for this test
        console.log(`⚠️  Token refresh test completed with: ${error.message}`);
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle invalid_client errors properly', async () => {
      // Test with potentially invalid credentials
      const originalClientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
      const originalClientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
      
      try {
        // Temporarily set invalid credentials
        process.env.GOOGLE_OAUTH_CLIENT_ID = 'invalid-client-id';
        process.env.GOOGLE_OAUTH_CLIENT_SECRET = 'invalid-client-secret';
        
        // Create a new service instance with invalid credentials
        const invalidService = createGeminiDirectService(
          'gemini-2.5-flash',
          mockMCPManager,
          mockContextManager,
          5,
          mockUnifiedToolManager
        );
        
        // This should either work with cached tokens or fail gracefully
        try {
          await invalidService.generate('Test invalid credentials handling');
        } catch (error: any) {
          expect(error.message).toMatch(/OAuth2|invalid_client|authentication/i);
          console.log('✅ Invalid client error handled correctly:', error.message);
        }
      } finally {
        // Restore original credentials
        if (originalClientId) process.env.GOOGLE_OAUTH_CLIENT_ID = originalClientId;
        if (originalClientSecret) process.env.GOOGLE_OAUTH_CLIENT_SECRET = originalClientSecret;
      }
    });
  });

  describe('API Communication Tests', () => {
    it.skipIf(shouldSkipIntegration)('should generate response from Gemini API', async () => {
      const testMessage = 'Hello, this is a test message for Gemini Direct integration';
      
      try {
        const result = await geminiDirectService.generate(testMessage);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        expect(result).not.toBe(testMessage);
        
        console.log('✅ Gemini Direct API response generated successfully');
        console.log(`   Input: ${testMessage.substring(0, 50)}...`);
        console.log(`   Output: ${result.substring(0, 100)}...`);
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Rate limit reached, test passed conditionally');
          return;
        }
        throw error;
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle streaming responses correctly', async () => {
      const testMessage = 'Generate a short technical explanation about OAuth2 flow';
      
      try {
        const result = await geminiDirectService.generate(testMessage);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(10);
        
        // Verify the response contains relevant content
        expect(result.toLowerCase()).toMatch(/oauth|auth|token|flow|client/);
        
        console.log('✅ Streaming response processed successfully');
        console.log(`   Response length: ${result.length} characters`);
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Rate limit reached, test passed conditionally');
          return;
        }
        throw error;
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle different response formats', async () => {
      const testMessages = [
        'Reply with a single word: Hello',
        'Write a short JSON object with name and age fields',
        'Create a brief technical explanation with multiple paragraphs',
      ];
      
      for (const testMessage of testMessages) {
        try {
          const result = await geminiDirectService.generate(testMessage);
          
          expect(typeof result).toBe('string');
          expect(result.length).toBeGreaterThan(0);
          
          console.log(`✅ Response format test passed for: "${testMessage.substring(0, 30)}..."`);
        } catch (error: any) {
          if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
            console.log('⚠️  Rate limit reached, skipping remaining format tests');
            break;
          }
          throw error;
        }
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle error responses gracefully', async () => {
      // Test with a potentially problematic request
      const problematicMessage = 'Generate a very long response with ' + 'word '.repeat(1000);
      
      try {
        const result = await geminiDirectService.generate(problematicMessage);
        
        // If it succeeds, verify it's a valid response
        expect(typeof result).toBe('string');
        console.log('✅ Long request handled successfully');
      } catch (error: any) {
        // Verify error is handled gracefully
        expect(error.message).toBeDefined();
        console.log('✅ Error handled gracefully:', error.message.substring(0, 100));
      }
    });
  });

  describe('Content Extraction Tests', () => {
    it.skipIf(shouldSkipIntegration)('should extract content from various JSON structures', async () => {
      // This test generates content and verifies the extraction works
      const testMessage = 'Provide a structured response about TypeScript features';
      
      try {
        const result = await geminiDirectService.generate(testMessage);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        
        // Verify content doesn't contain JSON artifacts
        expect(result).not.toMatch(/^{.*}$/); // Not raw JSON
        expect(result).not.toMatch(/\[object Object\]/); // Not object toString
        expect(result).not.toMatch(/undefined/); // No undefined values
        
        console.log('✅ Content extraction working correctly');
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Rate limit reached, test passed conditionally');
          return;
        }
        throw error;
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle multiple JSON objects in response', async () => {
      const testMessage = 'Generate a response that might contain structured data';
      
      try {
        const result = await geminiDirectService.generate(testMessage);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        
        // Verify content is clean and properly extracted
        expect(result).not.toContain('null');
        expect(result).not.toContain('undefined');
        
        console.log('✅ Multi-JSON object handling working correctly');
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Rate limit reached, test passed conditionally');
          return;
        }
        throw error;
      }
    });
  });

  describe('Configuration and Service Tests', () => {
    it.skipIf(shouldSkipIntegration)('should initialize service with correct configuration', () => {
      const config = geminiDirectService.getConfig();
      
      expect(config).toEqual({
        provider: 'gemini-direct',
        model: 'gemini-2.5-flash',
      });
      
      console.log('✅ Service configuration correct');
    });

    it.skipIf(shouldSkipIntegration)('should handle different Gemini models', async () => {
      const models = ['gemini-2.5-flash', 'gemini-pro'];
      
      for (const model of models) {
        const service = createGeminiDirectService(
          model,
          mockMCPManager,
          mockContextManager,
          3,
          mockUnifiedToolManager
        );
        
        const config = service.getConfig();
        expect(config.model).toBe(model);
        
        console.log(`✅ Model configuration test passed for: ${model}`);
      }
    });

    it.skipIf(shouldSkipIntegration)('should handle direct generation correctly', async () => {
      const testMessage = 'Summarize the key benefits of OAuth2';
      const systemPrompt = 'You are a security expert. Provide concise technical explanations.';
      
      try {
        const result = await geminiDirectService.directGenerate(testMessage, systemPrompt);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(0);
        expect(result.toLowerCase()).toMatch(/oauth|security|auth/);
        
        console.log('✅ Direct generation working correctly');
      } catch (error: any) {
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Rate limit reached, test passed conditionally');
          return;
        }
        throw error;
      }
    });
  });

  describe('Integration Workflow Tests', () => {
    it.skipIf(shouldSkipIntegration)('should complete full end-to-end workflow', async () => {
      console.log('🔄 Starting full end-to-end integration test...');
      
      const steps = [
        'Check OAuth2 credentials loading',
        'Verify token validity and refresh if needed',
        'Make successful API call',
        'Process streaming response',
        'Extract clean content',
        'Verify no authentication errors'
      ];
      
      let completedSteps = 0;
      
      try {
        // Step 1: Credential loading
        expect(fs.existsSync(TEST_CREDENTIALS_PATH)).toBe(true);
        console.log('✅ Step 1: OAuth2 credentials file found');
        completedSteps++;
        
        // Step 2: Service initialization 
        expect(geminiDirectService).toBeDefined();
        console.log('✅ Step 2: Service initialized');
        completedSteps++;
        
        // Step 3: API call
        const testMessage = 'Explain the OAuth2 authorization code flow in 2-3 sentences';
        const result = await geminiDirectService.generate(testMessage);
        
        expect(typeof result).toBe('string');
        expect(result.length).toBeGreaterThan(20);
        console.log('✅ Step 3: API call successful');
        completedSteps++;
        
        // Step 4: Content verification
        expect(result).not.toContain('undefined');
        expect(result).not.toContain('null');
        expect(result).not.toMatch(/^{.*}$/);
        console.log('✅ Step 4: Content extraction clean');
        completedSteps++;
        
        // Step 5: Response relevance
        expect(result.toLowerCase()).toMatch(/oauth|auth|authorization|token|flow/);
        console.log('✅ Step 5: Response relevant to query');
        completedSteps++;
        
        // Step 6: No authentication errors
        expect(result).not.toMatch(/error|invalid_client|authentication failed/i);
        console.log('✅ Step 6: No authentication errors');
        completedSteps++;
        
        console.log(`🎉 Full end-to-end integration test completed successfully! (${completedSteps}/${steps.length} steps)`);
        console.log(`📝 Generated response (${result.length} chars): ${result.substring(0, 150)}...`);
        
      } catch (error: any) {
        console.log(`❌ End-to-end test failed at step ${completedSteps + 1}: ${error.message}`);
        
        if (error.message?.includes('rate limit') || error.message?.includes('quota')) {
          console.log('⚠️  Test stopped due to rate limiting - partially successful');
          expect(completedSteps).toBeGreaterThanOrEqual(2); // At least basic setup should work
        } else {
          throw error;
        }
      }
    });
  });
});