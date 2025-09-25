/**
 * Performance Test für Codestral Embeddings
 * 
 * Messung der Performance für Single und Batch Embeddings mit 3072 Dimensionen
 */

// Da wir ES Modules verwenden, dynamischer Import
async function performanceTest() {
    console.log('=== Codestral Embedding Performance Test ===');
    
    // Dynamischer Import da ES Module
    const { CodestralEmbedder } = await import('./dist/src/core/index.js');
    
    const config = {
        type: 'codestral',
        apiKey: process.env.MISTRAL_API_KEY,
        model: 'codestral-embed',
        baseUrl: 'https://api.mistral.ai',
        dimensions: 3072,
        timeout: 30000,
        maxRetries: 3
    };
    
    const embedder = new CodestralEmbedder(config);
    
    try {
        // Test 1: Single Embedding Performance
        console.log('\n--- Performance Test 1: Single Embedding ---');
        
        const singleText = 'This is a performance test for single embedding with 3072 dimensions using direct API call implementation.';
        const singleStart = Date.now();
        
        const singleResult = await embedder.embed(singleText);
        const singleTime = Date.now() - singleStart;
        
        console.log(`✅ Single Embedding: ${singleTime}ms`);
        console.log(`   Dimensionen: ${singleResult.length}`);
        console.log(`   Ziel: < 2000ms, Actual: ${singleTime}ms ${singleTime < 2000 ? '✅' : '❌'}`);
        
        // Test 2: Batch Embedding Performance
        console.log('\n--- Performance Test 2: Batch Embedding (5 Texte) ---');
        
        const batchTexts = [
            'First performance test text for batch embedding with Codestral.',
            'Second performance test text to measure batch processing speed.',
            'Third text in the batch to validate scalability of the system.',
            'Fourth text testing concurrent embedding generation capabilities.',
            'Fifth and final text to complete the batch performance evaluation.'
        ];
        
        const batchStart = Date.now();
        const batchResults = await embedder.embedBatch(batchTexts);
        const batchTime = Date.now() - batchStart;
        
        console.log(`✅ Batch Embedding (5 Texte): ${batchTime}ms`);
        console.log(`   Anzahl Embeddings: ${batchResults.length}`);
        console.log(`   Durchschnitt pro Text: ${Math.round(batchTime / batchTexts.length)}ms`);
        console.log(`   Ziel: < 5000ms, Actual: ${batchTime}ms ${batchTime < 5000 ? '✅' : '❌'}`);
        
        // Validation dass alle Embeddings korrekte Dimensionen haben
        const allCorrectDimensions = batchResults.every(result => result.length === 3072);
        console.log(`   Alle 3072 Dimensionen: ${allCorrectDimensions ? '✅' : '❌'}`);
        
        // Test 3: Large Batch Performance  
        console.log('\n--- Performance Test 3: Large Batch Embedding (10 Texte) ---');
        
        const largeBatchTexts = Array.from({ length: 10 }, (_, i) => 
            `Large batch performance test text number ${i + 1}. This tests the system's ability to handle larger batches efficiently with the new direct API call implementation that bypasses the SDK bug.`
        );
        
        const largeBatchStart = Date.now();
        const largeBatchResults = await embedder.embedBatch(largeBatchTexts);
        const largeBatchTime = Date.now() - largeBatchStart;
        
        console.log(`✅ Large Batch Embedding (10 Texte): ${largeBatchTime}ms`);
        console.log(`   Anzahl Embeddings: ${largeBatchResults.length}`);
        console.log(`   Durchschnitt pro Text: ${Math.round(largeBatchTime / largeBatchTexts.length)}ms`);
        console.log(`   Ziel: < 10000ms, Actual: ${largeBatchTime}ms ${largeBatchTime < 10000 ? '✅' : '❌'}`);
        
        const allLargeCorrectDimensions = largeBatchResults.every(result => result.length === 3072);
        console.log(`   Alle 3072 Dimensionen: ${allLargeCorrectDimensions ? '✅' : '❌'}`);
        
        // Cleanup
        await embedder.disconnect();
        
        // Performance Summary
        console.log('\n=== PERFORMANCE SUMMARY ===');
        console.log(`Single Embedding: ${singleTime}ms ${singleTime < 2000 ? '✅' : '❌'}`);
        console.log(`Batch 5 Texte: ${batchTime}ms ${batchTime < 5000 ? '✅' : '❌'}`);
        console.log(`Large Batch 10 Texte: ${largeBatchTime}ms ${largeBatchTime < 10000 ? '✅' : '❌'}`);
        console.log(`3072 Dimensionen: ${allCorrectDimensions && allLargeCorrectDimensions ? '✅' : '❌'}`);
        
        const performancePass = singleTime < 2000 && batchTime < 5000 && largeBatchTime < 10000 && allCorrectDimensions && allLargeCorrectDimensions;
        
        console.log(`\n🜄 PERFORMANCE TEST: ${performancePass ? '✅ ALLE TESTS BESTANDEN' : '❌ EINIGE TESTS FEHLGESCHLAGEN'}`);
        
        return performancePass;
        
    } catch (error) {
        console.error('❌ Performance Test fehlgeschlagen:', error.message);
        return false;
    }
}

// Test ausführen
if (process.env.MISTRAL_API_KEY) {
    performanceTest()
        .then(success => {
            console.log(success ? '\n🎉 PERFORMANCE TEST ERFOLGREICH' : '\n❌ PERFORMANCE TEST FEHLGESCHLAGEN');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
} else {
    console.log('⚠️ MISTRAL_API_KEY not set, skipping performance test');
    process.exit(0);
}