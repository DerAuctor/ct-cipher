/**
 * Test des aktualisierten CodestralEmbedder mit 3072 Dimensionen
 * 
 * Verifikation dass die neue Implementation korrekt funktioniert
 */

// Da wir ES Modules verwenden, müssen wir das dynamisch importieren
async function testCodestralEmbedder3072() {
    console.log('=== CodestralEmbedder 3072 Dimensionen Test ===');
    
    // Dynamischer Import da ES Module
    const { CodestralEmbedder } = await import('./src/core/brain/embedding/backend/codestral.js');
    
    const config = {
        type: 'codestral',
        apiKey: process.env.MISTRAL_API_KEY,
        model: 'codestral-embed',
        baseUrl: 'https://api.mistral.ai',
        dimensions: 3072,
        timeout: 30000,
        maxRetries: 3
    };
    
    console.log('Test Konfiguration:', JSON.stringify(config, null, 2));
    
    const embedder = new CodestralEmbedder(config);
    
    try {
        // Test 1: Single Embedding
        console.log('\n--- Test 1: Single Embedding mit 3072 Dimensionen ---');
        
        const singleText = 'Test text for CodestralEmbedder with 3072 dimensions';
        const singleResult = await embedder.embed(singleText);
        
        console.log(`✅ Single Embedding erfolgreich: ${singleResult.length} Dimensionen`);
        console.log(`   Konfiguriert: ${config.dimensions}, Erhalten: ${singleResult.length}`);
        
        if (singleResult.length === 3072) {
            console.log('🎉 PERFEKT: CodestralEmbedder liefert 3072 Dimensionen!');
        } else {
            console.log(`❌ FEHLER: Erwartet 3072, erhalten ${singleResult.length}`);
        }
        
        // Test 2: Batch Embedding
        console.log('\n--- Test 2: Batch Embedding mit 3072 Dimensionen ---');
        
        const batchTexts = [
            'First CodestralEmbedder batch text',
            'Second CodestralEmbedder batch text', 
            'Third CodestralEmbedder batch text'
        ];
        
        const batchResults = await embedder.embedBatch(batchTexts);
        
        console.log(`✅ Batch Embedding erfolgreich: ${batchResults.length} Embeddings`);
        
        let allBatchCorrect = true;
        batchResults.forEach((result, index) => {
            const dimensions = result.length;
            console.log(`   Batch ${index}: ${dimensions} Dimensionen`);
            if (dimensions !== 3072) {
                allBatchCorrect = false;
            }
        });
        
        if (allBatchCorrect) {
            console.log('🎉 PERFEKT: Alle Batch Embeddings haben 3072 Dimensionen!');
        }
        
        // Test 3: getDimension() Methode
        console.log('\n--- Test 3: getDimension() Methode ---');
        
        const reportedDimension = embedder.getDimension();
        console.log(`✅ getDimension() liefert: ${reportedDimension}`);
        
        if (reportedDimension === 3072) {
            console.log('✅ getDimension() korrekt');
        }
        
        // Test 4: Health Check
        console.log('\n--- Test 4: Health Check ---');
        
        const isHealthy = await embedder.isHealthy();
        console.log(`✅ Health Check: ${isHealthy ? 'HEALTHY' : 'UNHEALTHY'}`);
        
        // Cleanup
        await embedder.disconnect();
        
        // Zusammenfassung
        console.log('\n=== ENDERGEBNIS ===');
        console.log(`Single 3072: ${singleResult.length === 3072 ? '✅ ERFOLG' : '❌ FEHLER'}`);
        console.log(`Batch 3072: ${allBatchCorrect ? '✅ ERFOLG' : '❌ FEHLER'}`);
        console.log(`getDimension: ${reportedDimension === 3072 ? '✅ ERFOLG' : '❌ FEHLER'}`);
        console.log(`Health Check: ${isHealthy ? '✅ ERFOLG' : '❌ FEHLER'}`);
        
        const overallSuccess = singleResult.length === 3072 && allBatchCorrect && reportedDimension === 3072 && isHealthy;
        console.log(`\n🜄 CODESTRAL EMBEDDER: ${overallSuccess ? '✅ VOLLSTÄNDIG FUNKTIONSFÄHIG MIT 3072 DIMENSIONEN' : '❌ PROBLEM BESTEHT'}`);
        
        return overallSuccess;
        
    } catch (error) {
        console.error('❌ CodestralEmbedder Test fehlgeschlagen:', error.message);
        return false;
    }
}

// Test ausführen
if (process.env.MISTRAL_API_KEY) {
    testCodestralEmbedder3072()
        .then(success => {
            console.log(success ? '\n🎉 CODESTRAL EMBEDDER TEST ERFOLGREICH' : '\n❌ CODESTRAL EMBEDDER TEST FEHLGESCHLAGEN');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('Test execution failed:', error);
            process.exit(1);
        });
} else {
    console.log('⚠️ MISTRAL_API_KEY not set, skipping test');
    process.exit(0);
}