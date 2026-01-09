import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('maintenance_requests', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('room_id')
      .notNullable()
      .references('id')
      .inTable('rooms')
      .onDelete('RESTRICT');
    table.string('title', 255).notNullable();
    table.text('description').notNullable();
    table
      .string('priority', 50)
      .notNullable()
      .defaultTo('Medium');
    table
      .string('status', 50)
      .notNullable()
      .defaultTo('Open');
    table
      .uuid('assigned_to')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.timestamp('completed_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  // Check constraints
  await knex.schema.raw(`
    ALTER TABLE maintenance_requests 
    ADD CONSTRAINT check_maintenance_requests_priority 
    CHECK (priority IN ('Low', 'Medium', 'High', 'Urgent'));
  `);

  await knex.schema.raw(`
    ALTER TABLE maintenance_requests 
    ADD CONSTRAINT check_maintenance_requests_status 
    CHECK (status IN ('Open', 'In Progress', 'Repaired'));
  `);

  // Indexes
  await knex.schema.raw(`
    CREATE INDEX idx_maintenance_requests_room_id ON maintenance_requests(room_id);
    CREATE INDEX idx_maintenance_requests_status ON maintenance_requests(status);
    CREATE INDEX idx_maintenance_requests_priority ON maintenance_requests(priority);
    CREATE INDEX idx_maintenance_requests_assigned_to ON maintenance_requests(assigned_to);
    CREATE INDEX idx_maintenance_requests_created_at ON maintenance_requests(created_at);
    CREATE INDEX idx_maintenance_requests_deleted_at ON maintenance_requests(deleted_at) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('maintenance_requests');
}



