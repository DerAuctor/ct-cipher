#!/usr/bin/env node

require('dotenv').config();
const { Pool } = require('pg');

// Test PostgreSQL connection with correct decoded password
async function testPostgreSQL() {
    try {
        console.log('=== REAL POSTGRESQL CONNECTION TEST ===');
        
        // Get the decoded password
        const url = new URL(process.env.CIPHER_PG_URL);
        const decodedPassword = decodeURIComponent(url.password);
        url.password = decodedPassword;
        const connectionString = url.toString();
        
        console.log('Connection details:');
        console.log('- Host:', url.hostname);
        console.log('- Port:', url.port);
        console.log('- Database:', url.pathname.substring(1));
        console.log('- Username:', url.username);
        console.log('- Password length:', decodedPassword.length);
        console.log('- SSL mode:', url.searchParams.get('sslmode'));
        
        const poolConfig = {
            connectionString: connectionString,
            max: 3,
            min: 1,
            idleTimeoutMillis: 10000,
            connectionTimeoutMillis: 10000,
            ssl: {
                rejectUnauthorized: false
            }
        };
        
        console.log('Creating PostgreSQL pool...');
        const pool = new Pool(poolConfig);
        
        // Add error handlers
        pool.on('error', (err) => {
            console.error('Pool error:', err.message);
        });
        
        console.log('Testing connection...');
        const client = await pool.connect();
        
        try {
            const result = await client.query('SELECT version()');
            console.log('Connection successful!');
            console.log('PostgreSQL version:', result.rows[0].version);
            
            // Test a simple operation
            await client.query('SELECT 1 as test');
            console.log('Simple query test successful!');
            
        } finally {
            client.release();
        }
        
        await pool.end();
        console.log('PostgreSQL connection test completed successfully!');
        
    } catch (error) {
        console.error('PostgreSQL connection failed:');
        console.error('- Message:', error.message);
        console.error('- Code:', error.code);
        console.error('- Detail:', error.detail);
        console.error('- Hint:', error.hint);
        if (error.code === '28P01') {
            console.error('');
            console.error('AUTHENTICATION ERROR - Password authentication failed');
            console.error('This means the decoded password is still incorrect or the user does not exist.');
        }
    }
}

testPostgreSQL().then(() => {
    process.exit(0);
}).catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
});