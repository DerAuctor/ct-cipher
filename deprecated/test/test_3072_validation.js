/**
 * 3072 Dimensionen Validation Test
 * 
 * Direkter Test des MistralAI SDK mit output_dimension=3072
 * um zu beweisen dass User Recht hatte - 3072 Dimensionen sind möglich
 */

import { Mistral } from '@mistralai/mistralai';

async function test3072Dimensions() {
    console.log('=== 3072 Dimensionen Validation Test ===');
    
    const mistral = new Mistral({
        apiKey: process.env.MISTRAL_API_KEY
    });
    
    try {
        // Test 1: Single embedding with 3072 dimensions
        console.log('\nTest 1: Single embedding with output_dimension=3072');
        
        const singleParams = {
            model: 'codestral-embed',
            inputs: ['Test text for 3072 dimensions validation'],
            output_dimension: 3072
        };
        
        console.log('Request params:', JSON.stringify(singleParams, null, 2));
        
        const singleResponse = await mistral.embeddings.create(singleParams);
        
        const singleEmbedding = singleResponse.data[0].embedding;
        console.log(`Single embedding dimensions: ${singleEmbedding.length}`);
        console.log(`Expected: 3072, Got: ${singleEmbedding.length}`);
        console.log(`✓ Single embedding test: ${singleEmbedding.length === 3072 ? 'PASS' : 'FAIL'}`);
        
        // Test 2: Batch embedding with 3072 dimensions
        console.log('\nTest 2: Batch embedding with output_dimension=3072');
        
        const batchParams = {
            model: 'codestral-embed',
            inputs: [
                'First batch text for 3072 dimensions',
                'Second batch text for 3072 dimensions',
                'Third batch text for 3072 dimensions'
            ],
            output_dimension: 3072
        };
        
        console.log('Batch request params:', JSON.stringify(batchParams, null, 2));
        
        const batchResponse = await mistral.embeddings.create(batchParams);
        
        console.log(`Batch response count: ${batchResponse.data.length}`);
        
        let allBatchCorrect = true;
        batchResponse.data.forEach((item, index) => {
            const dimensions = item.embedding.length;
            console.log(`Batch embedding ${index}: ${dimensions} dimensions`);
            if (dimensions !== 3072) {
                allBatchCorrect = false;
            }
        });
        
        console.log(`✓ Batch embedding test: ${allBatchCorrect ? 'PASS' : 'FAIL'}`);
        
        // Test 3: Default dimensions (without output_dimension)
        console.log('\nTest 3: Default dimensions (no output_dimension parameter)');
        
        const defaultParams = {
            model: 'codestral-embed',
            inputs: ['Test text for default dimensions']
        };
        
        const defaultResponse = await mistral.embeddings.create(defaultParams);
        const defaultEmbedding = defaultResponse.data[0].embedding;
        
        console.log(`Default dimensions: ${defaultEmbedding.length}`);
        console.log(`✓ Default test: ${defaultEmbedding.length === 1536 ? 'PASS (1536 default)' : 'UNEXPECTED'}`);
        
        // Summary
        console.log('\n=== VALIDATION RESULTS ===');
        console.log(`Single 3072: ${singleEmbedding.length === 3072 ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Batch 3072: ${allBatchCorrect ? '✅ PASS' : '❌ FAIL'}`);
        console.log(`Default 1536: ${defaultEmbedding.length === 1536 ? '✅ PASS' : '❌ UNEXPECTED'}`);
        
        const overallSuccess = singleEmbedding.length === 3072 && allBatchCorrect;
        console.log(`\n🜄 OVERALL: ${overallSuccess ? '✅ USER HAD RIGHT - 3072 DIMENSIONS WORK' : '❌ VALIDATION FAILED'}`);
        
        return overallSuccess;
        
    } catch (error) {
        console.error('❌ Validation test failed:', error.message);
        return false;
    }
}

// Run test if API key is available
if (process.env.MISTRAL_API_KEY) {
    test3072Dimensions()
        .then(success => {
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
} else {
    console.log('⚠️ MISTRAL_API_KEY not set, skipping validation test');
    process.exit(0);
}