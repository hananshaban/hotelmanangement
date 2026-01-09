import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('expenses', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('category', 50).notNullable();
    table.decimal('amount', 10, 2).notNullable();
    table.date('expense_date').notNullable();
    table.text('notes');
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('updated_at', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('deleted_at', { useTz: true });
  });

  // Check constraints
  await knex.schema.raw(`
    ALTER TABLE expenses 
    ADD CONSTRAINT check_expenses_category 
    CHECK (category IN ('Utilities', 'Maintenance', 'Staff', 'Supplies', 'Marketing', 'Insurance', 'Taxes', 'Other'));
  `);

  await knex.schema.raw(`
    ALTER TABLE expenses 
    ADD CONSTRAINT check_expenses_amount 
    CHECK (amount > 0);
  `);

  // Indexes
  await knex.schema.raw(`
    CREATE INDEX idx_expenses_category ON expenses(category);
    CREATE INDEX idx_expenses_expense_date ON expenses(expense_date);
    CREATE INDEX idx_expenses_deleted_at ON expenses(deleted_at) WHERE deleted_at IS NULL;
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('expenses');
}



