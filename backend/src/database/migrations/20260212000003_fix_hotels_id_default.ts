import type { Knex } from 'knex';

/**
 * Migration: Fix hotels table id column default value
 * 
 * Purpose: Change the id column default from fixed UUID to gen_random_uuid()
 * 
 * Problem:
 * - Original migration set fixed default UUID for single-hotel system
 * - When creating new hotels, they get the same default ID causing duplicate key errors
 * 
 * Solution:
 * - Change default to gen_random_uuid() so new hotels get unique IDs automatically
 * - Default hotel (ID: 00000000-0000-0000-0000-000000000000) remains unchanged
 *   since it's created with explicit ID in seed file
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table exists
  const tableExists = await knex.schema.hasTable('hotels');
  if (!tableExists) {
    console.log('Hotels table does not exist, skipping migration');
    return;
  }

  // Get current default value
  const currentDefault = await knex.raw(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'hotels'
      AND column_name = 'id';
  `);

  const defaultValue = currentDefault.rows[0]?.column_default || '';

  // Only change if it's the fixed UUID default
  if (defaultValue.includes('00000000-0000-0000-0000-000000000000')) {
    console.log('Changing hotels.id default from fixed UUID to gen_random_uuid()');
    
    // Alter the column to use gen_random_uuid() as default
    await knex.raw(`
      ALTER TABLE hotels
      ALTER COLUMN id SET DEFAULT gen_random_uuid();
    `);
    
    console.log('✓ Successfully changed hotels.id default to gen_random_uuid()');
  } else {
    console.log('Hotels.id default is already set to gen_random_uuid() or different value, skipping');
  }
}

export async function down(knex: Knex): Promise<void> {
  // Restore the fixed UUID default (for rollback scenarios)
  const tableExists = await knex.schema.hasTable('hotels');
  if (!tableExists) {
    return;
  }

  await knex.raw(`
    ALTER TABLE hotels
    ALTER COLUMN id SET DEFAULT '00000000-0000-0000-0000-000000000000'::uuid;
  `);
  
  console.log('✓ Restored hotels.id default to fixed UUID');
}

