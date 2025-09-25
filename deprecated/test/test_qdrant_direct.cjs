#!/usr/bin/env node

require('dotenv').config();

// Test Qdrant connection directly using the same approach as the backend
async function testQdrant() {
    try {
        console.log('=== DIRECT QDRANT TEST ===');
        console.log('Environment check:');
        console.log('- VECTOR_STORE_TYPE:', process.env.VECTOR_STORE_TYPE);
        console.log('- VECTOR_STORE_URL:', process.env.VECTOR_STORE_URL);
        console.log('- VECTOR_STORE_API_KEY:', process.env.VECTOR_STORE_API_KEY ? 'SET' : 'NOT SET');
        
        // Import the QdrantClient from the same package
        const { QdrantClient } = await import('@qdrant/js-client-rest');
        
        console.log('Creating Qdrant client...');
        const client = new QdrantClient({
            url: process.env.VECTOR_STORE_URL,
            apiKey: process.env.VECTOR_STORE_API_KEY,
        });
        
        console.log('Attempting to connect and list collections...');
        const collections = await client.getCollections();
        
        console.log('Connection successful!');
        console.log('Collections:', collections.collections.map(c => c.name));
        
    } catch (error) {
        console.error('Qdrant test failed:', error.message);
        console.error('Error type:', error.constructor.name);
        console.error('Stack:', error.stack);
        
        // More detailed error analysis
        if (error.cause) {
            console.error('Error cause:', error.cause);
        }
        
        if (error.code) {
            console.error('Error code:', error.code);
        }
    }
}

testQdrant().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});