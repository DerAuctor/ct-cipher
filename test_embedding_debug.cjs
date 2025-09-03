#!/usr/bin/env node

const path = require('path');
const fs = require('fs');

// Set up environment
process.chdir(__dirname);

// Import the service initializer directly
async function testEmbedding() {
    try {
        console.log('=== EMBEDDING DEBUG TEST ===');
        
        // Load environment
        require('dotenv').config();
        
        console.log('Environment check:');
        console.log('- MISTRAL_API_KEY length:', process.env.MISTRAL_API_KEY?.length || 'not set');
        
        // Load cipher.yml configuration  
        const yaml = require('js-yaml');
        const configPath = path.join(__dirname, 'memAgent', 'cipher.yml');
        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = yaml.load(configContent);
        
        console.log('Config embedding section:', JSON.stringify(config.embedding, null, 2));
        
        // Import service initializer from the bundled core
        const { createAgentServices } = require('./dist/src/core/index.cjs');
        
        console.log('Calling createAgentServices...');
        const services = await createAgentServices(config);
        
        console.log('Services created:', Object.keys(services));
        console.log('Has embeddingManager:', !!services.embeddingManager);
        
    } catch (error) {
        console.error('Test failed:', error);
        console.error('Stack:', error.stack);
    }
}

testEmbedding().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});