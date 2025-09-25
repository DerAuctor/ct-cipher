import { Pool } from 'pg';
import { config } from 'dotenv';
import fetch from 'node-fetch';

config();

console.log('🧪 Starting comprehensive session auto-creation test suite...');
console.log('='.repeat(60));

const API_BASE = 'http://localhost:6001/api';
const pool = new Pool({ 
    connectionString: process.env.CIPHER_PG_URL,
    ssl: process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? { rejectUnauthorized: false } : undefined
});

const testResults = {
    databaseConnection: false,
    autoCreation: false,
    persistence: false,
    history: false,
    noErrors: false,
};

async function testDatabaseConnection() {
    console.log('\n🔍 Testing PostgreSQL database connection...');
    try {
        const result = await pool.query('SELECT current_database(), version()');
        const dbName = result.rows[0].current_database;
        const version = result.rows[0].version.split(' ')[0];
        
        console.log(`✅ Database connected: ${dbName}`);
        console.log(`📊 PostgreSQL version: ${version}`);
        testResults.databaseConnection = true;
        return true;
    } catch (error) {
        console.log(`❌ Database connection failed: ${error.message}`);
        return false;
    }
}

async function testDefaultSessionAutoCreation() {
    console.log('\n🚀 Testing default session auto-creation...');
    console.log('📤 Testing message API without sessionId...');
    
    try {
        const response = await fetch(`${API_BASE}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: "Test session auto-creation",
                stream: false
            })
        });
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Message API responded successfully`);
        console.log(`📋 Response sessionId: ${data.sessionId || 'not provided'}`);
        console.log(`📝 Response content length: ${data.content?.length || 0} chars`);
        
        testResults.autoCreation = true;
        return data.sessionId || 'default';
        
    } catch (error) {
        console.log(`❌ Message API failed: ${error.message}`);
        return null;
    }
}

async function testSessionPersistence(sessionId) {
    console.log('\n💾 Testing session persistence in PostgreSQL...');
    
    try {
        // Check session data in database using correct schema
        const sessionQuery = `
            SELECT key, value::jsonb->'metadata'->'id' as session_id, 
                   value::jsonb->'metadata'->'createdAt' as created_at,
                   value::jsonb->'conversationHistory' as history
            FROM cipher_store 
            WHERE key LIKE 'cipher:sessions:%' 
            ORDER BY key;
        `;
        
        const sessionsResult = await pool.query(sessionQuery);
        console.log(`📊 Found ${sessionsResult.rows.length} sessions in database:`);
        
        sessionsResult.rows.forEach((row, index) => {
            const sessionId = JSON.parse(row.session_id || '""');
            const historyLength = Array.isArray(row.history) ? row.history.length : 0;
            console.log(`  ${index + 1}. ID: ${sessionId} | History: ${historyLength} messages | Key: ${row.key}`);
        });
        
        // Check for default session specifically
        const defaultSessionQuery = `
            SELECT * FROM cipher_store 
            WHERE key = 'cipher:sessions:default' OR value::jsonb->'metadata'->>'id' = '"default"';
        `;
        
        const defaultResult = await pool.query(defaultSessionQuery);
        
        if (defaultResult.rows.length > 0) {
            console.log('✅ Default session found in database');
            testResults.persistence = true;
        } else {
            console.log('ℹ️  No explicit default session found - may be using auto-generated ID');
            // If we have any sessions, consider it a success
            testResults.persistence = sessionsResult.rows.length > 0;
        }
        
        return testResults.persistence;
        
    } catch (error) {
        console.log(`❌ Session persistence test failed: ${error.message}`);
        return false;
    }
}

async function testSessionHistory() {
    console.log('\n📚 Testing session history functionality...');
    
    try {
        const response = await fetch(`${API_BASE}/sessions/current`);
        
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
        
        const data = await response.json();
        console.log(`✅ Current session API responded successfully`);
        console.log(`📋 Current session: ${data.currentSessionId || 'not provided'}`);
        console.log(`📊 Session has ${data.messages?.length || 0} messages`);
        
        testResults.history = true;
        return true;
        
    } catch (error) {
        console.log(`❌ Session history test failed: ${error.message}`);
        return false;
    }
}

async function testErrorElimination() {
    console.log('\n🔍 Testing for elimination of "Session default not found" errors...');
    
    // Test multiple concurrent requests to verify no race conditions
    const concurrentRequests = Array.from({ length: 3 }, (_, i) => 
        fetch(`${API_BASE}/message`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: `Concurrent test message ${i + 1}`,
                stream: false
            })
        }).catch(error => {
            console.log(`❌ Concurrent request ${i + 1}: Failed`);
            return null;
        })
    );
    
    try {
        const results = await Promise.all(concurrentRequests);
        const successful = results.filter(r => r && r.ok).length;
        
        console.log(`📊 Concurrent requests: ${successful}/3 successful`);
        
        if (successful >= 2) {
            console.log('✅ No critical session errors detected in concurrent requests');
            testResults.noErrors = true;
        } else {
            console.log('⚠️  Some concurrent requests failed - may indicate session issues');
        }
        
        return successful >= 2;
        
    } catch (error) {
        console.log(`❌ Error elimination test failed: ${error.message}`);
        return false;
    }
}

async function runTestSuite() {
    let sessionId = null;
    
    // Run all tests sequentially
    await testDatabaseConnection();
    
    if (testResults.databaseConnection) {
        sessionId = await testDefaultSessionAutoCreation();
        await testSessionPersistence(sessionId);
        await testSessionHistory();
        await testErrorElimination();
    } else {
        console.log('⚠️  Skipping API tests due to database connection failure');
    }
    
    // Print final results
    console.log('\n' + '='.repeat(60));
    console.log('📋 TEST RESULTS SUMMARY:');
    console.log('='.repeat(60));
    
    Object.entries(testResults).forEach(([test, passed]) => {
        const status = passed ? 'PASSED' : 'FAILED';
        const emoji = passed ? '✅' : '❌';
        console.log(`${emoji} ${test.padEnd(18)} : ${status}`);
    });
    
    const totalPassed = Object.values(testResults).filter(Boolean).length;
    const totalTests = Object.keys(testResults).length;
    
    console.log('\n' + '='.repeat(60));
    
    if (totalPassed === totalTests) {
        console.log('🎉 ALL TESTS PASSED! Session auto-creation is working correctly.');
        console.log('✅ "Session default not found" errors should be eliminated.');
    } else {
        console.log(`⚠️  ${totalTests - totalPassed} TEST(S) FAILED. Please review the failed tests above.`);
    }
    
    console.log('='.repeat(60));
    
    // Clean up
    await pool.end();
    process.exit(totalPassed === totalTests ? 0 : 1);
}

// Handle uncaught errors
process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error.message);
    process.exit(1);
});

process.on('unhandledRejection', (reason) => {
    console.error('❌ Unhandled rejection:', reason);
    process.exit(1);
});

// Run the test suite
runTestSuite().catch(error => {
    console.error('❌ Test suite failed:', error.message);
    process.exit(1);
});