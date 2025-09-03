// Test Codestral embedding configuration
const config = {
  type: 'codestral',
  apiKey: process.env.MISTRAL_API_KEY,
  model: 'codestral-embed',
  baseUrl: 'https://api.mistral.ai',
  dimensions: 3072,
  timeout: 30000,
  maxRetries: 3,
  disabled: false
};

console.log('Testing Codestral embedding config:');
console.log('API Key present:', !!config.apiKey);
console.log('API Key value:', config.apiKey);
console.log('Config:', JSON.stringify(config, null, 2));

// Test the config structure matches what's expected
const needsApiKey = ['openai', 'gemini', 'anthropic', 'voyage', 'qwen', 'codestral'].includes(config.type);
console.log('Needs API key:', needsApiKey);
console.log('API key provided:', !!config.apiKey && config.apiKey.trim() !== '');