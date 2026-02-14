import type { Knex } from 'knex';

/**
 * Migration: Update hotels table schema to match code expectations
 * 
 * Purpose: Align database schema with the Hotel interface and controller code
 * 
 * Changes:
 * - Add missing columns: date_format, time_format, hotel_website, hotel_logo_url, hotel_state, hotel_postal_code
 * - Rename columns: address -> hotel_address, city -> hotel_city, country -> hotel_country, 
 *   phone -> hotel_phone, email -> hotel_email, tax_rate -> tax_percentage
 */
export async function up(knex: Knex): Promise<void> {
  // Check if table exists (it might be hotels or hotel_settings depending on migration state)
  const tableName = (await knex.schema.hasTable('hotels')) ? 'hotels' : 'hotel_settings';
  
  // Add new columns (check first, then add)
  if (!(await knex.schema.hasColumn(tableName, 'date_format'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('date_format', 20).defaultTo('YYYY-MM-DD').comment('Date format for display');
    });
  }
  
  if (!(await knex.schema.hasColumn(tableName, 'time_format'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('time_format', 20).defaultTo('HH:mm').comment('Time format for display');
    });
  }
  
  if (!(await knex.schema.hasColumn(tableName, 'hotel_website'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('hotel_website', 255).nullable().comment('Hotel website URL');
    });
  }
  
  if (!(await knex.schema.hasColumn(tableName, 'hotel_logo_url'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('hotel_logo_url', 500).nullable().comment('Hotel logo URL');
    });
  }
  
  if (!(await knex.schema.hasColumn(tableName, 'hotel_state'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('hotel_state', 100).nullable().comment('Hotel state/province');
    });
  }
  
  if (!(await knex.schema.hasColumn(tableName, 'hotel_postal_code'))) {
    await knex.schema.alterTable(tableName, (table) => {
      table.string('hotel_postal_code', 20).nullable().comment('Hotel postal/zip code');
    });
  }

  // Rename existing columns (only if they exist and new names don't exist)
  const hasAddress = await knex.schema.hasColumn(tableName, 'address');
  const hasHotelAddress = await knex.schema.hasColumn(tableName, 'hotel_address');
  if (hasAddress && !hasHotelAddress) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('address', 'hotel_address');
    });
  }

  const hasCity = await knex.schema.hasColumn(tableName, 'city');
  const hasHotelCity = await knex.schema.hasColumn(tableName, 'hotel_city');
  if (hasCity && !hasHotelCity) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('city', 'hotel_city');
    });
  }

  const hasCountry = await knex.schema.hasColumn(tableName, 'country');
  const hasHotelCountry = await knex.schema.hasColumn(tableName, 'hotel_country');
  if (hasCountry && !hasHotelCountry) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('country', 'hotel_country');
    });
  }

  const hasPhone = await knex.schema.hasColumn(tableName, 'phone');
  const hasHotelPhone = await knex.schema.hasColumn(tableName, 'hotel_phone');
  if (hasPhone && !hasHotelPhone) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('phone', 'hotel_phone');
    });
  }

  const hasEmail = await knex.schema.hasColumn(tableName, 'email');
  const hasHotelEmail = await knex.schema.hasColumn(tableName, 'hotel_email');
  if (hasEmail && !hasHotelEmail) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('email', 'hotel_email');
    });
  }

  const hasTaxRate = await knex.schema.hasColumn(tableName, 'tax_rate');
  const hasTaxPercentage = await knex.schema.hasColumn(tableName, 'tax_percentage');
  if (hasTaxRate && !hasTaxPercentage) {
    // First, copy data from tax_rate to tax_percentage
    await knex.raw(`
      ALTER TABLE ${tableName} 
      ADD COLUMN tax_percentage DECIMAL(5, 2) DEFAULT 0.0;
    `);
    
    await knex.raw(`
      UPDATE ${tableName} 
      SET tax_percentage = tax_rate 
      WHERE tax_percentage IS NULL;
    `);
    
    // Then drop the old column
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('tax_rate');
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const tableName = (await knex.schema.hasTable('hotels')) ? 'hotels' : 'hotel_settings';
  
  // Remove new columns (check first, then remove)
  if (await knex.schema.hasColumn(tableName, 'date_format')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('date_format');
    });
  }
  
  if (await knex.schema.hasColumn(tableName, 'time_format')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('time_format');
    });
  }
  
  if (await knex.schema.hasColumn(tableName, 'hotel_website')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('hotel_website');
    });
  }
  
  if (await knex.schema.hasColumn(tableName, 'hotel_logo_url')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('hotel_logo_url');
    });
  }
  
  if (await knex.schema.hasColumn(tableName, 'hotel_state')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('hotel_state');
    });
  }
  
  if (await knex.schema.hasColumn(tableName, 'hotel_postal_code')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('hotel_postal_code');
    });
  }

  // Rename columns back
  if (await knex.schema.hasColumn(tableName, 'hotel_address')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('hotel_address', 'address');
    });
  }

  if (await knex.schema.hasColumn(tableName, 'hotel_city')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('hotel_city', 'city');
    });
  }

  if (await knex.schema.hasColumn(tableName, 'hotel_country')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('hotel_country', 'country');
    });
  }

  if (await knex.schema.hasColumn(tableName, 'hotel_phone')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('hotel_phone', 'phone');
    });
  }

  if (await knex.schema.hasColumn(tableName, 'hotel_email')) {
    await knex.schema.alterTable(tableName, (table) => {
      table.renameColumn('hotel_email', 'email');
    });
  }

  if (await knex.schema.hasColumn(tableName, 'tax_percentage')) {
    // Copy data back and drop tax_percentage
    await knex.raw(`
      ALTER TABLE ${tableName} 
      ADD COLUMN tax_rate DECIMAL(5, 2) DEFAULT 0.0;
    `);
    
    await knex.raw(`
      UPDATE ${tableName} 
      SET tax_rate = tax_percentage 
      WHERE tax_rate IS NULL;
    `);
    
    await knex.schema.alterTable(tableName, (table) => {
      table.dropColumn('tax_percentage');
    });
  }
}

