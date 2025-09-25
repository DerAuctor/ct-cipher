/**
 * Direkter API Call für Codestral Embeddings
 * 
 * Test um zu beweisen dass direkter API Call 3072 Dimensionen liefert
 */

async function testDirectApiEmbeddings() {
    console.log('=== Direkter API Call Test für Codestral Embeddings ===');
    
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
        console.log('❌ MISTRAL_API_KEY not set');
        return false;
    }
    
    try {
        // Test 1: Direkter API Call mit 3072 Dimensionen
        console.log('\n--- Test 1: Single Embedding mit 3072 Dimensionen ---');
        
        const singlePayload = {
            model: 'codestral-embed',
            input: 'Test text for 3072 dimensions via direct API call',
            output_dimension: 3072
        };
        
        console.log('Request payload:', JSON.stringify(singlePayload, null, 2));
        
        const singleResponse = await fetch('https://api.mistral.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(singlePayload)
        });
        
        if (!singleResponse.ok) {
            throw new Error(`HTTP ${singleResponse.status}: ${singleResponse.statusText}`);
        }
        
        const singleData = await singleResponse.json();
        const singleEmbedding = singleData.data[0].embedding;
        
        console.log(`✅ Single API Call erfolgreich: ${singleEmbedding.length} Dimensionen`);
        console.log(`   Erwartet: 3072, Erhalten: ${singleEmbedding.length}`);
        
        if (singleEmbedding.length === 3072) {
            console.log('🎉 PERFEKT: Direkter API Call liefert 3072 Dimensionen!');
        }
        
        // Test 2: Batch Embedding mit 3072 Dimensionen
        console.log('\n--- Test 2: Batch Embedding mit 3072 Dimensionen ---');
        
        const batchPayload = {
            model: 'codestral-embed',
            input: [
                'First batch text for 3072 dimensions',
                'Second batch text for 3072 dimensions', 
                'Third batch text for 3072 dimensions'
            ],
            output_dimension: 3072
        };
        
        console.log('Batch payload:', JSON.stringify(batchPayload, null, 2));
        
        const batchResponse = await fetch('https://api.mistral.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(batchPayload)
        });
        
        if (!batchResponse.ok) {
            throw new Error(`HTTP ${batchResponse.status}: ${batchResponse.statusText}`);
        }
        
        const batchData = await batchResponse.json();
        
        console.log(`✅ Batch API Call erfolgreich: ${batchData.data.length} Embeddings`);
        
        let allBatchCorrect = true;
        batchData.data.forEach((item, index) => {
            const dimensions = item.embedding.length;
            console.log(`   Batch ${index}: ${dimensions} Dimensionen`);
            if (dimensions !== 3072) {
                allBatchCorrect = false;
            }
        });
        
        if (allBatchCorrect) {
            console.log('🎉 PERFEKT: Alle Batch Embeddings haben 3072 Dimensionen!');
        }
        
        // Test 3: Vergleich mit Default (1536)
        console.log('\n--- Test 3: Default ohne output_dimension ---');
        
        const defaultPayload = {
            model: 'codestral-embed',
            input: 'Default test without output_dimension'
        };
        
        const defaultResponse = await fetch('https://api.mistral.ai/v1/embeddings', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify(defaultPayload)
        });
        
        const defaultData = await defaultResponse.json();
        const defaultEmbedding = defaultData.data[0].embedding;
        
        console.log(`✅ Default API Call: ${defaultEmbedding.length} Dimensionen`);
        
        // Zusammenfassung
        console.log('\n=== ERGEBNIS ZUSAMMENFASSUNG ===');
        console.log(`Single 3072: ${singleEmbedding.length === 3072 ? '✅ ERFOLG' : '❌ FEHLER'}`);
        console.log(`Batch 3072: ${allBatchCorrect ? '✅ ERFOLG' : '❌ FEHLER'}`);
        console.log(`Default 1536: ${defaultEmbedding.length === 1536 ? '✅ ERFOLG' : '❌ FEHLER'}`);
        
        const overallSuccess = singleEmbedding.length === 3072 && allBatchCorrect;
        console.log(`\n🜄 DIREKTER API CALL: ${overallSuccess ? '✅ 3072 DIMENSIONEN FUNKTIONIEREN' : '❌ PROBLEM BESTEHT'}`);
        
        return overallSuccess;
        
    } catch (error) {
        console.error('❌ Direkter API Call Test fehlgeschlagen:', error.message);
        return false;
    }
}

// Test ausführen
testDirectApiEmbeddings()
    .then(success => {
        console.log(success ? '\n🎉 API CALL TEST ERFOLGREICH' : '\n❌ API CALL TEST FEHLGESCHLAGEN');
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('Test execution failed:', error);
        process.exit(1);
    });