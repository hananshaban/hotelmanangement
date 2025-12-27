import type { Knex } from 'knex';

/**
 * Migration: Create channel_events table
 * Purpose: Store all events (inbound/outbound) for deduplication, DLQ, and replay
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('channel_events', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    
    // Reference to hotel_settings (single property system)
    table
      .uuid('property_id')
      .notNullable()
      .defaultTo(knex.raw("'00000000-0000-0000-0000-000000000001'::uuid"))
      .references('id')
      .inTable('hotel_settings')
      .onDelete('CASCADE');
    
    // Event direction and source
    table.string('direction', 10).notNullable().comment('inbound or outbound');
    table.string('source', 50).notNullable().comment('beds24, pms, etc.');
    
    // Event type and entity information
    table.string('event_type', 100).notNullable().comment('booking.created, availability.updated, etc.');
    table.string('entity_type', 50).notNullable().comment('booking, availability, rate, etc.');
    
    // Entity identifiers
    table.string('entity_external_id', 255).comment('Beds24/OTA ID');
    table.uuid('entity_internal_id').comment('PMS ID (reservation.id, room.id, etc.)');
    
    // Idempotency key for deduplication
    table.string('idempotency_key', 255).notNullable();
    
    // Event payload
    table.jsonb('payload').notNullable().comment('Raw event payload');
    
    // Processing status
    table
      .string('status', 20)
      .notNullable()
      .defaultTo('received')
      .comment('received, processing, done, failed');
    
    // Retry tracking
    table.integer('attempts').defaultTo(0);
    table.integer('max_attempts').defaultTo(3);
    table.text('last_error').comment('Last error message if failed');
    
    // Timestamps
    table.timestamp('received_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('processed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Check constraint for direction
  await knex.schema.raw(`
    ALTER TABLE channel_events 
    ADD CONSTRAINT check_channel_events_direction 
    CHECK (direction IN ('inbound', 'outbound'));
  `);

  // Check constraint for status
  await knex.schema.raw(`
    ALTER TABLE channel_events 
    ADD CONSTRAINT check_channel_events_status 
    CHECK (status IN ('received', 'processing', 'done', 'failed'));
  `);

  // Unique index for idempotency key (critical for deduplication)
  await knex.schema.raw(`
    CREATE UNIQUE INDEX idx_channel_events_idempotency_key 
    ON channel_events(idempotency_key);
  `);

  // Index for status queries (DLQ listing, filtering)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_events_status_received 
    ON channel_events(status, received_at);
  `);

  // Index for external ID lookups (Beds24 booking ID, etc.)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_events_external_id 
    ON channel_events(entity_external_id) 
    WHERE entity_external_id IS NOT NULL;
  `);

  // Index for internal ID lookups (PMS reservation ID, etc.)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_events_internal_id 
    ON channel_events(entity_type, entity_internal_id) 
    WHERE entity_internal_id IS NOT NULL;
  `);

  // Index for property + status (admin filtering)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_events_property_status 
    ON channel_events(property_id, status, received_at);
  `);

  // Partial index for failed events (DLQ queries)
  await knex.schema.raw(`
    CREATE INDEX idx_channel_events_dlq 
    ON channel_events(status, received_at) 
    WHERE status = 'failed';
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('channel_events');
}

