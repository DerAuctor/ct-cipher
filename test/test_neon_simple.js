#!/usr/bin/env node

/**
 * Simple Neon Connection Test
 * Tests different SSL configurations and connection methods
 */

import { Pool } from 'pg';

const baseUrl = 'postgresql://neondb_owner:npg_pumvr3MVwY8c@ep-fragrant-mouse-a92s3py4-pooler.gwc.azure.neon.tech/ct-cipherdb';

console.log('🔄 Testing different Neon connection strategies...\n');

// Test configurations
const configs = [
  {
    name: 'Standard SSL (rejectUnauthorized: false)',
    config: {
      connectionString: `${baseUrl}?sslmode=require`,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    }
  },
  {
    name: 'No SSL verification',
    config: {
      connectionString: baseUrl,
      ssl: false,
      connectionTimeoutMillis: 5000,
    }
  },
  {
    name: 'SSL prefer mode',
    config: {
      connectionString: `${baseUrl}?sslmode=prefer`,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 5000,
    }
  },
  {
    name: 'Minimal config',
    config: {
      connectionString: baseUrl,
      connectionTimeoutMillis: 5000,
    }
  },
];

async function testConfig(config) {
  const pool = new Pool(config.config);
  
  try {
    console.log(`📡 Testing: ${config.name}`);
    const client = await pool.connect();
    const result = await client.query('SELECT 1 as test');
    client.release();
    console.log(`✅ Success: ${config.name} - Result: ${result.rows[0].test}\n`);
    return true;
  } catch (error) {
    console.log(`❌ Failed: ${config.name}`);
    console.log(`   Error: ${error.message}`);
    if (error.code) console.log(`   Code: ${error.code}`);
    console.log('');
    return false;
  } finally {
    await pool.end();
  }
}

async function runTests() {
  console.log('🌐 Network connectivity test...');
  try {
    const dns = await import('dns');
    const { promisify } = await import('util');
    const resolve = promisify(dns.resolve);
    
    const addresses = await resolve('ep-fragrant-mouse-a92s3py4-pooler.gwc.azure.neon.tech');
    console.log('✅ DNS resolution successful:', addresses[0]);
  } catch (error) {
    console.log('❌ DNS resolution failed:', error.message);
  }
  console.log('');

  let successCount = 0;
  for (const config of configs) {
    const success = await testConfig(config);
    if (success) successCount++;
  }
  
  console.log(`📊 Results: ${successCount}/${configs.length} configurations successful`);
  
  if (successCount === 0) {
    console.log('\n🚨 All connection attempts failed. Possible issues:');
    console.log('1. Network connectivity problems');
    console.log('2. Neon database is not accessible');
    console.log('3. Credentials are invalid');
    console.log('4. Database server is down');
    console.log('5. Firewall blocking connections');
  }
}

runTests().catch(console.error);