import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('invoices', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table
      .uuid('reservation_id')
      .references('id')
      .inTable('reservations')
      .onDelete('SET NULL');
    table
      .uuid('guest_id')
      .notNullable()
      .references('id')
      .inTable('guests')
      .onDelete('RESTRICT');
    table.date('issue_date').notNullable();
    table.date('due_date').notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table
      .string('status', 50)
      .notNullable()
      .defaultTo('Pending');
    table
      .string('payment_method', 50);
    table.text('notes');
    table.timestamp('paid_at', { useTz: true });
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  // Check constraints
  await knex.schema.raw(`
    ALTER TABLE invoices 
    ADD CONSTRAINT check_invoices_status 
    CHECK (status IN ('Pending', 'Paid', 'Cancelled'));
  `);

  await knex.schema.raw(`
    ALTER TABLE invoices 
    ADD CONSTRAINT check_invoices_payment_method 
    CHECK (payment_method IS NULL OR payment_method IN ('Cash', 'Card', 'Online', 'Bank Transfer', 'Other'));
  `);

  await knex.schema.raw(`
    ALTER TABLE invoices 
    ADD CONSTRAINT check_invoices_dates 
    CHECK (due_date >= issue_date);
  `);

  // Indexes
  await knex.schema.raw(`
    CREATE INDEX idx_invoices_reservation_id ON invoices(reservation_id);
    CREATE INDEX idx_invoices_guest_id ON invoices(guest_id);
    CREATE INDEX idx_invoices_status ON invoices(status);
    CREATE INDEX idx_invoices_issue_date ON invoices(issue_date);
    CREATE INDEX idx_invoices_due_date ON invoices(due_date);
    CREATE INDEX idx_invoices_deleted_at ON invoices(deleted_at) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('invoices');
}



