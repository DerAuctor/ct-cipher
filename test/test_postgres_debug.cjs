#!/usr/bin/env node

require('dotenv').config();

// Test PostgreSQL connection directly
const { PostgresBackend } = require('./dist/src/core/index.cjs');

async function testPostgreSQL() {
    try {
        console.log('=== POSTGRESQL DEBUG TEST ===');
        console.log('Environment check:');
        console.log('- CIPHER_PG_URL length:', process.env.CIPHER_PG_URL?.length || 'not set');
        console.log('- Raw URL (first 50 chars):', process.env.CIPHER_PG_URL?.substring(0, 50) || 'not set');
        
        const config = {
            url: process.env.CIPHER_PG_URL,
            ssl: { rejectUnauthorized: false },
            maxConnections: 20,
            connectionTimeout: 30000,
            idleTimeout: 30000,
            statementTimeout: 30000
        };
        
        console.log('Creating PostgreSQL backend...');
        const backend = new PostgresBackend(config);
        
        console.log('Attempting to connect...');
        await backend.connect();
        
        console.log('Connection successful!');
        await backend.disconnect();
        
    } catch (error) {
        console.error('PostgreSQL test failed:', error.message);
        console.error('Stack:', error.stack);
    }
}

testPostgreSQL().then(() => {
    console.log('Test completed');
    process.exit(0);
}).catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});