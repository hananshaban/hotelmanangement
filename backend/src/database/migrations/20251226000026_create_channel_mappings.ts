import type { Knex } from 'knex';

/**
 * Migration: Create channel_mappings table
 * Purpose: Store mappings between PMS entities and channel entities (rooms, rates, etc.)
 * Also migrates existing rooms.beds24_room_id data to this table
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channel_mappings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Reference to hotel_settings (single property system)
    table
      .uuid('property_id')
      .notNullable()
      .defaultTo(knex.raw("'00000000-0000-0000-0000-000000000001'::uuid"))
      .references('id')
      .inTable('hotel_settings')
      .onDelete('CASCADE');
    
    // Mapping type
    table.string('mapping_type', 50).notNullable().comment('room, room_type, rate, etc.');
    
    // Entity identifiers
    table.uuid('internal_id').notNullable().comment('PMS entity ID (room.id, room_type.id, etc.)');
    table.string('external_id', 255).notNullable().comment('Channel entity ID (Beds24 room ID, etc.)');
    
    // Active status
    table.boolean('is_active').defaultTo(true);
    
    // Timestamps
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Check constraint for mapping_type
  await knex.schema.raw(`
    ALTER TABLE channel_mappings 
    ADD CONSTRAINT check_channel_mappings_type 
    CHECK (mapping_type IN ('room', 'room_type', 'rate', 'property'));
  `);

  // Unique constraint: one mapping per property + type + internal_id
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_channel_mappings_unique_internal 
    ON channel_mappings(property_id, mapping_type, internal_id);
  `);

  // Unique constraint: one mapping per property + type + external_id
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_channel_mappings_unique_external 
    ON channel_mappings(property_id, mapping_type, external_id);
  `);

  // Index for lookups (mapping_type + internal_id + is_active)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_mappings_lookup 
    ON channel_mappings(mapping_type, internal_id, is_active) 
    WHERE is_active = true;
  `);

  // Index for reverse lookups (external_id)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_mappings_external 
    ON channel_mappings(mapping_type, external_id, is_active) 
    WHERE is_active = true;
  `);

  // Migrate existing rooms.beds24_room_id data to channel_mappings
  const propertyId = '00000000-0000-0000-0000-000000000001';
  
  // Check if rooms table exists and has beds24_room_id column
  const hasBeds24RoomId = await knex.schema.hasColumn('rooms', 'beds24_room_id');
  
  if (hasBeds24RoomId) {
    // Get all rooms with beds24_room_id
    const roomsWithMapping = await knex('rooms')
      .select('id', 'beds24_room_id')
      .whereNotNull('beds24_room_id')
      .where('beds24_room_id', '!=', '');

    if (roomsWithMapping.length > 0) {
      // Insert mappings
      const mappings = roomsWithMapping.map((room) => ({
        property_id: propertyId,
        mapping_type: 'room',
        internal_id: room.id,
        external_id: room.beds24_room_id,
        is_active: true,
      }));

      await knex('channel_mappings').insert(mappings);
    }
  }
}

export async function down(knex: Knex): Promise<void> {
  // Note: We don't restore beds24_room_id values on rollback
  // as we can't determine which rooms had mappings originally
  await knex.schema.dropTableIfExists('channel_mappings');
}

