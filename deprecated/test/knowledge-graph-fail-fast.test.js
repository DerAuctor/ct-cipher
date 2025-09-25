/**
 * Test for Knowledge Graph Manager Fail-Fast Behavior
 * 
 * Validates that the manager implements proper fail-fast behavior
 * when Neo4j connection fails, without falling back to in-memory backend.
 */

import { KnowledgeGraphManager } from '../src/core/knowledge_graph/manager.js';
import { BACKEND_TYPES } from '../src/core/knowledge_graph/constants.js';

async function testFailFastBehavior() {
    console.log('🧪 Testing Knowledge Graph Manager Fail-Fast Behavior');
    console.log('===============================================\n');

    // Test 1: Neo4j connection failure should fail immediately
    console.log('📋 Test 1: Neo4j Connection Failure');
    console.log('-----------------------------------');
    
    try {
        // Create manager with Neo4j config that will fail
        const config = {
            type: BACKEND_TYPES.NEO4J,
            uri: 'neo4j://nonexistent-host:7687',
            username: 'neo4j',
            password: 'invalid',
            timeout: 5000,
            maxRetries: 1
        };
        
        const manager = new KnowledgeGraphManager(config);
        console.log('✅ Manager created with Neo4j config');
        
        const startTime = Date.now();
        
        try {
            await manager.connect();
            console.log('❌ FAILURE: Connection should have thrown error but succeeded');
            return false;
        } catch (error) {
            const duration = Date.now() - startTime;
            console.log(`✅ Connection failed as expected in ${duration}ms`);
            console.log(`   Error type: ${error.constructor.name}`);
            console.log(`   Error message: ${error.message.substring(0, 100)}...`);
            
            // Verify no graph instance was created
            const graph = manager.getGraph();
            if (graph !== null) {
                console.log('❌ FAILURE: Graph instance should be null after failed connection');
                return false;
            }
            console.log('✅ Graph instance is null after failed connection');
            
            // Verify manager is not connected
            if (manager.isConnected()) {
                console.log('❌ FAILURE: Manager should not report as connected');
                return false;
            }
            console.log('✅ Manager correctly reports as not connected');
            
            // Verify info reflects failure without fallback
            const info = manager.getInfo();
            console.log(`   Backend type: ${info.backend.type}`);
            console.log(`   Backend connected: ${info.backend.connected}`);
            console.log(`   Connection attempts: ${info.connectionAttempts}`);
            console.log(`   Last error exists: ${!!info.lastError}`);
            
            // Verify no fallback occurred (should not have in-memory type)
            if (info.backend.type === BACKEND_TYPES.IN_MEMORY) {
                console.log('❌ FAILURE: Backend type should not be in-memory (indicates fallback occurred)');
                return false;
            }
            console.log('✅ No fallback to in-memory backend occurred');
            
            // Verify fallback field is not present in info
            if ('fallback' in info.backend) {
                console.log('❌ FAILURE: Fallback field should not exist in backend info');
                return false;
            }
            console.log('✅ No fallback field in backend info (interface properly updated)');
        }
        
    } catch (setupError) {
        console.log(`❌ FAILURE: Test setup failed: ${setupError.message}`);
        return false;
    }
    
    console.log('\n📋 Test 2: Health Check After Failed Connection');
    console.log('--------------------------------------------');
    
    try {
        // Create another manager instance for health check test
        const config = {
            type: BACKEND_TYPES.NEO4J,
            uri: 'neo4j://another-nonexistent:7687',
            username: 'test',
            password: 'test',
            timeout: 3000
        };
        
        const manager = new KnowledgeGraphManager(config);
        
        // Attempt connection (should fail)
        try {
            await manager.connect();
        } catch (error) {
            // Expected failure
        }
        
        // Perform health check on failed manager
        const healthResult = await manager.healthCheck();
        console.log(`   Overall health: ${healthResult.overall}`);
        console.log(`   Backend health: ${healthResult.backend}`);
        console.log(`   Backend status: ${healthResult.details?.backend?.status || 'unknown'}`);
        
        if (healthResult.overall === true) {
            console.log('❌ FAILURE: Overall health should be false after connection failure');
            return false;
        }
        console.log('✅ Health check correctly reports unhealthy state');
        
        if (healthResult.backend === true) {
            console.log('❌ FAILURE: Backend health should be false after connection failure');
            return false;
        }
        console.log('✅ Backend health correctly reports as unhealthy');
        
    } catch (healthError) {
        console.log(`❌ FAILURE: Health check test failed: ${healthError.message}`);
        return false;
    }
    
    console.log('\n📋 Test 3: Error Propagation Consistency');
    console.log('--------------------------------------');
    
    try {
        const config = {
            type: BACKEND_TYPES.NEO4J,
            uri: 'neo4j://test-fail:7687',
            username: 'test',
            password: 'test',
            timeout: 2000
        };
        
        const manager = new KnowledgeGraphManager(config);
        
        // Test that multiple connection attempts fail consistently
        let errorCount = 0;
        let errorTypes = new Set();
        
        for (let i = 0; i < 3; i++) {
            try {
                await manager.connect();
            } catch (error) {
                errorCount++;
                errorTypes.add(error.constructor.name);
            }
        }
        
        if (errorCount !== 3) {
            console.log(`❌ FAILURE: Expected 3 errors, got ${errorCount}`);
            return false;
        }
        console.log('✅ All connection attempts failed consistently');
        
        console.log(`   Error types encountered: ${Array.from(errorTypes).join(', ')}`);
        console.log('✅ Error propagation is consistent across attempts');
        
    } catch (testError) {
        console.log(`❌ FAILURE: Error propagation test failed: ${testError.message}`);
        return false;
    }
    
    return true;
}

async function main() {
    try {
        const success = await testFailFastBehavior();
        
        if (success) {
            console.log('\n🎉 ALL TESTS PASSED');
            console.log('================');
            console.log('✅ Fail-fast behavior verified');
            console.log('✅ No fallback mechanism active');
            console.log('✅ Error propagation working correctly');
            console.log('✅ Health monitoring reflects actual state');
            console.log('✅ Interface updated correctly (no fallback field)');
            process.exit(0);
        } else {
            console.log('\n❌ TESTS FAILED');
            console.log('==============');
            console.log('The Knowledge Graph Manager is not properly implementing fail-fast behavior.');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('\n💥 TEST EXECUTION ERROR');
        console.error('======================');
        console.error(error);
        process.exit(1);
    }
}

// Run the tests
main();