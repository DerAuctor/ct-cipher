#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');

// Test PostgreSQL connection directly with bundled logic
async function testPostgreSQL() {
    try {
        console.log('=== DIRECT POSTGRESQL BUNDLED TEST ===');
        console.log('Environment check:');
        console.log('- CIPHER_PG_URL length:', process.env.CIPHER_PG_URL?.length || 'not set');
        console.log('- Raw URL (first 50 chars):', process.env.CIPHER_PG_URL?.substring(0, 50) || 'not set');
        console.log('- STORAGE_DATABASE_TYPE:', process.env.STORAGE_DATABASE_TYPE || 'not set');
        
        let connectionString = process.env.CIPHER_PG_URL;
        
        // Apply URL decoding logic
        try {
            const url = new URL(process.env.CIPHER_PG_URL);
            if (url.password && url.password.includes('%')) {
                const decodedPassword = decodeURIComponent(url.password);
                url.password = decodedPassword;
                connectionString = url.toString();
                console.log('- Decoded URL-encoded password');
            }
        } catch (error) {
            console.warn('- Failed to parse connection URL for decoding, using original');
        }
        
        const poolConfig = {
            connectionString: connectionString,
            max: 10,
            min: 2,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: {
                rejectUnauthorized: false
            }
        };
        
        console.log('Creating PostgreSQL pool...');
        const pool = new Pool(poolConfig);
        
        console.log('Testing connection...');
        const client = await pool.connect();
        
        try {
            await client.query('SELECT 1');
            console.log('Connection successful!');
        } finally {
            client.release();
        }
        
        await pool.end();
        
    } catch (error) {
        console.error('PostgreSQL test failed:', error.message);
        console.error('Code:', error.code);
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