import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('audit_logs', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('user_id')
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('entity_type', 100).notNullable();
    table.uuid('entity_id').notNullable();
    table.jsonb('before_state');
    table.jsonb('after_state');
    table.string('ip_address', 45); // IPv6 max length
    table.text('user_agent');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Indexes
  await knex.schema.raw(`
    CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX idx_audit_logs_entity_type ON audit_logs(entity_type);
    CREATE INDEX idx_audit_logs_entity_id ON audit_logs(entity_id);
    CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX idx_audit_logs_action ON audit_logs(action);
    CREATE INDEX idx_audit_logs_entity_lookup ON audit_logs(entity_type, entity_id);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('audit_logs');
}



