#!/usr/bin/env node

/**
 * PostgreSQL Connection Test Script
 * Tests direct connection to Neon database with detailed error reporting
 */

import { Pool } from 'pg';

// Neon database configuration
const config = {
  connectionString: 'postgresql://neondb_owner:npg_pumvr3MVwY8c@ep-fragrant-mouse-a92s3py4-pooler.gwc.azure.neon.tech/ct-cipherdb?sslmode=require&channel_binding=require',
  ssl: {
    rejectUnauthorized: false, // For managed database services with self-signed certificates
  },
  max: 10,
  min: 2,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
};

console.log('🔄 Testing PostgreSQL connection to Neon database...');
console.log('📍 Host: ep-fragrant-mouse-a92s3py4-pooler.gwc.azure.neon.tech');
console.log('🗄️ Database: ct-cipherdb');
console.log('🔐 SSL Mode: require');

async function testConnection() {
  const pool = new Pool(config);
  
  try {
    // Test basic connection
    console.log('\n1. Testing basic connection...');
    const client = await pool.connect();
    console.log('✅ Connection established successfully');
    
    // Test simple query
    console.log('\n2. Testing simple query...');
    const result = await client.query('SELECT version(), current_database(), current_user');
    console.log('✅ Query executed successfully');
    console.log('📊 PostgreSQL Version:', result.rows[0].version.split(' ')[0] + ' ' + result.rows[0].version.split(' ')[1]);
    console.log('🗄️ Current Database:', result.rows[0].current_database);
    console.log('👤 Current User:', result.rows[0].current_user);
    
    // Test table creation (simulate cipher backend)
    console.log('\n3. Testing table creation...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS test_cipher_store (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL
      )
    `);
    console.log('✅ Table creation successful');
    
    // Test basic CRUD operations
    console.log('\n4. Testing CRUD operations...');
    const now = new Date();
    
    // INSERT
    await client.query(
      'INSERT INTO test_cipher_store (key, value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
      ['test_key', JSON.stringify({test: 'data'}), now, now]
    );
    console.log('✅ INSERT operation successful');
    
    // SELECT
    const selectResult = await client.query('SELECT * FROM test_cipher_store WHERE key = $1', ['test_key']);
    if (selectResult.rows.length > 0) {
      console.log('✅ SELECT operation successful');
      console.log('📄 Retrieved data:', JSON.parse(selectResult.rows[0].value));
    }
    
    // DELETE
    await client.query('DELETE FROM test_cipher_store WHERE key = $1', ['test_key']);
    console.log('✅ DELETE operation successful');
    
    // Clean up test table
    await client.query('DROP TABLE IF EXISTS test_cipher_store');
    console.log('✅ Test table cleaned up');
    
    client.release();
    
    // Test connection pool info
    console.log('\n5. Connection Pool Status:');
    console.log('📊 Total connections:', pool.totalCount);
    console.log('😴 Idle connections:', pool.idleCount);
    console.log('⏳ Waiting connections:', pool.waitingCount);
    
    console.log('\n🎉 All tests passed! PostgreSQL connection is working correctly.');
    
  } catch (error) {
    console.error('\n❌ Connection test failed:');
    console.error('Error code:', error.code);
    console.error('Error message:', error.message);
    if (error.detail) console.error('Error detail:', error.detail);
    if (error.hint) console.error('Error hint:', error.hint);
    console.error('Full error:', error);
    
    // Provide specific guidance based on error type
    if (error.code === 'ENOTFOUND') {
      console.log('\n💡 DNS resolution failed. Check network connectivity.');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Connection refused. Check if the database server is running and accessible.');
    } else if (error.code === 'ETIMEDOUT') {
      console.log('\n💡 Connection timeout. Check network connectivity and firewall settings.');
    } else if (error.code === '28000') {
      console.log('\n💡 Authentication failed. Check username and password.');
    } else if (error.code === '3D000') {
      console.log('\n💡 Database does not exist. Check database name.');
    } else if (error.message.includes('SSL')) {
      console.log('\n💡 SSL connection issue. Check SSL configuration.');
    }
    
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testConnection();