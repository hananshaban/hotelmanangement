import type { Knex } from 'knex';
import bcrypt from 'bcrypt';

export async function seed(knex: Knex): Promise<void> {
  // Check if admin user already exists
  const existing = await knex('users')
    .where({ email: 'admin@hotel.com' })
    .first();

  // Hash password: "admin123" (change in production!)
  const passwordHash = await bcrypt.hash('admin123', 10);

  if (existing) {
    // Update existing user to ensure it's SUPER_ADMIN
    if (existing.role !== 'SUPER_ADMIN') {
      await knex('users')
        .where({ email: 'admin@hotel.com' })
        .update({
          role: 'SUPER_ADMIN',
          password_hash: passwordHash, // Update password in case it was changed
          is_active: true,
          updated_at: knex.fn.now(),
        });
      console.log('✅ Admin user updated to SUPER_ADMIN');
    } else {
      console.log('✅ Admin user already exists as SUPER_ADMIN, skipping seed');
    }
  } else {
    // Create new admin user as SUPER_ADMIN
    await knex('users').insert({
      email: 'admin@hotel.com',
      password_hash: passwordHash,
      first_name: 'Admin',
      last_name: 'User',
      role: 'SUPER_ADMIN',
      is_active: true,
    });
    console.log('✅ Admin user seeded as SUPER_ADMIN');
  }

  console.log('📧 Email: admin@hotel.com');
  console.log('🔑 Password: admin123');
  console.log('👤 Role: SUPER_ADMIN');
  console.log('⚠️  Please change the password after first login!');
}

