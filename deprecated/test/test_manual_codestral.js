import { CodestralEmbedder } from './src/core/brain/embedding/backend/codestral.js';

console.log("Manual test of CodestralEmbedder with 3072 dimensions...");

const config = {
    type: 'codestral',
    apiKey: process.env.MISTRAL_API_KEY,
    model: 'codestral-embed',
    baseUrl: 'https://api.mistral.ai',
    dimensions: 3072,
    timeout: 30000,
    maxRetries: 3,
};

const embedder = new CodestralEmbedder(config);

try {
    console.log("Expected dimension:", embedder.getDimension());
    
    console.log("Testing single embedding...");
    const result = await embedder.embed("Test text for manual embedding");
    console.log("Result dimensions:", result.length);
    console.log("First 5 values:", result.slice(0, 5));
    
    console.log("SUCCESS: Manual test completed");
} catch (error) {
    console.error("ERROR in manual test:", error.message);
}