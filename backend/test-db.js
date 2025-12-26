import db from './src/config/database.js';

/**
 * Test database connection
 */
async function testConnection() {
  try {
    console.log('🔍 Testing database connection...\n');

    // Test basic query
    const result = await db.raw('SELECT NOW() as current_time, version() as pg_version');
    console.log('✅ Database connection successful!');
    console.log(`📅 Current time: ${result.rows[0].current_time}`);
    console.log(`🐘 PostgreSQL version: ${result.rows[0].pg_version.split(',')[0]}\n`);

    // Check if uuid extension is enabled
    const uuidCheck = await db.raw(
      "SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') as uuid_enabled"
    );
    console.log(`🔑 UUID extension: ${uuidCheck.rows[0].uuid_enabled ? '✅ Enabled' : '❌ Not enabled'}`);

    // List all tables
    const tables = await db.raw(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    console.log('\n📊 Tables in database:');
    if (tables.rows.length === 0) {
      console.log('  (No tables found - run migrations first)');
    } else {
      tables.rows.forEach((row) => {
        console.log(`  - ${row.table_name}`);
      });
    }

    // Check migrations
    const migrations = await db('knex_migrations')
      .select('*')
      .orderBy('id', 'desc')
      .catch(() => []);

    console.log('\n📦 Migrations run:');
    if (migrations.length === 0) {
      console.log('  (No migrations run yet)');
    } else {
      migrations.forEach((migration) => {
        console.log(`  - ${migration.name} (Batch ${migration.batch})`);
      });
    }

    console.log('\n✅ All checks passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Database connection failed:');
    console.error(error.message);
    console.error('\nPlease check:');
    console.error('  1. PostgreSQL is running');
    console.error('  2. Database credentials in .env are correct');
    console.error('  3. Database exists (run setup-db.sh)');
    process.exit(1);
  }
}

testConnection();
