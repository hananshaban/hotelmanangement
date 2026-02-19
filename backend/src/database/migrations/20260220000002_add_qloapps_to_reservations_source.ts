import type { Knex } from 'knex';

/**
 * Migration: Expand reservations.source constraint to include 'QloApps'
 *
 * Why: QloApps pull sync marks pulled reservations with source='QloApps' so that
 * the outbound sync hooks can detect and skip them (preventing an infinite push-back loop).
 * Without this migration the INSERT would violate the existing CHECK constraint.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS check_reservations_source;
  `);

  await knex.schema.raw(`
    ALTER TABLE reservations
    ADD CONSTRAINT check_reservations_source
    CHECK (source IN ('Direct', 'Beds24', 'Booking.com', 'Expedia', 'QloApps', 'Other'));
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.raw(`
    ALTER TABLE reservations
    DROP CONSTRAINT IF EXISTS check_reservations_source;
  `);

  await knex.schema.raw(`
    ALTER TABLE reservations
    ADD CONSTRAINT check_reservations_source
    CHECK (source IN ('Direct', 'Beds24', 'Booking.com', 'Expedia', 'Other'));
  `);
}

