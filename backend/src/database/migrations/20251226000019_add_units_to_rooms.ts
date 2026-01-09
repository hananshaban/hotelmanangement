import type { Knex } from 'knex';

/**
 * Migration to add units JSONB column to rooms table
 * Phase 2: Units Support (For Multi-Unit Rooms)
 * 
 * Units are stored as a JSONB array of unit objects matching Beds24 schema:
 * [
 *   {
 *     id: number (Beds24 unit ID),
 *     name: string,
 *     name2-8: string (optional),
 *     statusColor: string (optional),
 *     statusText: string (optional),
 *     note: string (optional)
 *   }
 * ]
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rooms', (table) => {
    table.jsonb('units').defaultTo('[]').comment('Array of unit objects for multi-unit rooms (Beds24 compatible)');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('rooms', (table) => {
    table.dropColumn('units');
  });
}



