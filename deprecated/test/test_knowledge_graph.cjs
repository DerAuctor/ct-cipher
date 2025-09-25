#!/usr/bin/env node

require('dotenv').config();

// Test Knowledge Graph connection
async function testKnowledgeGraph() {
    try {
        console.log('=== KNOWLEDGE GRAPH TEST ===');
        console.log('Environment check:');
        console.log('- KNOWLEDGE_GRAPH_ENABLED:', process.env.KNOWLEDGE_GRAPH_ENABLED);
        console.log('- KNOWLEDGE_GRAPH_TYPE:', process.env.KNOWLEDGE_GRAPH_TYPE);
        console.log('- KNOWLEDGE_GRAPH_URI:', process.env.KNOWLEDGE_GRAPH_URI);
        console.log('- KNOWLEDGE_GRAPH_USERNAME:', process.env.KNOWLEDGE_GRAPH_USERNAME ? 'SET' : 'NOT SET');
        console.log('- KNOWLEDGE_GRAPH_PASSWORD:', process.env.KNOWLEDGE_GRAPH_PASSWORD ? 'SET' : 'NOT SET');
        console.log('- KNOWLEDGE_GRAPH_DATABASE:', process.env.KNOWLEDGE_GRAPH_DATABASE);
        
        // Import the factory function
        const { createKnowledgeGraphFromEnv } = require('./dist/src/core/index.cjs');
        
        console.log('Creating Knowledge Graph from environment...');
        const kgFactory = await createKnowledgeGraphFromEnv();
        
        if (!kgFactory) {
            console.log('Knowledge Graph is disabled or not configured');
            return;
        }
        
        console.log('Knowledge Graph factory created successfully');
        console.log('Type:', kgFactory.getBackendType());
        
        // Test connection
        console.log('Testing connection...');
        await kgFactory.connect();
        
        console.log('Knowledge Graph connected successfully!');
        
        // Test basic operations
        console.log('Testing basic operations...');
        
        // Create a simple node
        await kgFactory.createNode('test-node', 'TestType', {
            name: 'Test Node',
            timestamp: new Date().toISOString()
        });
        
        console.log('Test node created successfully');
        
        // Query the node
        const results = await kgFactory.query("MATCH (n:TestType) WHERE n.name = 'Test Node' RETURN n");
        console.log('Query results:', results);
        
        // Clean up
        await kgFactory.query("MATCH (n:TestType) WHERE n.name = 'Test Node' DELETE n");
        console.log('Test cleanup completed');
        
        await kgFactory.disconnect();
        console.log('Knowledge Graph test completed successfully!');
        
    } catch (error) {
        console.error('Knowledge Graph test failed:', error.message);
        console.error('Error type:', error.constructor.name);
        if (error.stack) {
            console.error('Stack:', error.stack);
        }
        
        // Additional error details
        if (error.cause) {
            console.error('Error cause:', error.cause);
        }
        
        if (error.code) {
            console.error('Error code:', error.code);
        }
    }
}

testKnowledgeGraph().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});