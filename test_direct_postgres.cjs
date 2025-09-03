#!/usr/bin/env node

require('dotenv').config();

// Test PostgreSQL connection using direct backend import
async function testPostgreSQL() {
    try {
        console.log('=== DIRECT POSTGRESQL TEST ===');
        console.log('Environment check:');
        console.log('- CIPHER_PG_URL length:', process.env.CIPHER_PG_URL?.length || 'not set');
        console.log('- Raw URL (first 50 chars):', process.env.CIPHER_PG_URL?.substring(0, 50) || 'not set');
        console.log('- STORAGE_DATABASE_TYPE:', process.env.STORAGE_DATABASE_TYPE || 'not set');
        
        // Import directly from built backend
        const { PostgresBackend } = await import('./dist/src/core/storage/backend/postgresql.js');
        
        const config = {
            type: 'postgres',
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