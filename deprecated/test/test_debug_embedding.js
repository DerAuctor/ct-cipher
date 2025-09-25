/**
 * Debug Embedding Parameter Test
 * 
 * Test um zu prüfen ob output_dimension Parameter korrekt übergeben wird
 */

import { Mistral } from '@mistralai/mistralai';

async function debugEmbeddingParams() {
    console.log('=== Debug Embedding Parameter Test ===');
    
    const mistral = new Mistral({
        apiKey: process.env.MISTRAL_API_KEY
    });
    
    try {
        // Test mit verschiedenen output_dimension Werten
        const testConfigs = [
            { name: 'Default (no output_dimension)', params: { model: 'codestral-embed', inputs: ['test'] } },
            { name: '256 dimensions', params: { model: 'codestral-embed', inputs: ['test'], output_dimension: 256 } },
            { name: '512 dimensions', params: { model: 'codestral-embed', inputs: ['test'], output_dimension: 512 } },
            { name: '1024 dimensions', params: { model: 'codestral-embed', inputs: ['test'], output_dimension: 1024 } },
            { name: '1536 dimensions', params: { model: 'codestral-embed', inputs: ['test'], output_dimension: 1536 } },
            { name: '3072 dimensions', params: { model: 'codestral-embed', inputs: ['test'], output_dimension: 3072 } },
        ];
        
        for (const config of testConfigs) {
            console.log(`\n--- ${config.name} ---`);
            console.log('Request params:', JSON.stringify(config.params, null, 2));
            
            try {
                const response = await mistral.embeddings.create(config.params);
                const embedding = response.data[0].embedding;
                
                console.log(`✅ SUCCESS: Got ${embedding.length} dimensions`);
                console.log(`   Expected: ${config.params.output_dimension || 'default'}`);
                
                if (config.params.output_dimension && embedding.length !== config.params.output_dimension) {
                    console.log(`❌ MISMATCH: Expected ${config.params.output_dimension}, got ${embedding.length}`);
                } else if (!config.params.output_dimension && embedding.length === 1536) {
                    console.log(`✅ Default behavior confirmed: 1536 dimensions`);
                } else if (config.params.output_dimension && embedding.length === config.params.output_dimension) {
                    console.log(`✅ PERFECT MATCH: ${config.params.output_dimension} dimensions`);
                }
                
            } catch (error) {
                console.log(`❌ ERROR: ${error.message}`);
            }
            
            // Kurze Pause zwischen Requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        
    } catch (error) {
        console.error('Test failed:', error);
    }
}

// Run test
if (process.env.MISTRAL_API_KEY) {
    debugEmbeddingParams()
        .then(() => console.log('\n=== Test completed ==='))
        .catch(console.error);
} else {
    console.log('⚠️ MISTRAL_API_KEY not set');
}