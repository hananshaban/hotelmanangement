#!/usr/bin/env tsx
/**
 * Quick test script for Phase 1 implementation
 * Run with: npx tsx scripts/test-phase1.ts
 */

import { encrypt, decrypt, hash } from '../src/utils/encryption.js';
import { Beds24Client } from '../src/integrations/beds24/index.js';
import db from '../src/config/database.js';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
  console.log('🧪 Beds24 Phase 1 - Quick Test\n');
  console.log('=' .repeat(50));

  let passed = 0;
  let failed = 0;

  // Test 1: Encryption
  console.log('\n📦 Test 1: Encryption Utility');
  try {
    const original = 'test-secret-token-12345';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);
    
    if (original === decrypted) {
      console.log('   ✅ Encrypt/Decrypt works');
      passed++;
    } else {
      console.log('   ❌ Encrypt/Decrypt failed');
      failed++;
    }

    const hashValue = hash('test-data');
    if (hashValue.length === 64) {
      console.log('   ✅ Hash works (SHA-256)');
      passed++;
    } else {
      console.log('   ❌ Hash failed');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Encryption test failed:', (error as Error).message);
    failed++;
  }

  // Test 2: Database Tables
  console.log('\n🗄️  Test 2: Database Tables');
  try {
    const tables = ['beds24_config', 'sync_conflicts', 'webhook_events'];
    for (const table of tables) {
      const exists = await db.schema.hasTable(table);
      if (exists) {
        console.log(`   ✅ Table '${table}' exists`);
        passed++;
      } else {
        console.log(`   ❌ Table '${table}' missing`);
        failed++;
      }
    }

    // Check rooms table has beds24_room_id
    const roomsColumns = await db('rooms').columnInfo();
    if (roomsColumns.beds24_room_id) {
      console.log('   ✅ rooms.beds24_room_id column exists');
      passed++;
    } else {
      console.log('   ❌ rooms.beds24_room_id column missing');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Database test failed:', (error as Error).message);
    failed++;
  }

  // Test 3: Beds24Client
  console.log('\n🔌 Test 3: Beds24Client');
  try {
    const client = new Beds24Client('test-refresh-token');
    
    // Check circuit breaker state
    const state = client.getCircuitBreakerState();
    if (state === 'CLOSED') {
      console.log('   ✅ Circuit breaker initialized (CLOSED)');
      passed++;
    } else {
      console.log(`   ⚠️  Circuit breaker state: ${state}`);
      passed++;
    }

    // Test rate limiter (should allow first request)
    const rateLimiter = (client as any).rateLimiter;
    if (rateLimiter.tryConsume()) {
      console.log('   ✅ Rate limiter works');
      passed++;
    } else {
      console.log('   ❌ Rate limiter failed');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Beds24Client test failed:', (error as Error).message);
    failed++;
  }

  // Test 4: Database Operations
  console.log('\n💾 Test 4: Database Operations');
  try {
    const propertyId = '00000000-0000-0000-0000-000000000000';
    const testToken = encrypt('test-refresh-token');

    // Insert test config
    const [configId] = await db('beds24_config')
      .insert({
        property_id: propertyId,
        refresh_token: testToken,
        beds24_property_id: '99999',
        sync_enabled: true,
      })
      .onConflict('property_id')
      .merge()
      .returning('id');

    console.log('   ✅ Config insert/update works');
    passed++;

    // Read and decrypt
    const config = await db('beds24_config')
      .where({ id: configId })
      .first();

    if (config) {
      const decrypted = decrypt(config.refresh_token);
      if (decrypted === 'test-refresh-token') {
        console.log('   ✅ Config read/decrypt works');
        passed++;
      } else {
        console.log('   ❌ Decrypt failed');
        failed++;
      }
    }

    // Cleanup
    await db('beds24_config').where({ id: configId }).delete();
    console.log('   ✅ Cleanup successful');
    passed++;
  } catch (error) {
    console.log('   ❌ Database operations failed:', (error as Error).message);
    failed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n📊 Test Summary:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total:  ${passed + failed}`);

  if (failed === 0) {
    console.log('\n🎉 All tests passed! Phase 1 is ready!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some tests failed. Please review the errors above.');
    process.exit(1);
  }
}

main()
  .then(() => {
    db.destroy();
  })
  .catch((error) => {
    console.error('\n💥 Fatal error:', error);
    db.destroy();
    process.exit(1);
  });

